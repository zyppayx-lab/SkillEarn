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

    if (!result.rows.length) {
      return res.status(400).json({ message: "Invalid login" });
    }

    const admin = result.rows[0];

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      return res.status(400).json({ message: "Invalid login" });
    }

    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ message: "Login successful", token });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/* ==========================================
DASHBOARD + PROFIT ANALYTICS
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

    const escrow = await pool.query(`
      SELECT COALESCE(SUM(remaining_amount),0) FROM escrow
    `);

    /* 🔥 REVENUE */
    const revenue = await pool.query(`
      SELECT COALESCE(SUM(amount),0) FROM payments
    `);

    /* 🔥 ESCROW RESERVED */
    const escrowReserved = await pool.query(`
      SELECT COALESCE(SUM(escrow_amount),0) FROM payments
    `);

    /* 🔥 PAYOUTS */
    const paidOut = await pool.query(`
      SELECT COALESCE(SUM(amount),0) FROM withdrawals WHERE status='PAID'
    `);

    /* 🔥 PLATFORM PROFIT (REALISTIC) */
    const profit =
      Number(revenue.rows[0].coalesce) -
      Number(escrowReserved.rows[0].coalesce) -
      Number(paidOut.rows[0].coalesce);

    res.json({
      users: users.rows[0].count,
      vendors: vendors.rows[0].count,
      tasks: tasks.rows[0].count,
      pending_withdrawals: withdrawals.rows[0].count,
      escrow_locked: Number(escrow.rows[0].coalesce),

      total_revenue: Number(revenue.rows[0].coalesce),
      total_escrow_reserved: Number(escrowReserved.rows[0].coalesce),
      total_paid_out: Number(paidOut.rows[0].coalesce),
      platform_profit: profit
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/* ==========================================
VENDORS MANAGEMENT
========================================== */
router.get("/api/admin/vendors", auth, adminOnly, async (req, res) => {
  const pool = req.app.locals.pool;

  const result = await pool.query(`
    SELECT id, business_name, email, approved, email_verified, created_at
    FROM vendors ORDER BY id DESC
  `);

  res.json(result.rows);
});

router.post("/api/admin/vendor/approve", auth, adminOnly, async (req, res) => {
  const pool = req.app.locals.pool;

  await pool.query(
    "UPDATE vendors SET approved=true WHERE id=$1",
    [req.body.vendor_id]
  );

  res.json({ message: "Vendor approved" });
});

router.post("/api/admin/vendor/block", auth, adminOnly, async (req, res) => {
  const pool = req.app.locals.pool;

  await pool.query(
    "UPDATE vendors SET approved=false WHERE id=$1",
    [req.body.vendor_id]
  );

  res.json({ message: "Vendor blocked" });
});

/* ==========================================
PAYMENTS VIEW
========================================== */
router.get("/api/admin/payments", auth, adminOnly, async (req, res) => {
  const pool = req.app.locals.pool;

  const result = await pool.query(`
    SELECT * FROM payments ORDER BY id DESC
  `);

  res.json(result.rows);
});

/* ==========================================
REFERRAL ANALYTICS
========================================== */
router.get("/api/admin/referrals", auth, adminOnly, async (req, res) => {
  const pool = req.app.locals.pool;

  const result = await pool.query(`
    SELECT * FROM referrals ORDER BY id DESC
  `);

  res.json(result.rows);
});

/* ==========================================
ESCROW RELEASE (SAFE TRANSACTION)
========================================== */
router.post("/api/admin/escrow/release", auth, adminOnly, async (req, res) => {
  const pool = req.app.locals.pool;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const sub = await client.query(`
      SELECT s.*, t.reward
      FROM submissions s
      JOIN tasks t ON s.task_id = t.id
      WHERE s.id=$1 FOR UPDATE
    `, [req.body.submission_id]);

    if (!sub.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Not found" });
    }

    const row = sub.rows[0];

    if (row.status === "APPROVED") {
      await client.query("ROLLBACK");
      return res.json({ message: "Already approved" });
    }

    const esc = await client.query(`
      SELECT remaining_amount FROM escrow WHERE task_id=$1 FOR UPDATE
    `, [row.task_id]);

    if (Number(esc.rows[0].remaining_amount) < row.reward) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Insufficient escrow" });
    }

    await client.query(`
      UPDATE users SET balance=balance+$1 WHERE id=$2
    `, [row.reward, row.user_id]);

    await client.query(`
      UPDATE escrow SET remaining_amount=remaining_amount-$1 WHERE task_id=$2
    `, [row.reward, row.task_id]);

    await client.query(`
      UPDATE submissions SET status='APPROVED' WHERE id=$1
    `, [req.body.submission_id]);

    await client.query(`
      INSERT INTO transactions (user_id, amount, type, reference)
      VALUES ($1,$2,'earning',$3)
    `, [row.user_id, row.reward, 'TASK_' + row.task_id]);

    await client.query("COMMIT");

    res.json({ message: "Escrow released" });

  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ message: "Failed" });
  } finally {
    client.release();
  }
});

/* ==========================================
WITHDRAW APPROVE (MANUAL)
========================================== */
router.post("/api/admin/withdraw/approve", auth, adminOnly, async (req, res) => {
  const pool = req.app.locals.pool;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const w = await client.query(`
      SELECT * FROM withdrawals WHERE id=$1 FOR UPDATE
    `, [req.body.withdrawal_id]);

    if (!w.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Not found" });
    }

    const row = w.rows[0];

    if (row.status === "PAID") {
      await client.query("ROLLBACK");
      return res.json({ message: "Already paid" });
    }

    await client.query(`
      UPDATE withdrawals SET status='PAID' WHERE id=$1
    `, [row.id]);

    await client.query(`
      INSERT INTO transactions (user_id, amount, type, reference)
      VALUES ($1,$2,'withdrawal',$3)
    `, [row.user_id, row.amount, 'WD_' + row.id]);

    await client.query("COMMIT");

    res.json({ message: "Withdrawal approved" });

  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ message: "Failed" });
  } finally {
    client.release();
  }
});

/* ==========================================
WITHDRAW REJECT
========================================== */
router.post("/api/admin/withdraw/reject", auth, adminOnly, async (req, res) => {
  const pool = req.app.locals.pool;

  const w = await pool.query(
    "SELECT * FROM withdrawals WHERE id=$1",
    [req.body.withdrawal_id]
  );

  if (!w.rows.length) {
    return res.status(404).json({ message: "Not found" });
  }

  const row = w.rows[0];

  await pool.query(
    "UPDATE withdrawals SET status='REJECTED' WHERE id=$1",
    [row.id]
  );

  await pool.query(
    "UPDATE users SET balance=balance+$1 WHERE id=$2",
    [row.amount, row.user_id]
  );

  res.json({ message: "Rejected & refunded" });
});

/* ==========================================
USERS LIST
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
