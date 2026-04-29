// users.js
// UPDATED VERSION
// Real tasks route added + auth fixed

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

      if (!name || !email || !password) {
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

      if (check.rows.length > 0) {
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
        `
        INSERT INTO users
        (
          name,email,phone,
          password_hash,
          role,balance,status
        )
        VALUES
        ($1,$2,$3,$4,'user',0,'active')
        `,
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
      res.status(500).json({
        message:
          error.message
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
          user.password_hash
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
            role:
              user.role || "user"
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
          role:
            user.role || "user"
        }
      });

    } catch (error) {
      res.status(500).json({
        message:
          error.message
      });
    }
  }
);

/* ==========================================
   PROFILE
========================================== */
router.get(
  "/api/users/profile",
  auth,
  async (req, res) => {
    const pool =
      req.app.locals.pool;

    const result =
      await pool.query(
        `
        SELECT
        id,name,email,phone,
        role,balance,status
        FROM users
        WHERE id=$1
        `,
        [req.user.id]
      );

    res.json(
      result.rows[0]
    );
  }
);

/* ==========================================
   WALLET
========================================== */
router.get(
  "/api/users/wallet",
  auth,
  async (req, res) => {
    const pool =
      req.app.locals.pool;

    const result =
      await pool.query(
        `
        SELECT balance
        FROM users
        WHERE id=$1
        `,
        [req.user.id]
      );

    res.json({
      balance:
        result.rows[0]
          ?.balance || 0,
      currency: "NGN"
    });
  }
);

/* ==========================================
   AVAILABLE TASKS
========================================== */
router.get(
  "/api/users/tasks",
  auth,
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const tasks =
        await pool.query(
          `
          SELECT
          id,title,
          amount AS reward,
          status,
          created_at,
          'task' AS type
          FROM tasks
          WHERE status='ACTIVE'
          `
        );

      const social =
        await pool.query(
          `
          SELECT
          id,title,
          amount AS reward,
          status,
          created_at,
          'social' AS type
          FROM social_media_tasks
          WHERE status='ACTIVE'
          `
        );

      const allTasks = [
        ...tasks.rows,
        ...social.rows
      ].sort(
        (a, b) =>
          new Date(b.created_at) -
          new Date(a.created_at)
      );

      res.json(allTasks);

    } catch (error) {
      res.status(500).json({
        message:
          error.message
      });
    }
  }
);

/* ==========================================
   TRANSACTIONS
========================================== */
router.get(
  "/api/users/transactions",
  auth,
  async (req, res) => {
    const pool =
      req.app.locals.pool;

    const result =
      await pool.query(
        `
        SELECT *
        FROM transactions
        WHERE user_id=$1
        ORDER BY id DESC
        `,
        [req.user.id]
      );

    res.json(
      result.rows
    );
  }
);

/* ==========================================
   NOTIFICATIONS
========================================== */
router.get(
  "/api/users/notifications",
  auth,
  async (req, res) => {
    const pool =
      req.app.locals.pool;

    const result =
      await pool.query(
        `
        SELECT *
        FROM notifications
        WHERE user_id=$1
        ORDER BY id DESC
        `,
        [req.user.id]
      );

    res.json(
      result.rows
    );
  }
);

module.exports = router;
