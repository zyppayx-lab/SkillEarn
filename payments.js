// payments.js
// FINAL PRODUCTION VERSION
// Auto Pricing Engine
// Supports NGN + Crypto
// Tasks + Jobs + Global Vendors

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
   PRICING ENGINE
========================================== */

function calcPrice(
  purpose,
  category,
  qty
) {
  qty =
    Number(qty) || 1;

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

  const unit =
    prices[purpose]?.[
      category
    ];

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
function getPrefix(
  purpose
) {
  return {
    task: "TASK_",
    social: "SOC_",
    hiring: "HIR_",
    freelance:
      "FREE_",
    influencer:
      "INF_"
  }[purpose];
}

/* ==========================================
   PAYSTACK INIT
========================================== */
async function initPaystack(
  email,
  amount,
  ref
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
          reference: ref
        })
      }
    );

  return await response.json();
}

/* ==========================================
   CREATE NGN PAYMENT
========================================== */
router.post(
  "/api/paystack/create-payment",
  auth,
  businessOnly,
  async (req, res) => {
    try {
      const {
        email,
        purpose,
        category,
        qty
      } = req.body;

      const amount =
        calcPrice(
          purpose,
          category,
          qty
        );

      if (!amount) {
        return res.status(400).json({
          message:
            "Invalid pricing request"
        });
      }

      const ref =
        getPrefix(
          purpose
        ) +
        Date.now();

      const data =
        await initPaystack(
          email,
          amount,
          ref
        );

      res.json({
        currency:
          "NGN",
        amount,
        reference:
          ref,
        payment_url:
          data.data
            .authorization_url
      });

    } catch {
      res.status(500).json({
        message:
          "Payment init failed"
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
        purpose,
        category,
        qty,
        pay_currency
      } = req.body;

      const amountNGN =
        calcPrice(
          purpose,
          category,
          qty
        );

      if (!amountNGN) {
        return res.status(400).json({
          message:
            "Invalid pricing request"
        });
      }

      // Approx FX
      const usd =
        (
          amountNGN /
          1600
        ).toFixed(2);

      const ref =
        "CRYPTO_" +
        Date.now();

      const response =
        await fetch(
          "https://api.nowpayments.io/v1/payment",
          {
            method:
              "POST",
            headers: {
              "x-api-key":
                process.env
                  .CRYPTO_API_KEY,
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              price_amount:
                usd,
              price_currency:
                "usd",
              pay_currency:
                pay_currency ||
                "usdttrc20",
              order_id:
                ref,
              order_description:
                purpose +
                " " +
                category
            })
          }
        );

      const data =
        await response.json();

      res.json({
        currency:
          "USD",
        usd,
        ngn:
          amountNGN,
        reference:
          ref,
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

/* ==========================================
   PRICE CHECKER
========================================== */
router.post(
  "/api/payments/check-price",
  auth,
  businessOnly,
  async (req, res) => {
    const {
      purpose,
      category,
      qty
    } = req.body;

    const amount =
      calcPrice(
        purpose,
        category,
        qty
      );

    if (!amount) {
      return res.status(400).json({
        message:
          "Invalid request"
      });
    }

    res.json({
      currency:
        "NGN",
      amount
    });
  }
);

module.exports = router;
