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
  const token =
    (req.headers.authorization || "")
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
   SEND OTP
========================================== */
async function sendOTP(email, code) {
  try {
    await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: email,
      subject: "Verify your SkillEarn account",
      html: `
        <h2>SkillEarn</h2>
        <p>Your OTP:</p>
        <h1>${code}</h1>
        <p>Expires in 10 minutes</p>
      `
    });
  } catch (e) {
    console.error("EMAIL ERROR:", e);
  }
}

/* ==========================================
   REGISTER
========================================== */
router.post("/api/auth/register", async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const {
      name,
      email,
      password,
      country
    } = req.body;

    const exist = await pool.query(
      "SELECT id FROM users WHERE email=$1",
      [email]
    );

    if (exist.rows.length > 0) {
      return res.status(400).json({
        message: "Email already registered"
      });
    }

    const hashed = await bcrypt.hash(password, 10);

    const otp = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

    await pool.query(`
      INSERT INTO users
      (name,email,password_hash,role,balance,status,email_verified,otp_code,otp_expires,country)
      VALUES ($1,$2,$3,'user',0,'active',false,$4,NOW()+INTERVAL '10 minutes',$5)
    `, [name, email, hashed, otp, country || "NG"]);

    await sendOTP(email, otp);

    res.json({
      message: "Registration successful. OTP sent."
    });

  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/* ==========================================
   VERIFY EMAIL
========================================== */
router.post("/api/auth/verify-email", async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { email, otp } = req.body;

    const result = await pool.query(`
      SELECT id FROM users
      WHERE email=$1 AND otp_code=$2
      AND otp_expires > NOW()
    `, [email, otp]);

    if (result.rows.length === 0) {
      return res.status(400).json({
        message: "Invalid or expired OTP"
      });
    }

    await pool.query(`
      UPDATE users
      SET email_verified=true,
          otp_code=NULL,
          otp_expires=NULL
      WHERE email=$1
    `, [email]);

    res.json({ message: "Verified" });

  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/* ==========================================
   LOGIN
========================================== */
router.post("/api/auth/login", async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { email, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );

    if (result.rows.length === 0)
      return res.status(400).json({
        message: "Invalid login"
      });

    const user = result.rows[0];

    const valid = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!valid)
      return res.status(400).json({
        message: "Invalid login"
      });

    if (!user.email_verified)
      return res.status(403).json({
        message: "Verify email first"
      });

    const token = jwt.sign(
      {
        id: user.id,
        role: "user",
        country: user.country
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      user
    });

  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/* ==========================================
   DASHBOARD
========================================== */
router.get("/api/users/dashboard", auth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const profile = await pool.query(
      `SELECT id,name,email,balance FROM users WHERE id=$1`,
      [req.user.id]
    );

    const tasks = await pool.query(
      `SELECT COUNT(*) FROM tasks WHERE status='ACTIVE'`
    );

    res.json({
      profile: profile.rows[0],
      available_tasks: tasks.rows[0].count
    });

  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/* ==========================================
   TASKS
========================================== */
router.get("/api/users/tasks", auth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query(`
      SELECT id,title,description,reward,status
      FROM tasks
      WHERE status='ACTIVE'
      ORDER BY id DESC
    `);

    res.json(result.rows);

  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/* ==========================================
   WALLET
========================================== */
router.get("/api/users/wallet", auth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query(
      "SELECT balance FROM users WHERE id=$1",
      [req.user.id]
    );

    res.json({
      balance: result.rows[0].balance || 0
    });

  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/* ==========================================
   WITHDRAW (NGN + CRYPTO)
========================================== */
router.post("/api/users/withdraw", auth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const {
      amount,
      bank_name,
      account_number,
      wallet_address
    } = req.body;

    const userRes = await pool.query(
      "SELECT balance,country FROM users WHERE id=$1",
      [req.user.id]
    );

    const user = userRes.rows[0];
    const balance = Number(user.balance);
    const amt = Number(amount);

    if (amt > balance)
      return res.status(400).json({
        message: "Insufficient balance"
      });

    let method = "bank";

    // CRYPTO for NON-NG users
    if (user.country !== "NG") {
      if (amt < 20)
        return res.status(400).json({
          message: "Minimum crypto withdrawal is $20"
        });

      method = "crypto";
    } else {
      if (amt < 1000)
        return res.status(400).json({
          message: "Minimum withdrawal is ₦1000"
        });
    }

    const fee = amt * 0.0175;
    const finalAmount = amt - fee;

    await pool.query(`
      INSERT INTO withdrawals
      (user_id,amount,fee,final_amount,method,bank_name,account_number,wallet_address,status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING')
    `, [
      req.user.id,
      amt,
      fee,
      finalAmount,
      method,
      bank_name || null,
      account_number || null,
      wallet_address || null
    ]);

    await pool.query(`
      UPDATE users
      SET balance=balance-$1
      WHERE id=$2
    `, [amt, req.user.id]);

    res.json({
      message: "Withdrawal submitted for approval",
      fee,
      finalAmount
    });

  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/* ==========================================
   TRANSACTIONS
========================================== */
router.get("/api/users/transactions", auth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query(
      `SELECT * FROM transactions WHERE user_id=$1 ORDER BY id DESC`,
      [req.user.id]
    );

    res.json(result.rows);

  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/* ==========================================
   NOTIFICATIONS
========================================== */
router.get("/api/users/notifications", auth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query(
      `SELECT * FROM notifications WHERE user_id=$1 ORDER BY id DESC`,
      [req.user.id]
    );

    res.json(result.rows);

  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
