// users.js
// FINAL PRODUCTION VERSION
// OTP + Country + Crypto Withdrawals + Fees + Admin Approval + Fraud Protection

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
  const token = (req.headers.authorization || "").replace("Bearer ", "");

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

/* ==========================================
CONFIG
========================================== */
const NAIRA_MIN = 1000;
const CRYPTO_MIN = 20;
const FEE_PERCENT = 1.75;

/* ==========================================
SEND OTP
========================================== */
async function sendOTP(email, code) {
  try {
    await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: email,
      subject: "Verify your SkillEarn account",
      html: `
        <h2>SkillEarn Verification</h2>
        <h1>${code}</h1>
        <p>Expires in 10 minutes</p>
      `
    });
  } catch (err) {
    console.error("EMAIL ERROR:", err.message);
  }
}

/* ==========================================
REGISTER
========================================== */
router.post("/api/auth/register", async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { name, email, password, country } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const exists = await pool.query(
      "SELECT id FROM users WHERE email=$1",
      [email]
    );

    if (exists.rows.length > 0) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hash = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await pool.query(
      `INSERT INTO users
      (name,email,password_hash,role,balance,status,email_verified,otp_code,otp_expires,country)
      VALUES($1,$2,$3,'user',0,'active',false,$4,NOW()+INTERVAL '10 minutes',$5)`,
      [name, email, hash, otp, country || "NG"]
    );

    await sendOTP(email, otp);

    res.json({ message: "OTP sent" });

  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/* ==========================================
VERIFY EMAIL
========================================== */
router.post("/api/auth/verify-email", async (req, res) => {
  const pool = req.app.locals.pool;
  const { email, otp } = req.body;

  const user = await pool.query(
    `SELECT id FROM users
     WHERE email=$1 AND otp_code=$2 AND otp_expires > NOW()`,
    [email, otp]
  );

  if (user.rows.length === 0) {
    return res.status(400).json({ message: "Invalid OTP" });
  }

  await pool.query(
    `UPDATE users SET email_verified=true, otp_code=NULL WHERE email=$1`,
    [email]
  );

  res.json({ message: "Verified" });
});

/* ==========================================
LOGIN
========================================== */
router.post(
  "/api/auth/login",
  async (req, res) => {
    try {
      const pool = req.app.locals.pool;

      const { email, password } = req.body;

      const result = await pool.query(
        "SELECT * FROM users WHERE email=$1",
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(400).json({
          message: "Invalid login"
        });
      }

      const user = result.rows[0];

      const valid = await bcrypt.compare(
        password,
        user.password_hash
      );

      if (!valid) {
        return res.status(400).json({
          message: "Invalid login"
        });
      }

      if (user.email_verified !== true) {
        return res.status(403).json({
          message:
            "Please verify your email first"
        });
      }

      // OPTIONAL: track device/IP (good for fraud detection)
      await pool.query(
        `
        UPDATE users
        SET
          last_ip = $1,
          last_user_agent = $2
        WHERE id = $3
        `,
        [
          req.ip,
          req.headers["user-agent"],
          user.id
        ]
      );

      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: "user",
          country: user.country
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      // ✅ SAFE RESPONSE (NO sensitive data)
      res.json({
        message: "Login successful",
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          balance: user.balance,
          country: user.country
        }
      });

    } catch (error) {
      res.status(500).json({
        message: error.message
      });
    }
  }
);

/* ==========================================
DASHBOARD
========================================== */
router.get("/api/users/dashboard", auth, async (req, res) => {
  const pool = req.app.locals.pool;

  const profile = await pool.query(
    "SELECT id,name,email,balance FROM users WHERE id=$1",
    [req.user.id]
  );

  const tasks = await pool.query(
    "SELECT COUNT(*) total FROM tasks WHERE status='ACTIVE'"
  );

  res.json({
    profile: profile.rows[0],
    available_tasks: tasks.rows[0].total
  });
});

/* ==========================================
TASKS
========================================== */
router.get("/api/users/tasks", auth, async (req, res) => {
  const pool = req.app.locals.pool;

  const tasks = await pool.query(
    `SELECT id,title,reward,status
     FROM tasks WHERE status='ACTIVE'
     ORDER BY id DESC`
  );

  res.json(tasks.rows);
});

/* ==========================================
   WALLET
========================================== */
router.get(
  "/api/users/wallet",
  auth,
  async (req, res) => {
    try {
      const pool = req.app.locals.pool;

      const result = await pool.query(
        `
        SELECT balance
        FROM users
        WHERE id=$1
        `,
        [req.user.id]
      );

      res.json({
        balance: Number(result.rows[0]?.balance || 0),
        currency:
          req.user.country === "NG"
            ? "NGN"
            : "USD"
      });

    } catch (error) {
      res.status(500).json({
        message: error.message
      });
    }
  }
);

/* ==========================================
WITHDRAW (BANK + CRYPTO)
========================================== */
router.post("/api/users/withdraw", auth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const {
      amount,
      bank_name,
      account_number,
      account_name,
      crypto_address,
      crypto_network
    } = req.body;

    const userRes = await pool.query(
      "SELECT balance,country FROM users WHERE id=$1",
      [req.user.id]
    );

    const user = userRes.rows[0];
    const balance = Number(user.balance);
    const isNigeria = user.country === "NG";

    const min = isNigeria ? NAIRA_MIN : CRYPTO_MIN;

    if (amount < min) {
      return res.status(400).json({
        message: `Minimum withdrawal is ${min}`
      });
    }

    if (amount > balance) {
      return res.status(400).json({
        message: "Insufficient balance"
      });
    }

    const fee = (amount * FEE_PERCENT) / 100;
    const finalAmount = amount - fee;

    // FRAUD CHECK
    const recent = await pool.query(
      `SELECT COUNT(*) FROM withdrawals
       WHERE user_id=$1 AND created_at > NOW() - INTERVAL '5 minutes'`,
      [req.user.id]
    );

    if (Number(recent.rows[0].count) > 3) {
      return res.status(429).json({
        message: "Too many requests. Try later."
      });
    }

    await pool.query(
      `INSERT INTO withdrawals
      (user_id,amount,fee,final_amount,
       bank_name,account_number,account_name,
       crypto_address,crypto_network,
       type,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING')`,
      [
        req.user.id,
        amount,
        fee,
        finalAmount,
        bank_name || null,
        account_number || null,
        account_name || null,
        crypto_address || null,
        crypto_network || null,
        isNigeria ? "BANK" : "CRYPTO"
      ]
    );

    await pool.query(
      "UPDATE users SET balance=balance-$1 WHERE id=$2",
      [amount, req.user.id]
    );

    res.json({
      message: "Withdrawal submitted for admin approval",
      fee,
      final_amount: finalAmount
    });

  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/* ==========================================
TRANSACTIONS
========================================== */
router.get("/api/users/transactions", auth, async (req, res) => {
  const pool = req.app.locals.pool;

  const tx = await pool.query(
    "SELECT * FROM transactions WHERE user_id=$1 ORDER BY id DESC",
    [req.user.id]
  );

  res.json(tx.rows);
});

/* ==========================================
NOTIFICATIONS
========================================== */
router.get("/api/users/notifications", auth, async (req, res) => {
  const pool = req.app.locals.pool;

  const data = await pool.query(
    "SELECT * FROM notifications WHERE user_id=$1 ORDER BY id DESC",
    [req.user.id]
  );

  res.json(data.rows);
});

module.exports = router;
