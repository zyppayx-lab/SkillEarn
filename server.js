// server.js
// FIXED FOR USER JSON BODY + WEBHOOKS
// Main issue: webhook middleware mounted globally before express.json()

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const session = require("express-session");
const { Pool } = require("pg");

const app = express();

/* =========================
   ROUTES
========================= */
const paymentRoutes = require("./payments");
const webhookRoutes = require("./payments-webhook");
const adminRoutes = require("./admin");
const userRoutes = require("./users");
const businessRoutes = require("./business");
const withdrawRoutes = require("./withdraw");

const {
  applySecurity,
  loginLimiter,
  apiLimiter,
  paymentLimiter,
  withdrawLimiter,
  router: securityRoutes
} = require("./security");

/* =========================
   SAFE SETTINGS
========================= */
app.disable("x-powered-by");

/* =========================
   DATABASE
========================= */
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

app.locals.pool = pool;

/* =========================
   CORE MIDDLEWARE FIRST
========================= */
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));

app.use(session({
  secret:
    process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure:
      process.env.NODE_ENV ===
      "production",
    sameSite: "lax"
  }
}));

/* =========================
   SECURITY
========================= */
applySecurity(app);

app.use(apiLimiter);
app.use(securityRoutes);

app.use(
  "/api/auth/login",
  loginLimiter
);

app.use(
  "/api/business/login",
  loginLimiter
);

app.use(
  "/api/admin/login",
  loginLimiter
);

app.use(
  "/api/paystack",
  paymentLimiter
);

app.use(
  "/api/crypto",
  paymentLimiter
);

app.use(
  "/api/withdraw",
  withdrawLimiter
);

/* =========================
   WEBHOOK ROUTES AFTER JSON
   (webhook file should use router.post(...)
   with express.raw only on specific routes)
========================= */
app.use(webhookRoutes);

/* =========================
   MAIN ROUTES
========================= */
app.use(paymentRoutes);
app.use(adminRoutes);
app.use(userRoutes);
app.use(businessRoutes);
app.use(withdrawRoutes);

/* =========================
   HEALTH
========================= */
app.get("/", (req, res) => {
  res.json({
    status:
      "SkillEarn Backend Running",
    mode: "Production"
  });
});

app.get("/readyz", (req, res) => {
  res.json({
    status: "ready"
  });
});

app.get("/livez", (req, res) => {
  res.json({
    status: "live"
  });
});

app.get("/db-check", async (req, res) => {
  try {
    await pool.query(
      "SELECT NOW()"
    );

    res.json({
      status:
        "Database connected"
    });

  } catch {
    res.status(500).json({
      status:
        "Database failed"
    });
  }
});

/* =========================
   404
========================= */
app.use((req, res) => {
  res.status(404).json({
    message:
      "Route not found"
  });
});

/* =========================
   ERROR
========================= */
app.use(
  (err, req, res, next) => {
    console.error(err);

    res.status(500).json({
      message:
        "Internal server error"
    });
  }
);

/* =========================
   START
========================= */
const PORT =
  process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(
    `SkillEarn running on ${PORT}`
  );
});
