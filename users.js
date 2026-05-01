const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
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
const CRYPTO_MIN = 20;
const FEE_PERCENT = 1.75;

/* ==========================================
OTP
========================================== */
async function sendOTP(email, code) {
  await resend.emails.send({
    from: process.env.FROM_EMAIL,
    to: email,
    subject: "Verify your SkillEarn account",
    html: `<h2>SkillEarn</h2>
           <h1>${code}</h1>
           <p>Expires in 10 mins</p>`
  });
}

/* ==========================================
REFERRAL REWARD
========================================== */
async function releaseReferralReward(pool, userId) {

  const userResult = await pool.query(
    `
    SELECT *
    FROM users
    WHERE id=$1
    `,
    [userId]
  );

  if (!userResult.rows.length) return;

  const user = userResult.rows[0];

  if (!user.referred_by) return;
  if (user.referral_paid) return;

  const reward =
    user.country === "NG"
      ? 500
      : 1;

  const currency =
    user.country === "NG"
      ? "NGN"
      : "USD";

  await pool.query(
    `
    UPDATE users
    SET balance=balance+$1
    WHERE id=$2
    `,
    [
      reward,
      user.referred_by
    ]
  );

  await pool.query(
    `
    UPDATE users
    SET referral_paid=true
    WHERE id=$1
    `,
    [userId]
  );

  await pool.query(
    `
    UPDATE referral_earnings
    SET released=true
    WHERE referred_user_id=$1
    `,
    [userId]
  );

  await pool.query(
    `
    INSERT INTO transactions
    (user_id, amount, type, reference)
    VALUES ($1,$2,'referral',$3)
    `,
    [
      user.referred_by,
      reward,
      "REF_" + userId
    ]
  );
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
        `
        SELECT id
        FROM users
        WHERE email=$1
        `,
        [email]
      );

      if (exists.rows.length) {
        return res.status(400).json({
          message: "Email already exists"
        });
      }

      const hash =
        await bcrypt.hash(password, 10);

      const otp =
        Math.floor(
          100000 +
          Math.random() * 900000
        ).toString();

      let referredBy = null;

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

        if (ref.rows.length) {
          referredBy =
            ref.rows[0].id;
        }
      }

      const user =
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
            referral_code,
            referred_by,
            referral_paid
          )
          VALUES(
            $1,$2,$3,
            'user',
            0,
            'active',
            false,
            $4,
            NOW()+INTERVAL '10 minutes',
            $5,
            md5(random()::text),
            $6,
            false
          )
          RETURNING *
          `,
          [
            name,
            email,
            hash,
            otp,
            country || "NG",
            referredBy
          ]
        );

      if (referredBy) {

        const reward =
          country === "NG"
            ? 500
            : 1;

        await pool.query(
          `
          INSERT INTO referral_earnings
          (
            referrer_id,
            referred_user_id,
            amount,
            currency,
            released
          )
          VALUES($1,$2,$3,$4,false)
          `,
          [
            referredBy,
            user.rows[0].id,
            reward,
            country === "NG"
              ? "NGN"
              : "USD"
          ]
        );
      }

      await sendOTP(
        email,
        otp
      );

      res.json({
        message: "OTP sent"
      });

    } catch (e) {

      res.status(500).json({
        message: e.message
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
        SELECT id
        FROM users
        WHERE email=$1
        AND otp_code=$2
        AND otp_expires > NOW()
        `,
        [email, otp]
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
      otp_code=NULL
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
        message:
          "Verify email first"
      });
    }

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
      token,
      user
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

    const tasks =
      await pool.query(
        `
        SELECT
        id,
        title,
        reward
        FROM tasks
        WHERE status='ACTIVE'
        `
      );

    res.json(
      tasks.rows
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
      VALUES(
        $1,$2,$3,'PENDING'
      )
      `,
      [
        req.user.id,
        task_id,
        proof
      ]
    );

    res.json({
      message:
        "Submitted"
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

    const wallet =
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
      wallet.rows[0]
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
      crypto_address,
      crypto_network,
      crypto_symbol
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
        message:
          "Below minimum"
      });
    }

    if (amount > user.balance) {

      return res.status(400).json({
        message:
          "Insufficient"
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
        crypto_address,
        crypto_network,
        crypto_symbol,
        status
      )
      VALUES(
        $1,$2,$3,$4,
        $5,$6,$7,$8,$9,
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
        bank_name,
        account_number,
        crypto_address,
        crypto_network,
        crypto_symbol
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

    await releaseReferralReward(
      pool,
      req.user.id
    );

    res.json({
      message:
        "Withdrawal submitted"
    });
  }
);

/* ==========================================
REFERRAL TREE
========================================== */
router.get(
  "/api/users/referrals",
  auth,
  async (req, res) => {

    const pool =
      req.app.locals.pool;

    const refs =
      await pool.query(
        `
        SELECT
        u.id,
        u.name,
        u.email,
        r.amount,
        r.currency,
        r.released
        FROM users u
        JOIN referral_earnings r
        ON u.id =
        r.referred_user_id
        WHERE
        r.referrer_id=$1
        `,
        [req.user.id]
      );

    res.json(
      refs.rows
    );
  }
);

module.exports = router;
