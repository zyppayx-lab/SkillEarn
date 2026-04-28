// admin.js
// UPDATED PRODUCTION VERSION
// Real database powered admin panel

const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

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

/* ==========================================
   ADMIN ONLY
========================================== */
function adminOnly(
  req,
  res,
  next
) {
  if (
    req.user.role !== "admin"
  ) {
    return res.status(403).json({
      message: "Admin only"
    });
  }

  next();
}

/* ==================================================
   ADMIN DASHBOARD
================================================== */
router.get(
  "/api/admin/dashboard",
  auth,
  adminOnly,
  async (req, res) => {
    const pool =
      req.app.locals.pool;

    try {
      const users =
        await pool.query(
          `SELECT COUNT(*) FROM users`
        );

      const vendors =
        await pool.query(
          `SELECT COUNT(*) FROM vendors`
        );

      const tasks =
        await pool.query(
          `SELECT COUNT(*) FROM tasks`
        );

      const withdrawals =
        await pool.query(
          `
          SELECT COUNT(*)
          FROM withdrawals
          WHERE status='PENDING'
        `
        );

      res.json({
        status:
          "Admin dashboard active",
        users:
          users.rows[0].count,
        vendors:
          vendors.rows[0].count,
        tasks:
          tasks.rows[0].count,
        withdrawals:
          withdrawals.rows[0].count
      });

    } catch {
      res.status(500).json({
        message:
          "Dashboard failed"
      });
    }
  }
);

/* ==================================================
   APPROVE BUSINESS
================================================== */
router.post(
  "/api/admin/business/approve",
  auth,
  adminOnly,
  async (req, res) => {
    const pool =
      req.app.locals.pool;

    const {
      vendor_id
    } = req.body;

    await pool.query(
      `
      UPDATE vendors
      SET approved=true,
          status='active'
      WHERE id=$1
    `,
      [vendor_id]
    );

    res.json({
      message:
        "Business approved"
    });
  }
);

/* ==================================================
   BLOCK BUSINESS
================================================== */
router.post(
  "/api/admin/business/block",
  auth,
  adminOnly,
  async (req, res) => {
    const pool =
      req.app.locals.pool;

    const {
      vendor_id
    } = req.body;

    await pool.query(
      `
      UPDATE vendors
      SET status='blocked'
      WHERE id=$1
    `,
      [vendor_id]
    );

    res.json({
      message:
        "Business blocked"
    });
  }
);

/* ==================================================
   APPROVE TASK
================================================== */
router.post(
  "/api/admin/task/approve",
  auth,
  adminOnly,
  async (req, res) => {
    const pool =
      req.app.locals.pool;

    const {
      task_id
    } = req.body;

    await pool.query(
      `
      UPDATE tasks
      SET status='ACTIVE'
      WHERE id=$1
    `,
      [task_id]
    );

    res.json({
      message:
        "Task approved"
    });
  }
);

/* ==================================================
   DELETE TASK
================================================== */
router.post(
  "/api/admin/task/delete",
  auth,
  adminOnly,
  async (req, res) => {
    const pool =
      req.app.locals.pool;

    const {
      task_id
    } = req.body;

    await pool.query(
      `
      DELETE FROM tasks
      WHERE id=$1
    `,
      [task_id]
    );

    res.json({
      message:
        "Task deleted"
    });
  }
);

/* ==================================================
   APPROVE WITHDRAWAL
================================================== */
router.post(
  "/api/admin/withdrawal/approve",
  auth,
  adminOnly,
  async (req, res) => {
    const pool =
      req.app.locals.pool;

    const {
      withdrawal_id
    } = req.body;

    await pool.query(
      `
      UPDATE withdrawals
      SET status='SUCCESS'
      WHERE id=$1
    `,
      [withdrawal_id]
    );

    res.json({
      message:
        "Withdrawal approved"
    });
  }
);

/* ==================================================
   PLATFORM STATS
================================================== */
router.get(
  "/api/admin/stats",
  auth,
  adminOnly,
  async (req, res) => {
    const pool =
      req.app.locals.pool;

    try {
      const users =
        await pool.query(
          `SELECT COUNT(*) FROM users`
        );

      const businesses =
        await pool.query(
          `SELECT COUNT(*) FROM vendors`
        );

      const tasks =
        await pool.query(
          `SELECT COUNT(*) FROM tasks`
        );

      const earnings =
        await pool.query(
          `
          SELECT COALESCE(SUM(amount),0)
          FROM payments
          WHERE status='SUCCESS'
        `
        );

      res.json({
        total_users:
          users.rows[0].count,
        total_businesses:
          businesses.rows[0].count,
        total_tasks:
          tasks.rows[0].count,
        total_earnings:
          earnings.rows[0]
            .coalesce
      });

    } catch {
      res.status(500).json({
        message:
          "Stats failed"
      });
    }
  }
);

/* ==================================================
   VIEW USERS
================================================== */
router.get(
  "/api/admin/users",
  auth,
  adminOnly,
  async (req, res) => {
    const pool =
      req.app.locals.pool;

    const result =
      await pool.query(
        `
        SELECT id,name,email,
        balance,status,
        created_at
        FROM users
        ORDER BY id DESC
      `
      );

    res.json(
      result.rows
    );
  }
);

/* ==================================================
   VIEW BUSINESSES
================================================== */
router.get(
  "/api/admin/businesses",
  auth,
  adminOnly,
  async (req, res) => {
    const pool =
      req.app.locals.pool;

    const result =
      await pool.query(
        `
        SELECT id,business_name,
        email,approved,status,
        created_at
        FROM vendors
        ORDER BY id DESC
      `
      );

    res.json(
      result.rows
    );
  }
);

module.exports = router;
