// business.js
// FINAL PRODUCTION VERSION
// Country + OTP + Admin Approval + Escrow + Auto Payout

console.log("🔥 BUSINESS ROUTES LOADED");

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

function businessOnly(req, res, next) {
  if (req.user.role !== "vendor" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Business only" });
  }
  next();
}

/* ==========================================
PING (TEST)
========================================== */
router.get("/api/business/ping", (req, res) => {
  res.json({ ok: true, service: "business" });
});

/* ==========================================
SEND OTP
========================================== */
async function sendOTP(email, code) {
  try {
    await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: email,
      subject: "Verify your Business Account",
      html: `<h2>SkillEarn</h2><h1>${code}</h1><p>Expires in 10 mins</p>`
    });
  } catch (err) {
    console.error("EMAIL ERROR:", err.message);
  }
}

/* ==========================================
REGISTER
========================================== */
router.post("/api/business/register", async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { business_name, email, password, country } = req.body;

    if (!business_name || !email || !password) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const exists = await pool.query(
      "SELECT id FROM vendors WHERE email=$1",
      [email]
    );

    if (exists.rows.length > 0) {
      return res.status(400).json({
        message: "Email already exists"
      });
    }

    const hash = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await pool.query(
      `INSERT INTO vendors
      (business_name,email,password,country,approved,email_verified,otp_code,otp_expires)
      VALUES($1,$2,$3,$4,false,false,$5,NOW()+INTERVAL '10 minutes')`,
      [business_name, email, hash, country || "US", otp]
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
router.post("/api/business/verify-email", async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { email, otp } = req.body;

    const result = await pool.query(
      `SELECT id FROM vendors
       WHERE email=$1 AND otp_code=$2 AND otp_expires > NOW()`,
      [email, otp]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        message: "Invalid or expired OTP"
      });
    }

    await pool.query(
      `UPDATE vendors
       SET email_verified=true, otp_code=NULL, otp_expires=NULL
       WHERE email=$1`,
      [email]
    );

    res.json({
      message: "Email verified. Await admin approval."
    });

  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/* ==========================================
RESEND OTP
========================================== */
router.post("/api/business/resend-otp", async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { email } = req.body;

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await pool.query(
      `UPDATE vendors
       SET otp_code=$1, otp_expires=NOW()+INTERVAL '10 minutes'
       WHERE email=$2`,
      [otp, email]
    );

    await sendOTP(email, otp);

    res.json({ message: "OTP resent" });

  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/* ==========================================
LOGIN
========================================== */
router.post("/api/business/login", async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { email, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM vendors WHERE email=$1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "Invalid login" });
    }

    const vendor = result.rows[0];

    const valid = await bcrypt.compare(password, vendor.password);

    if (!valid) {
      return res.status(400).json({ message: "Invalid login" });
    }

    if (!vendor.email_verified) {
      return res.status(403).json({
        message: "Verify email first"
      });
    }

    if (!vendor.approved) {
      return res.status(403).json({
        message: "Await admin approval"
      });
    }

    const token = jwt.sign(
      {
        id: vendor.id,
        email: vendor.email,
        role: "vendor",
        country: vendor.country
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      vendor: {
        id: vendor.id,
        business_name: vendor.business_name,
        country: vendor.country
      }
    });

  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/* ==========================================
CREATE TASK (ESCROW)
========================================== */
router.post("/api/business/create-task", auth, businessOnly, async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const { title, description, reward, total_workers } = req.body;

    if (!title || !reward || !total_workers) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const totalBudget = reward * total_workers;

    // CHECK LAST SUCCESS PAYMENT (ESCROW FUND)
    const payment = await pool.query(
      `SELECT * FROM payments
       WHERE vendor_id=$1 AND status='SUCCESS'
       ORDER BY id DESC LIMIT 1`,
      [req.user.id]
    );

    if (payment.rows.length === 0) {
      return res.status(400).json({
        message: "Fund escrow first"
      });
    }

    const escrowBalance = Number(payment.rows[0].amount);

    if (escrowBalance < totalBudget) {
      return res.status(400).json({
        message: "Insufficient escrow balance"
      });
    }

    const task = await pool.query(
      `INSERT INTO tasks
      (vendor_id,title,description,reward,total_workers,status)
      VALUES($1,$2,$3,$4,$5,'ACTIVE')
      RETURNING *`,
      [req.user.id, title, description, reward, total_workers]
    );

    await pool.query(
      `INSERT INTO escrow
      (vendor_id,task_id,total_amount,remaining_amount,status)
      VALUES($1,$2,$3,$3,'LOCKED')`,
      [req.user.id, task.rows[0].id, totalBudget]
    );

    res.json({
      message: "Task created with escrow locked",
      task: task.rows[0]
    });

  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/* ==========================================
APPROVE SUBMISSION (AUTO PAY USER)
========================================== */
router.post("/api/business/approve-submission", auth, businessOnly, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { submission_id } = req.body;

    const sub = await pool.query(
      "SELECT * FROM submissions WHERE id=$1",
      [submission_id]
    );

    if (sub.rows.length === 0) {
      return res.status(404).json({ message: "Submission not found" });
    }

    const submission = sub.rows[0];

    const task = await pool.query(
      "SELECT reward FROM tasks WHERE id=$1",
      [submission.task_id]
    );

    const reward = Number(task.rows[0].reward);

    const escrow = await pool.query(
      "SELECT remaining_amount FROM escrow WHERE task_id=$1",
      [submission.task_id]
    );

    if (escrow.rows.length === 0) {
      return res.status(400).json({ message: "Escrow missing" });
    }

    if (Number(escrow.rows[0].remaining_amount) < reward) {
      return res.status(400).json({ message: "Escrow empty" });
    }

    // PAY USER
    await pool.query(
      "UPDATE users SET balance=balance+$1 WHERE id=$2",
      [reward, submission.user_id]
    );

    // REDUCE ESCROW
    await pool.query(
      `UPDATE escrow
       SET remaining_amount=remaining_amount-$1
       WHERE task_id=$2`,
      [reward, submission.task_id]
    );

    // UPDATE SUBMISSION
    await pool.query(
      "UPDATE submissions SET status='APPROVED' WHERE id=$1",
      [submission_id]
    );

    res.json({
      message: "User paid successfully"
    });

  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
