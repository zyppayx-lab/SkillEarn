// payments.js
// Save this file as: payments.js
// Business must pay before task is created

const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const router = express.Router();

/* =========================
   AUTH MIDDLEWARE
========================= */
function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.replace("Bearer ", "");

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

/* =========================
   ONLY BUSINESS / ADMIN
========================= */
function businessOnly(req, res, next) {
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

/* ==================================================
   PAYSTACK PAYMENT INIT
   Business pays before posting task
================================================== */
router.post(
  "/api/paystack/create-task-payment",
  auth,
  businessOnly,
  async (req, res) => {
    try {
      const {
        email,
        amount,
        task_title
      } = req.body;

      const reference =
        "TASK_" + Date.now();

      res.json({
        payment_method: "paystack",
        reference,
        amount,
        email,
        task_title,
        message:
          "Use this reference with Paystack initialize API"
      });

    } catch {
      res.status(500).json({
        message: "Payment failed"
      });
    }
  }
);

/* ==================================================
   CRYPTO PAYMENT
   BTC / ETH / USDT / LTC etc
================================================== */
router.post(
  "/api/crypto/create-task-payment",
  auth,
  businessOnly,
  async (req, res) => {
    try {
      const {
        coin,
        amount,
        task_title
      } = req.body;

      const ref =
        "CRYPTO_" + Date.now();

      const fakeWallet =
        "wallet_" +
        crypto.randomBytes(8).toString("hex");

      res.json({
        payment_method: "crypto",
        reference: ref,
        coin,
        amount,
        wallet_address: fakeWallet,
        task_title,
        status: "Awaiting payment"
      });

    } catch {
      res.status(500).json({
        message: "Crypto payment failed"
      });
    }
  }
);

/* ==================================================
   VERIFY PAYMENT THEN CREATE TASK
================================================== */
router.post(
  "/api/business/task/create-paid",
  auth,
  businessOnly,
  async (req, res) => {
    try {
      const {
        payment_reference,
        title,
        description,
        reward
      } = req.body;

      // Here you verify Paystack or Crypto webhook first

      res.json({
        message:
          "Payment confirmed. Task can now be created.",
        payment_reference,
        title,
        reward
      });

    } catch {
      res.status(500).json({
        message: "Unable to create task"
      });
    }
  }
);

module.exports = router;
