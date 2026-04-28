// withdraw.js
// Save this file as: withdraw.js
// Crypto withdrawal = automatic
// Paystack withdrawal = manual review

const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

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

/* ==================================================
   AUTO CRYPTO WITHDRAWAL
================================================== */
router.post(
  "/api/withdraw/crypto",
  auth,
  async (req, res) => {
    try {
      const {
        coin,
        amount,
        wallet_address
      } = req.body;

      const reference =
        "CRW_" +
        crypto.randomBytes(6).toString("hex");

      // Connect your crypto provider API here
      // Binance / NOWPayments / Coinbase

      res.json({
        status: "success",
        method: "crypto",
        automatic: true,
        coin,
        amount,
        wallet_address,
        reference,
        message:
          "Crypto withdrawal sent automatically"
      });

    } catch {
      res.status(500).json({
        message:
          "Crypto withdrawal failed"
      });
    }
  }
);

/* ==================================================
   PAYSTACK MANUAL WITHDRAWAL
================================================== */
router.post(
  "/api/withdraw/paystack",
  auth,
  async (req, res) => {
    try {
      const {
        amount,
        bank_name,
        account_name,
        account_number
      } = req.body;

      const reference =
        "PSW_" +
        crypto.randomBytes(6).toString("hex");

      // Save to DB pending admin approval

      res.json({
        status: "pending",
        method: "paystack",
        automatic: false,
        amount,
        bank_name,
        account_name,
        account_number,
        reference,
        message:
          "Withdrawal submitted for manual processing"
      });

    } catch {
      res.status(500).json({
        message:
          "Paystack withdrawal failed"
      });
    }
  }
);

/* ==================================================
   WITHDRAWAL STATUS
================================================== */
router.get(
  "/api/withdraw/status/:ref",
  auth,
  async (req, res) => {
    res.json({
      reference: req.params.ref,
      status: "pending"
    });
  }
);

/* ==================================================
   WITHDRAWAL RULES
================================================== */
router.get(
  "/api/withdraw/info",
  auth,
  async (req, res) => {
    res.json({
      crypto:
        "Automatic instant processing",
      paystack:
        "Manual admin approval",
      minimum_withdrawal: 1000
    });
  }
);

module.exports = router;
