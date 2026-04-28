// withdraw.js
// REAL MONEY VERSION
// Crypto automatic payouts + Paystack manual withdrawals

const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

/* ==========================================
   AUTH
========================================== */
function auth(req, res, next) {
  const header =
    req.headers.authorization || "";

  const token =
    header.replace("Bearer ", "");

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

/* ==========================================
   CRYPTO AUTO WITHDRAWAL
========================================== */
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

      /* Check user balance here */

      const response =
        await fetch(
          "https://api.nowpayments.io/v1/payout",
          {
            method: "POST",
            headers: {
              "x-api-key":
                process.env
                  .CRYPTO_API_KEY,
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              currency: coin,
              amount,
              address:
                wallet_address
            })
          }
        );

      const data =
        await response.json();

      res.json({
        status: "success",
        automatic: true,
        payout: data
      });

    } catch {
      res.status(500).json({
        message:
          "Crypto withdrawal failed"
      });
    }
  }
);

/* ==========================================
   PAYSTACK MANUAL WITHDRAWAL
========================================== */
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

      /* Save pending request in DB */

      res.json({
        status: "pending",
        method:
          "paystack manual",
        amount,
        bank_name,
        account_name,
        account_number,
        message:
          "Admin will process manually"
      });

    } catch {
      res.status(500).json({
        message:
          "Withdrawal failed"
      });
    }
  }
);

/* ==========================================
   WITHDRAW STATUS
========================================== */
router.get(
  "/api/withdraw/status/:ref",
  auth,
  async (req, res) => {
    res.json({
      reference:
        req.params.ref,
      status: "pending"
    });
  }
);

module.exports = router;
