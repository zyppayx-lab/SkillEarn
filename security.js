// security.js
const express = require("express");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");

const router = express.Router();

/* ==========================================
   SECURITY HEADERS
========================================== */
function applySecurity(app) {
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    })
  );
}

/* ==========================================
   LIMITERS
========================================== */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many login attempts. Try later."
  }
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many requests"
  }
});

const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many payment requests"
  }
});

const withdrawLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Withdrawal limit reached"
  }
});

/* ==========================================
   SMART REQUEST FILTER
========================================== */
router.use((req, res, next) => {
  const ua =
    (req.headers["user-agent"] || "")
      .toLowerCase();

  const url =
    (req.originalUrl || "")
      .toLowerCase();

  // allow health checks
  if (
    url === "/" ||
    url === "/readyz" ||
    url === "/livez" ||
    url === "/db-check"
  ) {
    return next();
  }

  // allow webhooks
  if (url.includes("/webhook")) {
    return next();
  }

  // block obvious scanners only
  const badAgents = [
    "sqlmap",
    "nikto",
    "acunetix",
    "masscan",
    "nmap",
    "dirbuster"
  ];

  if (
    badAgents.some(word =>
      ua.includes(word)
    )
  ) {
    return res.status(403).json({
      message: "Blocked request"
    });
  }

  next();
});

/* ==========================================
   EXPORT
========================================== */
module.exports = {
  applySecurity,
  loginLimiter,
  apiLimiter,
  paymentLimiter,
  withdrawLimiter,
  router
};
