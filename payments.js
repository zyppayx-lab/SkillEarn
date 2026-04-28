// payments.js
// REAL MONEY VERSION
// Paystack verified payments + Crypto invoice structure

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

function businessOnly(
  req,
  res,
  next
) {
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

/* ==========================================
   PAYSTACK INIT PAYMENT
========================================== */
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

      const response =
        await fetch(
          "https://api.paystack.co/transaction/initialize",
          {
            method: "POST",
            headers: {
              Authorization:
                "Bearer " +
                process.env
                  .PAYSTACK_SECRET_KEY,
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              email,
              amount:
                amount * 100,
              reference,
              callback_url:
                "https://yourdomain.com/payment-success"
            })
          }
        );

      const data =
        await response.json();

      res.json({
        payment_url:
          data.data
            .authorization_url,
        reference
      });

    } catch (error) {
      res.status(500).json({
        message:
          "Unable to initialize payment"
      });
    }
  }
);

/* ==========================================
   VERIFY PAYSTACK
========================================== */
router.get(
  "/api/paystack/verify/:ref",
  auth,
  businessOnly,
  async (req, res) => {
    try {
      const ref =
        req.params.ref;

      const response =
        await fetch(
          "https://api.paystack.co/transaction/verify/" +
            ref,
          {
            headers: {
              Authorization:
                "Bearer " +
                process.env
                  .PAYSTACK_SECRET_KEY
            }
          }
        );

      const data =
        await response.json();

      if (
        data.data.status ===
        "success"
      ) {
        return res.json({
          paid: true,
          reference: ref
        });
      }

      res.json({
        paid: false
      });

    } catch {
      res.status(500).json({
        message:
          "Verification failed"
      });
    }
  }
);

/* ==========================================
   CRYPTO CREATE PAYMENT
   Replace provider URL with NOWPayments etc
========================================== */
router.post(
  "/api/crypto/create-task-payment",
  auth,
  businessOnly,
  async (req, res) => {
    try {
      const {
        price_amount,
        price_currency,
        pay_currency
      } = req.body;

      const response =
        await fetch(
          "https://api.nowpayments.io/v1/payment",
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
              price_amount,
              price_currency,
              pay_currency
            })
          }
        );

      const data =
        await response.json();

      res.json(data);

    } catch {
      res.status(500).json({
        message:
          "Crypto payment failed"
      });
    }
  }
);

module.exports = router;
