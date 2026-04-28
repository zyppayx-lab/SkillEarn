// business.js
// Save this file as: business.js
// Business has NO wallet.
// Business pays directly when posting tasks/jobs.
// User crypto withdrawals = automatic
// User paystack withdrawals = manual

const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

/* =========================
   AUTH
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
   BUSINESS ONLY
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
   BUSINESS DASHBOARD
================================================== */
router.get(
  "/api/business/dashboard",
  auth,
  businessOnly,
  async (req, res) => {
    res.json({
      message: "Business dashboard active",
      note:
        "No wallet. Pay directly per task/job post.",
      active_jobs: 0,
      total_posts: 0
    });
  }
);

/* ==================================================
   CREATE MICRO TASK
   Must pay first
================================================== */
router.post(
  "/api/business/create-task",
  auth,
  businessOnly,
  async (req, res) => {
    const {
      title,
      reward,
      payment_method
    } = req.body;

    res.json({
      message:
        "Pay first before task goes live",
      type: "microtask",
      payment_method,
      title,
      reward
    });
  }
);

/* ==================================================
   CREATE FREELANCE JOB
================================================== */
router.post(
  "/api/business/create-freelance",
  auth,
  businessOnly,
  async (req, res) => {
    const {
      title,
      budget,
      payment_method
    } = req.body;

    res.json({
      message:
        "Pay first before freelance job goes live",
      type: "freelance",
      payment_method,
      title,
      budget
    });
  }
);

/* ==================================================
   CREATE HIRING JOB
================================================== */
router.post(
  "/api/business/create-hiring",
  auth,
  businessOnly,
  async (req, res) => {
    const {
      title,
      salary,
      payment_method
    } = req.body;

    res.json({
      message:
        "Pay first before hiring job goes live",
      type: "hiring",
      payment_method,
      title,
      salary
    });
  }
);

/* ==================================================
   CREATE INFLUENCER CAMPAIGN
================================================== */
router.post(
  "/api/business/create-influencer",
  auth,
  businessOnly,
  async (req, res) => {
    const {
      title,
      budget,
      payment_method
    } = req.body;

    res.json({
      message:
        "Pay first before campaign goes live",
      type: "influencer",
      payment_method,
      title,
      budget
    });
  }
);

/* ==================================================
   PAYMENT METHODS
================================================== */
router.get(
  "/api/business/payment-methods",
  auth,
  businessOnly,
  async (req, res) => {
    res.json([
      "paystack",
      "crypto_btc",
      "crypto_eth",
      "crypto_usdt",
      "crypto_ltc"
    ]);
  }
);

/* ==================================================
   USER WITHDRAWAL RULES
================================================== */
router.get(
  "/api/withdrawal/info",
  auth,
  async (req, res) => {
    res.json({
      crypto_withdrawal:
        "Automatic after request",
      paystack_withdrawal:
        "Manual admin processing"
    });
  }
);

module.exports = router;
