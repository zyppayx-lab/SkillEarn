// security.js
// FINAL UPDATED VERSION
// Helmet + Rate Limits + Scanner Blocking + OTP Protection

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

/* LOGIN */
const loginLimiter = rateLimit({
  windowMs:
    15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message:
      "Too many login attempts. Try later."
  }
});

/* GLOBAL API */
const apiLimiter = rateLimit({
  windowMs:
    15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message:
      "Too many requests"
  }
});

/* PAYMENTS */
const paymentLimiter = rateLimit({
  windowMs:
    10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message:
      "Too many payment requests"
  }
});

/* WITHDRAWALS */
const withdrawLimiter = rateLimit({
  windowMs:
    60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message:
      "Withdrawal limit reached"
  }
});

/* OTP / EMAIL VERIFY */
const otpLimiter = rateLimit({
  windowMs:
    10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message:
      "Too many OTP requests. Try later."
  }
});

/* REGISTER */
const registerLimiter = rateLimit({
  windowMs:
    30 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message:
      "Too many registrations"
  }
});

/* ==========================================
   SMART REQUEST FILTER
========================================== */
router.use(
  (req, res, next) => {
    const ua =
      (
        req.headers[
          "user-agent"
        ] || ""
      ).toLowerCase();

    const url =
      (
        req.originalUrl ||
        ""
      ).toLowerCase();

    /* ALLOW HEALTH */
    if (
      url === "/" ||
      url === "/readyz" ||
      url === "/livez" ||
      url === "/db-check"
    ) {
      return next();
    }

    /* ALLOW WEBHOOKS */
    if (
      url.includes(
        "/webhook"
      )
    ) {
      return next();
    }

    /* BLOCK BAD SCANNERS */
    const badAgents = [
      "sqlmap",
      "nikto",
      "acunetix",
      "masscan",
      "nmap",
      "dirbuster",
      "zgrab",
      "curlscanner",
      "wpscan"
    ];

    if (
      badAgents.some(
        word =>
          ua.includes(
            word
          )
      )
    ) {
      return res
        .status(403)
        .json({
          message:
            "Blocked request"
        });
    }

    next();
  }
);

/* ==========================================
   EXPORT
========================================== */
module.exports = {
  applySecurity,
  loginLimiter,
  apiLimiter,
  paymentLimiter,
  withdrawLimiter,
  otpLimiter,
  registerLimiter,
  router
};
