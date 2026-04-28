// security.js
// Save this file as: security.js
// Advanced protection for production deploy

const express = require("express");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");

const router = express.Router();

/* ==================================================
   GLOBAL SECURITY HEADERS
================================================== */
function applySecurity(app) {
  app.use(
    helmet({
      contentSecurityPolicy: false
    })
  );
}

/* ==================================================
   LOGIN BRUTE FORCE PROTECTION
================================================== */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    message:
      "Too many login attempts. Try later."
  }
});

/* ==================================================
   API GENERAL LIMITER
================================================== */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: {
    message:
      "Too many requests"
  }
});

/* ==================================================
   PAYMENT LIMITER
================================================== */
const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: {
    message:
      "Too many payment requests"
  }
});

/* ==================================================
   WITHDRAWAL LIMITER
================================================== */
const withdrawLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: {
    message:
      "Withdrawal limit reached"
  }
});

/* ==================================================
   SUSPICIOUS REQUEST BLOCKER
================================================== */
router.use((req, res, next) => {
  const agent =
    req.headers["user-agent"] || "";

  if (
    agent.includes("sqlmap") ||
    agent.includes("curl")
  ) {
    return res.status(403).json({
      message:
        "Blocked request"
    });
  }

  next();
});

/* ==================================================
   EXPORTS
================================================== */
module.exports = {
  applySecurity,
  loginLimiter,
  apiLimiter,
  paymentLimiter,
  withdrawLimiter,
  router
};
