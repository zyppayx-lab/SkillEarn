// users.js
// SkillEarn Production Users + Auth Routes

const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const router = express.Router();

/* ==========================================
   AUTH MIDDLEWARE
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
   REGISTER USER
========================================== */
router.post(
  "/api/auth/register",
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const {
        name,
        email,
        phone,
        password
      } = req.body;

      if (
        !name ||
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
          "SELECT id FROM users WHERE email=$1",
          [email]
        );

      if (
        check.rows.length > 0
      ) {
        return res.status(400).json({
          message:
            "Email already registered"
        });
      }

      const hashed =
        await bcrypt.hash(
          password,
          10
        );

      await pool.query(
        `INSERT INTO users
        (name,email,phone,password)
        VALUES ($1,$2,$3,$4)`,
        [
          name,
          email,
          phone || "",
          hashed
        ]
      );

      res.json({
        message:
          "Registration successful"
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
   LOGIN USER
========================================== */
router.post(
  "/api/auth/login",
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
          "SELECT * FROM users WHERE email=$1",
          [email]
        );

      if (
        result.rows.length === 0
      ) {
        return res.status(400).json({
          message:
            "Invalid email or password"
        });
      }

      const user =
        result.rows[0];

      const valid =
        await bcrypt.compare(
          password,
          user.password
        );

      if (!valid) {
        return res.status(400).json({
          message:
            "Invalid email or password"
        });
      }

      const token =
        jwt.sign(
          {
            id: user.id,
            email: user.email,
            role: user.role
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
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
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

/* ==========================================
   USER PROFILE
========================================== */
router.get(
  "/api/users/profile",
  auth,
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const result =
        await pool.query(
          `SELECT id,name,email,phone,
          role,balance,status
          FROM users
          WHERE id=$1`,
          [req.user.id]
        );

      if (
        result.rows.length === 0
      ) {
        return res.status(404).json({
          message:
            "User not found"
        });
      }

      res.json(
        result.rows[0]
      );

    } catch {
      res.status(500).json({
        message:
          "Unable to fetch profile"
      });
    }
  }
);

/* ==========================================
   UPDATE PROFILE
========================================== */
router.post(
  "/api/users/update-profile",
  auth,
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const {
        name,
        phone
      } = req.body;

      await pool.query(
        `UPDATE users
         SET name=$1,
             phone=$2
         WHERE id=$3`,
        [
          name,
          phone,
          req.user.id
        ]
      );

      res.json({
        message:
          "Profile updated"
      });

    } catch {
      res.status(500).json({
        message:
          "Update failed"
      });
    }
  }
);

/* ==========================================
   USER WALLET
========================================== */
router.get(
  "/api/users/wallet",
  auth,
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const result =
        await pool.query(
          "SELECT balance FROM users WHERE id=$1",
          [req.user.id]
        );

      res.json({
        balance:
          result.rows[0]
            ?.balance || 0,
        currency: "NGN"
      });

    } catch {
      res.status(500).json({
        message:
          "Wallet fetch failed"
      });
    }
  }
);

/* ==========================================
   USER TASK HISTORY
========================================== */
router.get(
  "/api/users/tasks",
  auth,
  async (req, res) => {
    res.json([]);
  }
);

/* ==========================================
   USER TRANSACTIONS
========================================== */
router.get(
  "/api/users/transactions",
  auth,
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const result =
        await pool.query(
          `SELECT *
           FROM transactions
           WHERE user_id=$1
           ORDER BY id DESC`,
          [req.user.id]
        );

      res.json(
        result.rows
      );

    } catch {
      res.status(500).json({
        message:
          "Unable to fetch transactions"
      });
    }
  }
);

/* ==========================================
   USER NOTIFICATIONS
========================================== */
router.get(
  "/api/users/notifications",
  auth,
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const result =
        await pool.query(
          `SELECT *
           FROM notifications
           WHERE user_id=$1
           ORDER BY id DESC`,
          [req.user.id]
        );

      res.json(
        result.rows
      );

    } catch {
      res.status(500).json({
        message:
          "Unable to fetch notifications"
      });
    }
  }
);

module.exports = router;
