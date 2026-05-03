const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { Resend } = require("resend");

const router = express.Router();
const resend = new Resend(process.env.RESEND_API_KEY);


/* ==========================================
AUTH
========================================== */
function auth(req, res, next) {
  const token = (req.headers.authorization || "")
    .replace("Bearer ", "");

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
CONFIG
========================================== */
const NAIRA_MIN = 1000;
const CRYPTO_MIN = 1;
const FEE_PERCENT = 1.75;
const NG_REFERRAL_REWARD = 500;
const USD_REFERRAL_REWARD = 1;


/* ==========================================
OTP
========================================== */
async function sendOTP(email, code) {
  await resend.emails.send({
    from: process.env.FROM_EMAIL,
    to: email,
    subject: "Verify your SkillEarn account",
    html: `
      <h2>SkillEarn</h2>
      <h1>${code}</h1>
      <p>Expires in 10 minutes</p>
    `
  });
}


/* ==========================================
REGISTER
========================================== */
router.post(
  "/api/auth/register",
  async (req, res) => {

    try {

      const pool = req.app.locals.pool;

      const {
        name,
        email,
        password,
        country,
        referral_code
      } = req.body;


      const exists = await pool.query(
        "SELECT id FROM users WHERE email=$1",
        [email]
      );

      if (exists.rows.length > 0) {
        return res.status(400).json({
          message: "Email already registered"
        });
      }


      const hash =
        await bcrypt.hash(password, 10);

      const otp =
        Math.floor(
          100000 + Math.random() * 900000
        ).toString();

      const myReferralCode =
        crypto.randomBytes(4)
          .toString("hex")
          .toUpperCase();


      const created =
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
            country,
            referral_code
          )
          VALUES
          (
            $1,$2,$3,
            'user',
            0,
            'active',
            false,
            $4,
            NOW()+INTERVAL '10 minutes',
            $5,
            $6
          )
          RETURNING *
          `,
          [
            name,
            email,
            hash,
            otp,
            country || "NG",
            myReferralCode
          ]
        );


      const user =
        created.rows[0];


      /* REFERRAL */
      if (referral_code) {

        const ref =
          await pool.query(
            `
            SELECT id
            FROM users
            WHERE referral_code=$1
            `,
            [referral_code]
          );


        if (ref.rows.length > 0) {

          const referrerId =
            ref.rows[0].id;


          await pool.query(
            `
            UPDATE users
            SET referred_by=$1
            WHERE id=$2
            `,
            [
              referrerId,
              user.id
            ]
          );

        }

      }


      await sendOTP(
        email,
        otp
      );


      res.json({
        message: "OTP sent"
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

    const pool =
      req.app.locals.pool;

    const {
      email,
      otp
    } = req.body;


    const user =
      await pool.query(
        `
        SELECT *
        FROM users
        WHERE email=$1
        AND otp_code=$2
        AND otp_expires > NOW()
        `,
        [
          email,
          otp
        ]
      );


    if (!user.rows.length) {

      return res.status(400).json({
        message: "Invalid OTP"
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
      message: "Verified"
    });

  }
);

/* ==========================================
RESEND OTP
========================================== */
router.post(
  "/api/auth/resend-otp",
  async (req, res) => {

    const pool = req.app.locals.pool;
    const { email } = req.body;

    const otp =
      Math.floor(
        100000 + Math.random() * 900000
      ).toString();

    await pool.query(
      `
      UPDATE users
      SET
      otp_code=$1,
      otp_expires=
      NOW()+INTERVAL '10 minutes'
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
      message: "OTP resent"
    });

  }
);

/* ==========================================
LOGIN
========================================== */
router.post(
  "/api/auth/login",
  async (req, res) => {

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
        FROM users
        WHERE email=$1
        `,
        [email]
      );


    if (!result.rows.length) {

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


    if (!user.email_verified) {

      return res.status(403).json({
        message: "Verify email first"
      });

    }


    /* TRACK DEVICE */
    await pool.query(
      `
      UPDATE users
      SET
      last_ip=$1,
      last_user_agent=$2
      WHERE id=$3
      `,
      [
        req.ip,
        req.headers["user-agent"],
        user.id
      ]
    );


    const token =
      jwt.sign(
        {
          id: user.id,
          role: "user",
          country: user.country
        },
        process.env.JWT_SECRET,
        {
          expiresIn: "7d"
        }
      );


    res.json({
  message: "Login successful",
  token,

  user: {
    id: user.id,
    email: user.email,
    name: user.name,
    country: user.country,
    balance: user.balance,
    referral_code: user.referral_code
  }
});

  }
);
  
/* ==========================================
FORGOT PASSWORD
========================================== */
router.post(
  "/api/auth/forgot-password",
  async (req, res) => {

    const pool =
      req.app.locals.pool;

    const { email } =
      req.body;

    const otp =
      Math.floor(
        100000 + Math.random() * 900000
      ).toString();

    await pool.query(
      `
      UPDATE users
      SET
      reset_otp=$1,
      reset_otp_expires=
      NOW()+INTERVAL '10 minutes'
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
        "Reset OTP sent"
    });

  }
);
/* ==========================================
RESET PASSWORD
========================================== */
router.post(
  "/api/auth/reset-password",
  async (req, res) => {

    const pool =
      req.app.locals.pool;

    const {
      email,
      otp,
      new_password
    } = req.body;

    const result =
      await pool.query(
        `
        SELECT id
        FROM users
        WHERE email=$1
        AND reset_otp=$2
        AND reset_otp_expires > NOW()
        `,
        [
          email,
          otp
        ]
      );

    if (!result.rows.length) {
      return res.status(400).json({
        message: "Invalid OTP"
      });
    }

    const hash =
      await bcrypt.hash(
        new_password,
        10
      );

    await pool.query(
      `
      UPDATE users
      SET
      password_hash=$1,
      reset_otp=NULL,
      reset_otp_expires=NULL
      WHERE email=$2
      `,
      [
        hash,
        email
      ]
    );

    res.json({
      message:
        "Password updated"
    });

  }
);
/* ==========================================
DASHBOARD
========================================== */
router.get(
  "/api/users/dashboard",
  auth,
  async (req, res) => {

    const pool =
      req.app.locals.pool;

    const profile =
      await pool.query(
        `
        SELECT
        id,
        name,
        email,
        balance
        FROM users
        WHERE id=$1
        `,
        [req.user.id]
      );

    const tasks =
      await pool.query(
        `
        SELECT COUNT(*)
        FROM tasks
        WHERE status='ACTIVE'
        `
      );

    res.json({
      profile:
        profile.rows[0],

      available_tasks:
        tasks.rows[0].count
    });

  }
);

/* ==========================================
TASKS
========================================== */
router.get(
  "/api/users/tasks",
  auth,
  async (req, res) => {

    const pool =
      req.app.locals.pool;

    const result =
      await pool.query(
        `
        SELECT *
        FROM tasks
        WHERE status='ACTIVE'
        ORDER BY id DESC
        `
      );

    res.json(
      result.rows
    );

  }
);


/* ==========================================
SUBMIT TASK
========================================== */
router.post(
  "/api/users/submit-task",
  auth,
  async (req, res) => {

    const pool =
      req.app.locals.pool;

    const {
      task_id,
      proof
    } = req.body;


    await pool.query(
      `
      INSERT INTO submissions
      (
        user_id,
        task_id,
        proof,
        status
      )
      VALUES
      (
        $1,$2,$3,
        'PENDING'
      )
      `,
      [
        req.user.id,
        task_id,
        proof
      ]
    );


    res.json({
      message: "Submitted"
    });

  }
);


/* ==========================================
WALLET
========================================== */
router.get(
  "/api/users/wallet",
  auth,
  async (req, res) => {

    const pool =
      req.app.locals.pool;

    const result =
      await pool.query(
        `
        SELECT
        balance,
        country,
        referral_code
        FROM users
        WHERE id=$1
        `,
        [req.user.id]
      );


    res.json(
      result.rows[0]
    );

  }
);


/* ==========================================
WITHDRAW
========================================== */
router.post(
  "/api/users/withdraw",
  auth,
  async (req, res) => {

    const pool =
      req.app.locals.pool;

    const {
      amount,
      bank_name,
      account_number,
      account_name,
      crypto_address,
      crypto_network
    } = req.body;


    const result =
      await pool.query(
        `
        SELECT *
        FROM users
        WHERE id=$1
        `,
        [req.user.id]
      );


    const user =
      result.rows[0];


    const isNG =
      user.country === "NG";


    const min =
      isNG
        ? NAIRA_MIN
        : CRYPTO_MIN;


    if (amount < min) {

      return res.status(400).json({
        message: "Below minimum"
      });

    }


    if (amount > user.balance) {

      return res.status(400).json({
        message: "Insufficient balance"
      });

    }


    const fee =
      amount *
      FEE_PERCENT /
      100;


    await pool.query(
      `
      INSERT INTO withdrawals
      (
        user_id,
        amount,
        fee,
        type,
        bank_name,
        account_number,
        account_name,
        crypto_address,
        crypto_network,
        status
      )
      VALUES
      (
        $1,$2,$3,$4,
        $5,$6,$7,
        $8,$9,
        'PENDING'
      )
      `,
      [
        req.user.id,
        amount,
        fee,

        isNG
          ? "BANK"
          : "CRYPTO",

        bank_name || null,
        account_number || null,
        account_name || null,

        crypto_address || null,
        crypto_network || null
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
        "Withdrawal submitted"
    });

  }
);
/* ==========================================
TRANSACTIONS
========================================== */
router.get(
  "/api/users/transactions",
  auth,
  async (req, res) => {

    const pool =
      req.app.locals.pool;

    const result =
      await pool.query(
        `
        SELECT *
        FROM transactions
        WHERE user_id=$1
        ORDER BY id DESC
        `,
        [req.user.id]
      );

    res.json(
      result.rows
    );

  }
);
/* ==========================================
NOTIFICATIONS
========================================== */
router.get(
  "/api/users/notifications",
  auth,
  async (req, res) => {

    const pool =
      req.app.locals.pool;

    const result =
      await pool.query(
        `
        SELECT *
        FROM notifications
        WHERE user_id=$1
        ORDER BY id DESC
        `,
        [req.user.id]
      );

    res.json(
      result.rows
    );

  }
);

/* ==========================================
REFERRALS
========================================== */
router.get(
  "/api/users/referrals",
  auth,
  async (req, res) => {

    const pool = req.app.locals.pool;

    const result = await pool.query(
      `
      SELECT
      u.name,
      r.amount,
      r.currency,
      r.status,
      r.created_at
      FROM referral_earnings r
      JOIN users u
      ON u.id = r.referred_user_id
      WHERE r.referrer_id=$1
      ORDER BY r.id DESC
      `,
      [req.user.id]
    );

    res.json(result.rows);

  }
);

router.get(
"/api/users/freelance-jobs",
auth,
async(req,res)=>{

    try{

        const pool =
        req.app.locals.pool;

        const result =
        await pool.query(

            `
            SELECT *
            FROM freelance_jobs
            WHERE status='ACTIVE'
            ORDER BY id DESC
            `

        );

        res.json(
            result.rows
        );

    }catch(err){

        res.status(500).json({
            message:err.message
        });

    }

});
router.post(
"/api/users/apply-freelance",
auth,
async(req,res)=>{

    try{

        const pool =
        req.app.locals.pool;

        const {
            job_id,
            proposal
        } = req.body;

        await pool.query(

            `
            INSERT INTO freelance_applications
            (
                user_id,
                job_id,
                proposal,
                status
            )
            VALUES
            (
                $1,$2,$3,
                'PENDING'
            )
            `,

            [
                req.user.id,
                job_id,
                proposal
            ]

        );

        res.json({
            message:"Applied"
        });

    }catch(err){

        res.status(500).json({
            message:err.message
        });

    }

});

router.post(
"/api/users/apply-hiring",
auth,
async(req,res)=>{

    try{

        const pool =
        req.app.locals.pool;

        const {
            job_id,
            cv_link
        } = req.body;

        await pool.query(

            `
            INSERT INTO hiring_applications
            (
                user_id,
                job_id,
                cv_link,
                status
            )
            VALUES
            (
                $1,$2,$3,
                'PENDING'
            )
            `,

            [
                req.user.id,
                job_id,
                cv_link
            ]

        );

        res.json({
            message:"Application sent"
        });

    }catch(err){

        res.status(500).json({
            message:err.message
        });

    }

});

router.post(
"/api/users/apply-influencer",
auth,
async(req,res)=>{

    try{

        const pool =
        req.app.locals.pool;

        const {
            job_id,
            portfolio_link
        } = req.body;

        await pool.query(

            `
            INSERT INTO influencer_applications
            (
                user_id,
                job_id,
                portfolio_link,
                status
            )
            VALUES
            (
                $1,$2,$3,
                'PENDING'
            )
            `,

            [
                req.user.id,
                job_id,
                portfolio_link
            ]

        );

        res.json({
            message:"Application sent"
        });

    }catch(err){

        res.status(500).json({
            message:err.message
        });

    }

});          

module.exports = router;
