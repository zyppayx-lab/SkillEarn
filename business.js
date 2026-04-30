// business.js
// FINAL PRODUCTION VERSION
// Country + Escrow + Task Funding + Auto Payout

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
SEND OTP
========================================== */
async function sendOTP(email, code) {
  await resend.emails.send({
    from: process.env.FROM_EMAIL,
    to: email,
    subject: "Verify your Business Account",
    html: `<h2>Verification</h2><h1>${code}</h1>`
  });
}

/* ==========================================
REGISTER (WITH COUNTRY)
========================================== */
router.post("/api/business/register", async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { business_name, email, password, country } = req.body;

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
LOGIN
========================================== */
router.post("/api/business/login", async (req, res) => {
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
    return res.status(403).json({ message: "Verify email first" });
  }

  if (!vendor.approved) {
    return res.status(403).json({ message: "Await admin approval" });
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
});

/* ==========================================
CREATE TASK (ESCROW REQUIRED)
========================================== */
router.post(
  "/api/business/create-task",
  auth,
  businessOnly,
  async (req, res) => {
    try {
      const pool = req.app.locals.pool;

      const {
        title,
        description,
        reward,
        total_workers
      } = req.body;

      const totalBudget = reward * total_workers;

      // CHECK IF PAYMENT EXISTS (ESCROW FUND)
      const payment = await pool.query(
        `SELECT * FROM payments
         WHERE vendor_id=$1
         AND status='SUCCESS'
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

      // CREATE TASK
      const task = await pool.query(
        `INSERT INTO tasks
        (vendor_id,title,description,reward,total_workers,status)
        VALUES($1,$2,$3,$4,$5,'ACTIVE')
        RETURNING *`,
        [
          req.user.id,
          title,
          description,
          reward,
          total_workers
        ]
      );

      // CREATE ESCROW RECORD
      await pool.query(
        `INSERT INTO escrow
        (vendor_id,task_id,total_amount,remaining_amount,status)
        VALUES($1,$2,$3,$3,'LOCKED')`,
        [
          req.user.id,
          task.rows[0].id,
          totalBudget
        ]
      );

      res.json({
        message: "Task created with escrow locked",
        task: task.rows[0]
      });

    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  }
);

/* ==========================================
APPROVE USER SUBMISSION (PAYOUT)
========================================== */
router.post(
  "/api/business/approve-submission",
  auth,
  businessOnly,
  async (req, res) => {
    try {
      const pool = req.app.locals.pool;

      const { submission_id } = req.body;

      const sub = await pool.query(
        `SELECT * FROM submissions WHERE id=$1`,
        [submission_id]
      );

      if (sub.rows.length === 0) {
        return res.status(404).json({ message: "Not found" });
      }

      const submission = sub.rows[0];

      // GET TASK
      const task = await pool.query(
        "SELECT * FROM tasks WHERE id=$1",
        [submission.task_id]
      );

      const reward = Number(task.rows[0].reward);

      // GET ESCROW
      const escrow = await pool.query(
        "SELECT * FROM escrow WHERE task_id=$1",
        [submission.task_id]
      );

      if (escrow.rows.length === 0) {
        return res.status(400).json({
          message: "Escrow missing"
        });
      }

      const remaining = Number(
        escrow.rows[0].remaining_amount
      );

      if (remaining < reward) {
        return res.status(400).json({
          message: "Escrow empty"
        });
      }

      // PAY USER
      await pool.query(
        "UPDATE users SET balance=balance+$1 WHERE id=$2",
        [reward, submission.user_id]
      );

      // UPDATE ESCROW
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
        message: "User paid from escrow"
      });

    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  }
);

module.exports = router;
