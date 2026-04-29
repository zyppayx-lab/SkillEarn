// business.js
// FIXED PRODUCTION VERSION
// Dashboard safe mode + social media tasks included
// Existing features preserved

const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

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
   SAFE SQL HELPERS
========================================== */
async function safeCount(
  pool,
  table,
  vendorId
) {
  try {
    const result =
      await pool.query(
        `SELECT COUNT(*) AS total
         FROM ${table}
         WHERE vendor_id=$1`,
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
        `SELECT COALESCE(
          SUM(amount),0
        ) AS total
        FROM payments
        WHERE vendor_id=$1
        AND status='SUCCESS'`,
        [vendorId]
      );

    return result.rows[0].total;

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
        phone,
        password
      } = req.body;

      const check =
        await pool.query(
          `SELECT id
           FROM vendors
           WHERE email=$1`,
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

      await pool.query(
        `INSERT INTO vendors
        (
          business_name,
          email,
          phone,
          password
        )
        VALUES ($1,$2,$3,$4)`,
        [
          business_name,
          email,
          phone || "",
          hashed
        ]
      );

      res.json({
        message:
          "Business registration successful. Await admin approval."
      });

    } catch {
      res.status(500).json({
        message:
          "Registration failed"
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
          `SELECT *
           FROM vendors
           WHERE email=$1`,
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

    } catch {
      res.status(500).json({
        message:
          "Login failed"
      });
    }
  }
);

/* ==================================================
   FIXED DASHBOARD
================================================== */
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

/* ==================================================
   PAYMENT HISTORY
================================================== */
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
          `SELECT *
           FROM payments
           WHERE vendor_id=$1
           ORDER BY id DESC`,
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

/* ==================================================
   ACTIVE JOBS
================================================== */
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
          SELECT id,title,status,
          created_at,'task' as type
          FROM tasks
          WHERE vendor_id=$1

          UNION ALL

          SELECT id,title,status,
          created_at,'freelance'
          FROM freelance_jobs
          WHERE vendor_id=$1

          UNION ALL

          SELECT id,title,status,
          created_at,'hiring'
          FROM hiring_jobs
          WHERE vendor_id=$1

          UNION ALL

          SELECT id,title,status,
          created_at,'influencer'
          FROM influencer_jobs
          WHERE vendor_id=$1

          UNION ALL

          SELECT id,title,status,
          created_at,'social'
          FROM social_tasks
          WHERE vendor_id=$1

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
