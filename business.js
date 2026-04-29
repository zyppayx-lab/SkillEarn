// business.js
// FULL BUSINESS DASHBOARD ROUTES
// Vendor Auth + Stats + Payments + Active Jobs + History
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

      if (
        !business_name ||
        !email ||
        !password
      ) {
        return res.status(400).json({
          message:
            "Missing required fields"
        });
      }

      const check =
        await pool.query(
          "SELECT id FROM vendors WHERE email=$1",
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
        (business_name,email,phone,password)
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

    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Registration failed"
      });
    }
  }
);

/* ==========================================
   BUSINESS LOGIN
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
          "SELECT * FROM vendors WHERE email=$1",
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

    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Login failed"
      });
    }
  }
);

/* ==================================================
   BUSINESS DASHBOARD
================================================== */
router.get(
  "/api/business/dashboard",
  auth,
  businessOnly,
  async (req, res) => {
    const pool =
      req.app.locals.pool;

    try {
      const vendorId =
        req.user.id;

      const totalTasks =
        await pool.query(
          `SELECT COUNT(*) FROM tasks
           WHERE vendor_id=$1`,
          [vendorId]
        );

      const totalFreelance =
        await pool.query(
          `SELECT COUNT(*) FROM freelance_jobs
           WHERE vendor_id=$1`,
          [vendorId]
        );

      const totalHiring =
        await pool.query(
          `SELECT COUNT(*) FROM hiring_jobs
           WHERE vendor_id=$1`,
          [vendorId]
        );

      const totalInfluencer =
        await pool.query(
          `SELECT COUNT(*) FROM influencer_jobs
           WHERE vendor_id=$1`,
          [vendorId]
        );

      const totalSpent =
        await pool.query(
          `SELECT COALESCE(SUM(amount),0) AS total
           FROM payments
           WHERE vendor_id=$1
           AND status='SUCCESS'`,
          [vendorId]
        );

      res.json({
        tasks:
          totalTasks.rows[0]
            .count,
        freelance:
          totalFreelance.rows[0]
            .count,
        hiring:
          totalHiring.rows[0]
            .count,
        influencer:
          totalInfluencer.rows[0]
            .count,
        total_spent:
          totalSpent.rows[0]
            .total
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
    const pool =
      req.app.locals.pool;

    try {
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
   ACTIVE TASKS / JOBS
================================================== */
router.get(
  "/api/business/jobs",
  auth,
  businessOnly,
  async (req, res) => {
    const pool =
      req.app.locals.pool;

    try {
      const tasks =
        await pool.query(
          `SELECT id,title,status,
           created_at,'task' as type
           FROM tasks
           WHERE vendor_id=$1`,
          [req.user.id]
        );

      const freelance =
        await pool.query(
          `SELECT id,title,status,
           created_at,'freelance' as type
           FROM freelance_jobs
           WHERE vendor_id=$1`,
          [req.user.id]
        );

      const hiring =
        await pool.query(
          `SELECT id,title,status,
           created_at,'hiring' as type
           FROM hiring_jobs
           WHERE vendor_id=$1`,
          [req.user.id]
        );

      const influencer =
        await pool.query(
          `SELECT id,title,status,
           created_at,'influencer' as type
           FROM influencer_jobs
           WHERE vendor_id=$1`,
          [req.user.id]
        );

      res.json([
        ...tasks.rows,
        ...freelance.rows,
        ...hiring.rows,
        ...influencer.rows
      ]);

    } catch {
      res.status(500).json({
        message:
          "Unable to load jobs"
      });
    }
  }
);

module.exports = router;
