// business.js
// FINAL PRODUCTION VERSION
// OTP Email Verification + Admin Approval
// Dashboard + Payments + Jobs
// Existing features preserved

const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { Resend } = require("resend");

const router = express.Router();

const resend = new Resend(
  process.env.RESEND_API_KEY
);

/* ==========================================
   AUTH
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

function businessOnly(
  req,
  res,
  next
) {
  if (
    req.user.role !== "vendor" &&
    req.user.role !== "admin"
  ) {
    return res.status(403).json({
      message: "Business only"
    });
  }

  next();
}

/* ==========================================
   SEND OTP
========================================== */
async function sendOTP(
  email,
  code
) {
  await resend.emails.send({
    from:
      process.env.FROM_EMAIL,
    to: email,
    subject:
      "Verify your Business Account",
    html: `
      <h2>SkillEarn Business Verification</h2>
      <p>Your OTP Code:</p>
      <h1>${code}</h1>
      <p>Expires in 10 minutes.</p>
    `
  });
}

/* ==========================================
   SAFE HELPERS
========================================== */
async function safeCount(
  pool,
  table,
  vendorId
) {
  try {
    const result =
      await pool.query(
        `
        SELECT COUNT(*) total
        FROM ${table}
        WHERE vendor_id=$1
        `,
        [vendorId]
      );

    return Number(
      result.rows[0].total
    );

  } catch {
    return 0;
  }
}

async function safeSumPayments(
  pool,
  vendorId
) {
  try {
    const result =
      await pool.query(
        `
        SELECT COALESCE(
          SUM(amount),0
        ) total
        FROM payments
        WHERE vendor_id=$1
        AND status='SUCCESS'
        `,
        [vendorId]
      );

    return Number(
      result.rows[0].total
    );

  } catch {
    return 0;
  }
}

/* ==========================================
   REGISTER BUSINESS
========================================== */
router.post(
  "/api/business/register",
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const {
        business_name,
        email,
        password
      } = req.body;

      if (
        !business_name ||
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
          `
          SELECT id
          FROM vendors
          WHERE email=$1
          `,
          [email]
        );

      if (
        check.rows.length > 0
      ) {
        return res.status(400).json({
          message:
            "Email already exists"
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
        INSERT INTO vendors
        (
          business_name,
          email,
          password,
          approved,
          email_verified,
          otp_code,
          otp_expires
        )
        VALUES
        (
          $1,$2,$3,
          false,
          false,
          $4,
          NOW() + INTERVAL '10 minutes'
        )
        `,
        [
          business_name,
          email,
          hashed,
          otp
        ]
      );

      await sendOTP(
        email,
        otp
      );

      res.json({
        message:
          "Business registration successful. OTP sent to email."
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
   VERIFY EMAIL
========================================== */
router.post(
  "/api/business/verify-email",
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const {
        email,
        otp
      } = req.body;

      const result =
        await pool.query(
          `
          SELECT id
          FROM vendors
          WHERE email=$1
          AND otp_code=$2
          AND otp_expires > NOW()
          `,
          [
            email,
            otp
          ]
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
        UPDATE vendors
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
          "Email verified. Await admin approval."
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
  "/api/business/resend-otp",
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
        UPDATE vendors
        SET
        otp_code=$1,
        otp_expires=
        NOW() + INTERVAL '10 minutes'
        WHERE email=$2
        `,
        [
          otp,
          email
        ]
      );

      await sendOTP(
        email,
        otp
      );

      res.json({
        message:
          "OTP resent"
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
  "/api/business/login",
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
          `
          SELECT *
          FROM vendors
          WHERE email=$1
          `,
          [email]
        );

      if (
        result.rows.length === 0
      ) {
        return res.status(400).json({
          message:
            "Invalid login"
        });
      }

      const vendor =
        result.rows[0];

      const valid =
        await bcrypt.compare(
          password,
          vendor.password
        );

      if (!valid) {
        return res.status(400).json({
          message:
            "Invalid login"
        });
      }

      if (
        vendor.email_verified !== true
      ) {
        return res.status(403).json({
          message:
            "Please verify your email first"
        });
      }

      if (
        vendor.approved !== true
      ) {
        return res.status(403).json({
          message:
            "Awaiting admin approval"
        });
      }

      const token =
        jwt.sign(
          {
            id: vendor.id,
            email:
              vendor.email,
            role: "vendor"
          },
          process.env.JWT_SECRET,
          {
            expiresIn: "7d"
          }
        );

      res.json({
        message:
          "Login successful",
        token,
        vendor: {
          id: vendor.id,
          business_name:
            vendor.business_name,
          email:
            vendor.email
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
  "/api/business/dashboard",
  auth,
  businessOnly,
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const vendorId =
        req.user.id;

      const tasks =
        await safeCount(
          pool,
          "tasks",
          vendorId
        );

      const freelance =
        await safeCount(
          pool,
          "freelance_jobs",
          vendorId
        );

      const hiring =
        await safeCount(
          pool,
          "hiring_jobs",
          vendorId
        );

      const influencer =
        await safeCount(
          pool,
          "influencer_jobs",
          vendorId
        );

      const social =
        await safeCount(
          pool,
          "social_tasks",
          vendorId
        );

      const totalSpent =
        await safeSumPayments(
          pool,
          vendorId
        );

      res.json({
        tasks,
        freelance,
        hiring,
        influencer,
        social_media_tasks:
          social,
        total_spent:
          totalSpent
      });

    } catch {
      res.status(500).json({
        message:
          "Unable to load dashboard"
      });
    }
  }
);

/* ==========================================
   PAYMENT HISTORY
========================================== */
router.get(
  "/api/business/payments",
  auth,
  businessOnly,
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const result =
        await pool.query(
          `
          SELECT *
          FROM payments
          WHERE vendor_id=$1
          ORDER BY id DESC
          `,
          [req.user.id]
        );

      res.json(
        result.rows
      );

    } catch {
      res.status(500).json({
        message:
          "Unable to fetch payments"
      });
    }
  }
);

/* ==========================================
   ACTIVE JOBS
========================================== */
router.get(
  "/api/business/jobs",
  auth,
  businessOnly,
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const result =
        await pool.query(
          `
          SELECT id,title,status,created_at,'task' type
          FROM tasks WHERE vendor_id=$1

          UNION ALL

          SELECT id,title,status,created_at,'freelance'
          FROM freelance_jobs WHERE vendor_id=$1

          UNION ALL

          SELECT id,title,status,created_at,'hiring'
          FROM hiring_jobs WHERE vendor_id=$1

          UNION ALL

          SELECT id,title,status,created_at,'influencer'
          FROM influencer_jobs WHERE vendor_id=$1

          UNION ALL

          SELECT id,title,status,created_at,'social'
          FROM social_tasks WHERE vendor_id=$1

          ORDER BY created_at DESC
          `,
          [req.user.id]
        );

      res.json(
        result.rows
      );

    } catch {
      res.status(500).json({
        message:
          "Unable to load jobs"
      });
    }
  }
);

module.exports = router;
