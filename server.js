// server.js
// SkillEarn Production Backend
// Updated: Payments integrated + paid task creation flow
// Node.js + Express + PostgreSQL + JWT

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

/* =========================
   APP
========================= */
const app = express();

/* =========================
   IMPORT ROUTES
========================= */
const paymentRoutes = require("./payments");

/* =========================
   ENV VARIABLES REQUIRED
========================= */
// PORT=5000
// DATABASE_URL=postgresql://...
// JWT_SECRET=your_secret
// SESSION_SECRET=your_secret

/* =========================
   DATABASE
========================= */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* =========================
   MIDDLEWARE
========================= */
app.use(helmet());

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300
}));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: "lax"
  }
}));

/* =========================
   USE PAYMENT ROUTES
========================= */
app.use(paymentRoutes);

/* =========================
   HELPERS
========================= */
function token(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const bearer = header.replace("Bearer ", "");

  try {
    req.user = jwt.verify(bearer, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      message: "Unauthorized"
    });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      message: "Admin only"
    });
  }
  next();
}

function vendorOnly(req, res, next) {
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

/* =========================
   HEALTH CHECK
========================= */
app.get("/", (req, res) => {
  res.json({
    status: "SkillEarn Backend Running"
  });
});

/* =========================
   DATABASE SETUP
========================= */
app.get("/setup", async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        phone TEXT,
        password TEXT,
        role TEXT DEFAULT 'user',
        balance NUMERIC DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS vendors (
        id SERIAL PRIMARY KEY,
        business_name TEXT,
        email TEXT UNIQUE,
        phone TEXT,
        password TEXT,
        role TEXT DEFAULT 'vendor',
        approved BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER,
        title TEXT,
        description TEXT,
        reward NUMERIC,
        payment_reference TEXT,
        paid BOOLEAN DEFAULT false,
        status TEXT DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER,
        payment_reference TEXT UNIQUE,
        method TEXT,
        amount NUMERIC,
        status TEXT DEFAULT 'PENDING',
        task_title TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    res.json({
      message: "Database ready"
    });

  } catch (err) {
    res.status(500).json({
      message: "Setup failed"
    });
  }
});

/* =========================
   USER REGISTER
========================= */
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    const hash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users
      (name,email,phone,password)
      VALUES($1,$2,$3,$4)
      RETURNING id`,
      [name, email, phone, hash]
    );

    res.json({
      id: result.rows[0].id,
      message: "User created"
    });

  } catch {
    res.status(400).json({
      message: "Email already exists"
    });
  }
});

/* =========================
   USER LOGIN
========================= */
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      `SELECT * FROM users WHERE email=$1`,
      [email]
    );

    if (!result.rows.length) {
      return res.status(400).json({
        message: "Invalid login"
      });
    }

    const user = result.rows[0];

    const match = await bcrypt.compare(
      password,
      user.password
    );

    if (!match) {
      return res.status(400).json({
        message: "Invalid login"
      });
    }

    res.json({
      access: token(user)
    });

  } catch {
    res.status(500).json({
      message: "Login failed"
    });
  }
});

/* =========================
   BUSINESS REGISTER
========================= */
app.post("/api/business/register", async (req, res) => {
  try {
    const {
      business_name,
      email,
      phone,
      password
    } = req.body;

    const hash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO vendors
      (business_name,email,phone,password)
      VALUES($1,$2,$3,$4)
      RETURNING id`,
      [business_name, email, phone, hash]
    );

    res.json({
      id: result.rows[0].id,
      message: "Business account created"
    });

  } catch {
    res.status(400).json({
      message: "Email already exists"
    });
  }
});

/* =========================
   BUSINESS LOGIN
========================= */
app.post("/api/business/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      `SELECT * FROM vendors WHERE email=$1`,
      [email]
    );

    if (!result.rows.length) {
      return res.status(400).json({
        message: "Invalid login"
      });
    }

    const vendor = result.rows[0];

    const match = await bcrypt.compare(
      password,
      vendor.password
    );

    if (!match) {
      return res.status(400).json({
        message: "Invalid login"
      });
    }

    res.json({
      access: token(vendor)
    });

  } catch {
    res.status(500).json({
      message: "Login failed"
    });
  }
});

/* =========================
   ADMIN LOGIN
========================= */
app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body;

  if (
    email === "admin@skillearn.com" &&
    password === "admin123"
  ) {
    res.json({
      access: jwt.sign(
        {
          email,
          role: "admin"
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      )
    });
  } else {
    res.status(401).json({
      message: "Invalid admin login"
    });
  }
});

/* =========================
   USER PROFILE
========================= */
app.get("/api/users/profile", auth, async (req, res) => {
  const result = await pool.query(
    `SELECT id,name,email,phone,balance
     FROM users WHERE id=$1`,
    [req.user.id]
  );

  res.json(result.rows[0]);
});

/* ===================================================
   BLOCK FREE TASK CREATION
=================================================== */
app.post(
  "/api/business/task/create",
  auth,
  vendorOnly,
  async (req, res) => {
    return res.status(403).json({
      message:
        "Payment required first. Use Paystack or Crypto payment endpoint."
    });
  }
);

/* ===================================================
   CREATE TASK AFTER PAYMENT
=================================================== */
app.post(
  "/api/business/task/create-paid",
  auth,
  vendorOnly,
  async (req, res) => {
    try {
      const {
        payment_reference,
        title,
        description,
        reward
      } = req.body;

      const payment = await pool.query(
        `SELECT * FROM payments
         WHERE payment_reference=$1
         AND status='SUCCESS'`,
        [payment_reference]
      );

      if (!payment.rows.length) {
        return res.status(400).json({
          message: "Payment not verified"
        });
      }

      await pool.query(
        `INSERT INTO tasks
        (vendor_id,title,description,reward,payment_reference,paid)
        VALUES($1,$2,$3,$4,$5,true)`,
        [
          req.user.id,
          title,
          description,
          reward,
          payment_reference
        ]
      );

      res.json({
        message: "Paid task created successfully"
      });

    } catch {
      res.status(500).json({
        message: "Task creation failed"
      });
    }
  }
);

/* =========================
   PUBLIC TASKS
========================= */
app.get("/api/tasks", async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM tasks
     WHERE status='ACTIVE'
     ORDER BY id DESC`
  );

  res.json(result.rows);
});

/* =========================
   ADMIN DASHBOARD
========================= */
app.get(
  "/api/admin/dashboard",
  auth,
  adminOnly,
  async (req, res) => {
    const users = await pool.query(
      `SELECT COUNT(*) FROM users`
    );

    const vendors = await pool.query(
      `SELECT COUNT(*) FROM vendors`
    );

    const tasks = await pool.query(
      `SELECT COUNT(*) FROM tasks`
    );

    const payments = await pool.query(
      `SELECT COUNT(*) FROM payments`
    );

    res.json({
      users: users.rows[0].count,
      vendors: vendors.rows[0].count,
      tasks: tasks.rows[0].count,
      payments: payments.rows[0].count
    });
  }
);

/* =========================
   START SERVER
========================= */
app.listen(process.env.PORT || 5000, () => {
  console.log("SkillEarn running...");
});
