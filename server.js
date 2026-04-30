// server.js
// FINAL STABLE PRODUCTION VERSION
// Webhook scoped + clean routing + safe middleware order

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const session = require("express-session");
const { Pool } = require("pg");

const app = express();

/* ==========================================
   ROUTES
========================================== */
const paymentRoutes = require("./payments");
const webhookRoutes = require("./payments-webhook");
const adminRoutes = require("./admin");
const userRoutes = require("./users");
const businessRoutes = require("./business");

/* ==========================================
   SECURITY IMPORT
========================================== */
const {
  applySecurity,
  loginLimiter,
  apiLimiter,
  paymentLimiter,
  withdrawLimiter,
  otpLimiter,
  registerLimiter,
  router: securityRoutes
} = require("./security");

/* ==========================================
   SAFE SETTINGS
========================================== */
app.disable("x-powered-by");
app.set("trust proxy", 1);

/* ==========================================
   DATABASE
========================================== */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false
});

app.locals.pool = pool;

/* ==========================================
   CORE MIDDLEWARE
========================================== */
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({
  extended: true,
  limit: "2mb"
}));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

/* ==========================================
   SECURITY LAYER
========================================== */
applySecurity(app);

app.use(apiLimiter);
app.use(securityRoutes);

/* LOGIN LIMITERS */
app.use("/api/auth/login", loginLimiter);
app.use("/api/business/login", loginLimiter);
app.use("/api/admin/login", loginLimiter);

/* REGISTER LIMITERS */
app.use("/api/auth/register", registerLimiter);
app.use("/api/business/register", registerLimiter);

/* OTP LIMITERS */
app.use("/api/auth/resend-otp", otpLimiter);
app.use("/api/business/resend-otp", otpLimiter);
app.use("/api/auth/verify-email", otpLimiter);
app.use("/api/business/verify-email", otpLimiter);

/* PAYMENT LIMITERS */
app.use("/api/paystack", paymentLimiter);
app.use("/api/crypto", paymentLimiter);

/* WITHDRAW LIMITER */
app.use("/api/users/withdraw", withdrawLimiter);

/* ==========================================
   WEBHOOK ROUTES (FIXED ✅)
   Scoped to prevent route hijacking
========================================== */
app.use("/api/webhook", webhookRoutes);

/* ==========================================
   MAIN ROUTES
========================================== */
app.use(paymentRoutes);
app.use(adminRoutes);
app.use(userRoutes);
app.use(businessRoutes);

/* ==========================================
   HEALTH CHECKS
========================================== */
app.get("/", (req, res) => {
  res.json({
    status: "SkillEarn Backend Running",
    mode: process.env.NODE_ENV || "development"
  });
});

app.get("/readyz", (req, res) => {
  res.json({ status: "ready" });
});

app.get("/livez", (req, res) => {
  res.json({ status: "live" });
});

app.get("/db-check", async (req, res) => {
  try {
    await pool.query("SELECT NOW()");
    res.json({ status: "Database connected" });
  } catch {
    res.status(500).json({ status: "Database failed" });
  }
});

/* ==========================================
   404 (MUST BE LAST)
========================================== */
app.use((req, res) => {
  res.status(404).json({
    message: "Route not found"
  });
});

/* ==========================================
   ERROR HANDLER
========================================== */
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    message: "Internal server error"
  });
});

/* ==========================================
   START SERVER
========================================== */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 SkillEarn running on port ${PORT}`);
});
