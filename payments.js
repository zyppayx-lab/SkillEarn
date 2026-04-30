// payments.js
// FINAL PRODUCTION VERSION (FIXED)
// Paystack + Crypto + Metadata-safe
// Auto Pricing Engine + Vendor Linking

const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

/* ==========================================
   AUTH
========================================== */
function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

function businessOnly(req, res, next) {
  if (req.user.role !== "vendor" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Business only" });
  }
  next();
}

/* ==========================================
   PRICING ENGINE
========================================== */
function calcPrice(purpose, category, qty) {
  qty = Number(qty) || 1;

  const prices = {
    task: {
      signup: 50,
      install: 80,
      survey: 100,
      visit: 30
    },
    social: {
      follow: 30,
      like: 20,
      comment: 50,
      join: 35
    },
    hiring: {
      "7days": 5000,
      "14days": 8000,
      "30days": 15000
    },
    freelance: {
      basic: 5000,
      standard: 10000,
      premium: 25000
    },
    influencer: {
      nano: 10000,
      micro: 25000,
      macro: 100000
    }
  };

  const unit = prices[purpose]?.[category];
  if (!unit) return null;

  if (
    purpose === "hiring" ||
    purpose === "freelance" ||
    purpose === "influencer"
  ) {
    return unit;
  }

  return unit * qty;
}

/* ==========================================
   HELPERS
========================================== */
function getPrefix(purpose) {
  return {
    task: "TASK_",
    social: "SOC_",
    hiring: "HIR_",
    freelance: "FREE_",
    influencer: "INF_"
  }[purpose];
}

/* ==========================================
   PAYSTACK INIT (FIXED)
========================================== */
async function initPaystack(email, amount, ref, meta) {
  const response = await fetch(
    "https://api.paystack.co/transaction/initialize",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.PAYSTACK_SECRET_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        amount: amount * 100, // convert to kobo
        reference: ref,
        metadata: meta // ✅ CRITICAL FIX
      })
    }
  );

  return await response.json();
}

/* ==========================================
   CREATE NGN PAYMENT (PAYSTACK)
========================================== */
router.post(
  "/api/paystack/create-payment",
  auth,
  businessOnly,
  async (req, res) => {
    try {
      const { email, purpose, category, qty } = req.body;

      const amount = calcPrice(purpose, category, qty);

      if (!amount) {
        return res.status(400).json({
          message: "Invalid pricing request"
        });
      }

      const ref = getPrefix(purpose) + Date.now();

      const metadata = {
        vendor_id: req.user.id,
        purpose
