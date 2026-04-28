// payments.js
// REAL MONEY VERSION UPDATED
// Paystack + Crypto
// Supports Task, Freelance, Hiring, Influencer

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
   HELPERS
========================================== */
function getPrefix(purpose) {
  const prefixes = {
    task: "TASK_",
    freelance: "FREE_",
    hiring: "HIR_",
    influencer: "INF_"
  };

  return prefixes[purpose];
}

async function initPaystack(
  email,
  amount,
  reference
) {
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

  return await response.json();
}

/* ==========================================
   CREATE PAYSTACK PAYMENT
========================================== */
router.post(
  "/api/paystack/create-payment",
  auth,
  businessOnly,
  async (req, res) => {
    try {
      const {
        email,
        amount,
        title,
        purpose
      } = req.body;

      const prefix =
        getPrefix(purpose);

      if (!prefix) {
        return res.status(400).json({
          message:
            "Invalid purpose"
        });
      }

      const reference =
        prefix + Date.now();

      const data =
        await initPaystack(
          email,
          amount,
          reference
        );

      res.json({
        payment_url:
          data.data
            .authorization_url,
        reference
      });
    } catch {
      res.status(500).json({
        message:
          "Unable to initialize payment"
      });
    }
  }
);

/* ==========================================
   VERIFY PAYSTACK PAYMENT
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
   CREATE CRYPTO PAYMENT
========================================== */
router.post(
  "/api/crypto/create-payment",
  auth,
  businessOnly,
  async (req, res) => {
    try {
      const {
        amount,
        pay_currency,
        purpose,
        title
      } = req.body;

      const prefix =
        getPrefix(purpose);

      if (!prefix) {
        return res.status(400).json({
          message:
            "Invalid purpose"
        });
      }

      const reference =
        "CRYPTO_" +
        Date.now();

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
              price_amount:
                amount,
              price_currency:
                "usd",
              pay_currency,
              order_id:
                reference,
              order_description:
                title ||
                purpose
            })
          }
        );

      const data =
        await response.json();

      res.json({
        reference,
        ...data
      });
    } catch {
      res.status(500).json({
        message:
          "Crypto payment failed"
      });
    }
  }
);

module.exports = router;
