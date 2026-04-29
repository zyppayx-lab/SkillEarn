// users.js
// FINAL PRODUCTION VERSION
// OTP Verification + Country Support + Login Protection + Dashboard + Wallet + Withdrawals + Notifications

const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { Resend } = require("resend");

const router = express.Router();

const resend = new Resend(
  process.env.RESEND_API_KEY
);

/* ==========================================
   AUTH MIDDLEWARE
========================================== */
function auth(req, res, next) {
  const header =
    req.headers.authorization || "";

  const token =
    header.replace("Bearer ", "");

  try {
    req.user = jwt.verify(
      token,
      process.env.JWT_SECRET
    );
    next();
  } catch {
    return res.status(401).json({
      message: "Unauthorized"
    });
  }
}

/* ==========================================
   SEND OTP EMAIL
========================================== */
async function sendOTP(email, code) {
  try {
    console.log("Sending OTP to:", email);

    const response =
      await resend.emails.send({
        from: process.env.FROM_EMAIL,
        to: email,
        subject: "Verify your SkillEarn account",
        html: `
          <h2>SkillEarn Verification</h2>
          <p>Your OTP Code:</p>
          <h1>${code}</h1>
          <p>This code expires in 10 minutes.</p>
        `
      });

    console.log(
      "EMAIL RESPONSE:",
      JSON.stringify(response)
    );

  } catch (error) {
    console.error(
      "EMAIL ERROR:",
      error
    );
  }
}

/* ==========================================
   REGISTER
========================================== */
router.post(
  "/api/auth/register",
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const {
        name,
        email,
        password,
        country
      } = req.body;

      if (
        !name ||
        !email ||
        !password
      ) {
        return res.status(400).json({
          message:
            "Missing required fields"
        });
      }

      const check =
        await pool.query(
          "SELECT id FROM users WHERE email=$1",
          [email]
        );

      if (
        check.rows.length > 0
      ) {
        return res.status(400).json({
          message:
            "Email already registered"
        });
      }

      const hashed =
        await bcrypt.hash(
          password,
          10
        );

      const otp =
        Math.floor(
          100000 +
          Math.random() *
          900000
        ).toString();

      await pool.query(
        `
        INSERT INTO users
        (
          name,
          email,
          password_hash,
          role,
          balance,
          status,
          email_verified,
          otp_code,
          otp_expires,
          country
        )
        VALUES
        (
          $1,$2,$3,
          'user',
          0,
          'active',
          false,
          $4,
          NOW() + INTERVAL '10 minutes',
          $5
        )
        `,
        [
          name,
          email,
          hashed,
          otp,
          country || "NG"
        ]
      );

      await sendOTP(email, otp);

      res.json({
        message:
          "Registration successful. OTP sent to email."
      });

    } catch (error) {
      res.status(500).json({
        message: error.message
      });
    }
  }
);

/* ==========================================
   VERIFY EMAIL
========================================== */
router.post(
  "/api/auth/verify-email",
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const { email, otp } =
        req.body;

      const result =
        await pool.query(
          `
          SELECT id
          FROM users
          WHERE email=$1
          AND otp_code=$2
          AND otp_expires > NOW()
          `,
          [email, otp]
        );

      if (
        result.rows.length === 0
      ) {
        return res.status(400).json({
          message:
            "Invalid or expired OTP"
        });
      }

      await pool.query(
        `
        UPDATE users
        SET
          email_verified=true,
          otp_code=NULL,
          otp_expires=NULL
        WHERE email=$1
        `,
        [email]
      );

      res.json({
        message:
          "Email verified successfully"
      });

    } catch (error) {
      res.status(500).json({
        message:
          error.message
      });
    }
  }
);

/* ==========================================
   RESEND OTP
========================================== */
router.post(
  "/api/auth/resend-otp",
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const { email } =
        req.body;

      const otp =
        Math.floor(
          100000 +
          Math.random() *
          900000
        ).toString();

      await pool.query(
        `
        UPDATE users
        SET
          otp_code=$1,
          otp_expires=
          NOW() + INTERVAL '10 minutes'
        WHERE email=$2
        `,
        [otp, email]
      );

      await sendOTP(email, otp);

      res.json({
        message: "OTP resent"
      });

    } catch (error) {
      res.status(500).json({
        message:
          error.message
      });
    }
  }
);

/* ==========================================
   LOGIN
========================================== */
router.post(
  "/api/auth/login",
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const {
        email,
        password
      } = req.body;

      const result =
        await pool.query(
          "SELECT * FROM users WHERE email=$1",
          [email]
        );

      if (
        result.rows.length === 0
      ) {
        return res.status(400).json({
          message: "Invalid login"
        });
      }

      const user =
        result.rows[0];

      const valid =
        await bcrypt.compare(
          password,
          user.password_hash
        );

      if (!valid) {
        return res.status(400).json({
          message: "Invalid login"
        });
      }

      if (
        user.email_verified !== true
      ) {
        return res.status(403).json({
          message:
            "Please verify your email first"
        });
      }

      const token =
        jwt.sign(
          {
            id: user.id,
            email: user.email,
            role: "user",
            country: user.country
          },
          process.env.JWT_SECRET,
          { expiresIn: "7d" }
        );

      res.json({
        message:
          "Login successful",
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          country: user.country
        }
      });

    } catch (error) {
      res.status(500).json({
        message:
          error.message
      });
    }
  }
);

/* ==========================================
   DASHBOARD
========================================== */
router.get(
  "/api/users/dashboard",
  auth,
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const profile =
        await pool.query(
          `
          SELECT id,name,email,balance,status
          FROM users
          WHERE id=$1
          `,
          [req.user.id]
        );

      const pending =
        await pool.query(
          `
          SELECT COUNT(*) total
          FROM submissions
          WHERE user_id=$1
          AND status='PENDING'
          `,
          [req.user.id]
        );

      const approved =
        await pool.query(
          `
          SELECT COUNT(*) total
          FROM submissions
          WHERE user_id=$1
          AND status='APPROVED'
          `,
          [req.user.id]
        );

      const tasks =
        await pool.query(
          `
          SELECT COUNT(*) total
          FROM tasks
          WHERE status='ACTIVE'
          `
        );

      res.json({
        profile: profile.rows[0],
        pending: pending.rows[0].total,
        approved: approved.rows[0].total,
        available_tasks:
          tasks.rows[0].total
      });

    } catch (error) {
      res.status(500).json({
        message: error.message
      });
    }
  }
);

/* ==========================================
   WALLET
========================================== */
router.get(
  "/api/users/wallet",
  auth,
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const result =
        await pool.query(
          `
          SELECT balance
          FROM users
          WHERE id=$1
          `,
          [req.user.id]
        );

      res.json({
        balance:
          result.rows[0]?.balance || 0,
        currency: "NGN"
      });

    } catch (error) {
      res.status(500).json({
        message: error.message
      });
    }
  }
);

/* ==========================================
   WITHDRAW
========================================== */
router.post(
  "/api/users/withdraw",
  auth,
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const {
        amount,
        bank_name,
        account_name,
        account_number
      } = req.body;

      const bal =
        await pool.query(
          `
          SELECT balance
          FROM users
          WHERE id=$1
          `,
          [req.user.id]
        );

      const balance =
        Number(
          bal.rows[0].balance || 0
        );

      if (
        Number(amount) >
        balance
      ) {
        return res.status(400).json({
          message:
            "Insufficient balance"
        });
      }

      await pool.query(
        `
        INSERT INTO withdrawals
        (
          user_id,
          amount,
          bank_name,
          account_name,
          account_number,
          status
        )
        VALUES
        ($1,$2,$3,$4,$5,'PENDING')
        `,
        [
          req.user.id,
          amount,
          bank_name,
          account_name,
          account_number
        ]
      );

      await pool.query(
        `
        UPDATE users
        SET balance=balance-$1
        WHERE id=$2
        `,
        [
          amount,
          req.user.id
        ]
      );

      res.json({
        message:
          "Withdrawal request sent"
      });

    } catch (error) {
      res.status(500).json({
        message:
          error.message
      });
    }
  }
);

module.exports = router;
