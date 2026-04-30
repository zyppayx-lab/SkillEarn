// admin.js
// FINAL MASTER ADMIN VERSION
// Fraud + Escrow Control + Vendors + Withdrawals + Analytics

const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const router = express.Router();

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

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin only" });
  }
  next();
}

/* ==========================================
ADMIN LOGIN
========================================== */
router.post("/api/admin/login", async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { email, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM admins WHERE email=$1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "Invalid login" });
    }

    const admin = result.rows[0];

    const valid = await bcrypt.compare(
      password,
      admin.password_hash
    );

    if (!valid) {
      return res.status(400).json({ message: "Invalid login" });
    }

    const token = jwt.sign(
      {
        id: admin.id,
        email: admin.email,
        role: "admin"
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/* ==========================================
DASHBOARD
========================================== */
router.get("/api/admin/dashboard", auth, adminOnly, async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const users = await pool.query("SELECT COUNT(*) FROM users");
    const vendors = await pool.query("SELECT COUNT(*) FROM vendors");
    const tasks = await pool.query("SELECT COUNT(*) FROM tasks");

    const withdrawals = await pool.query(`
      SELECT COUNT(*) FROM withdrawals WHERE status='PENDING'
    `);

    const fraud = await pool.query(`
      SELECT COUNT(*) FROM fraud_logs WHERE status='OPEN'
    `);

    const escrow = await pool.query(`
      SELECT COALESCE(SUM(remaining_amount),0) FROM escrow
    `);

    res.json({
      users: users.rows[0].count,
      vendors: vendors.rows[0].count,
      tasks: tasks.rows[0].count,
      pending_withdrawals: withdrawals.rows[0].count,
      open_fraud_cases: fraud.rows[0].count,
      total_escrow_locked: Number(escrow.rows[0].coalesce)
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/* ==========================================
VENDORS
========================================== */
router.get("/api/admin/vendors", auth, adminOnly, async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query(`
      SELECT id, business_name, email, approved, email_verified, created_at
      FROM vendors
      ORDER BY id DESC
    `);

    res.json(result.rows);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/api/admin/vendor/approve", auth, adminOnly, async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    await pool.query(`
      UPDATE vendors SET approved=true WHERE id=$1
    `, [req.body.vendor_id]);

    res.json({ message: "Vendor approved" });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/api/admin/vendor/block", auth, adminOnly, async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    await pool.query(`
      UPDATE vendors SET approved=false WHERE id=$1
    `, [req.body.vendor_id]);

    res.json({ message: "Vendor blocked" });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/* ==========================================
ESCROW CONTROL
========================================== */
router.get("/api/admin/escrow", auth, adminOnly, async (req, res) => {
  const pool = req.app.locals.pool;
  const result = await pool.query("SELECT * FROM escrow ORDER BY id DESC");
  res.json(result.rows);
});

router.post("/api/admin/escrow/release", auth, adminOnly, async (req, res) => {
  const pool = req.app.locals.pool;

  const sub = await pool.query(`
    SELECT s.*, t.reward
    FROM submissions s
    JOIN tasks t ON s.task_id=t.id
    WHERE s.id=$1
  `, [req.body.submission_id]);

  if (sub.rows.length === 0) {
    return res.status(404).json({ message: "Not found" });
  }

  const row = sub.rows[0];

  await pool.query(`
    UPDATE users SET balance=balance+$1 WHERE id=$2
  `, [row.reward, row.user_id]);

  await pool.query(`
    UPDATE escrow SET remaining_amount=remaining_amount-$1 WHERE task_id=$2
  `, [row.reward, row.task_id]);

  await pool.query(`
    UPDATE submissions SET status='APPROVED' WHERE id=$1
  `, [req.body.submission_id]);

  res.json({ message: "Escrow released" });
});

router.post("/api/admin/escrow/refund", auth, adminOnly, async (req, res) => {
  const pool = req.app.locals.pool;

  await pool.query(`
    UPDATE escrow SET status='REFUNDED', remaining_amount=0 WHERE id=$1
  `, [req.body.escrow_id]);

  res.json({ message: "Escrow refunded" });
});

/* ==========================================
FRAUD SYSTEM
========================================== */
router.get("/api/admin/fraud-alerts", auth, adminOnly, async (req, res) => {
  const pool = req.app.locals.pool;
  const result = await pool.query("SELECT * FROM fraud_logs ORDER BY id DESC");
  res.json(result.rows);
});

router.post("/api/admin/fraud/resolve", auth, adminOnly, async (req, res) => {
  const pool = req.app.locals.pool;

  await pool.query(`
    UPDATE fraud_logs SET status='RESOLVED' WHERE id=$1
  `, [req.body.fraud_id]);

  res.json({ message: "Fraud resolved" });
});

router.get("/api/admin/flagged-users", auth, adminOnly, async (req, res) => {
  const pool = req.app.locals.pool;

  const result = await pool.query(`
    SELECT id,name,email,fraud_score,status
    FROM users WHERE fraud_score > 50
    ORDER BY fraud_score DESC
  `);

  res.json(result.rows);
});

router.post("/api/admin/user/block", auth, adminOnly, async (req, res) => {
  const pool = req.app.locals.pool;

  await pool.query(`
    UPDATE users SET status='blocked' WHERE id=$1
  `, [req.body.user_id]);

  res.json({ message: "User blocked" });
});

/* ==========================================
WITHDRAWALS
========================================== */
router.get("/api/admin/withdrawals", auth, adminOnly, async (req, res) => {
  const pool = req.app.locals.pool;
  const result = await pool.query("SELECT * FROM withdrawals ORDER BY id DESC");
  res.json(result.rows);
});

router.post("/api/admin/withdraw/approve", auth, adminOnly, async (req, res) => {
  const pool = req.app.locals.pool;

  await pool.query(`
    UPDATE withdrawals SET status='PAID' WHERE id=$1
  `, [req.body.withdrawal_id]);

  res.json({ message: "Withdrawal approved" });
});

router.post("/api/admin/withdraw/reject", auth, adminOnly, async (req, res) => {
  const pool = req.app.locals.pool;

  const w = await pool.query(`
    SELECT * FROM withdrawals WHERE id=$1
  `, [req.body.withdrawal_id]);

  if (w.rows.length === 0) {
    return res.status(404).json({ message: "Not found" });
  }

  const row = w.rows[0];

  await pool.query(`
    UPDATE withdrawals SET status='REJECTED' WHERE id=$1
  `, [row.id]);

  await pool.query(`
    UPDATE users SET balance=balance+$1 WHERE id=$2
  `, [row.amount, row.user_id]);

  res.json({ message: "Rejected & refunded" });
});

/* ==========================================
USERS
========================================== */
router.get("/api/admin/users", auth, adminOnly, async (req, res) => {
  const pool = req.app.locals.pool;

  const result = await pool.query(`
    SELECT id,name,email,balance,status,fraud_score,created_at
    FROM users ORDER BY id DESC
  `);

  res.json(result.rows);
});

module.exports = router;
