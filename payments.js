// payments.js
// FINAL PRODUCTION VERSION
// Creates payment + stores pending records
// Paystack + Crypto

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
  const map = {
    task: "TASK_",
    freelance: "FREE_",
    hiring: "HIR_",
    influencer: "INF_",
    social_task: "SOC_"
  };

  return map[purpose];
}

/* ==========================================
   PAYSTACK INIT
========================================== */
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
          reference
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
      const pool =
        req.app.locals.pool;

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

      const pay =
        await initPaystack(
          email,
          amount,
          reference
        );

      await pool.query(
        `
        INSERT INTO payments
        (
          vendor_id,
          reference,
          amount,
          purpose,
          title,
          method,
          status
        )
        VALUES
        ($1,$2,$3,$4,$5,'paystack','PENDING')
      `,
        [
          req.user.id,
          reference,
          amount,
          purpose,
          title
        ]
      );

      res.json({
        payment_url:
          pay.data
            .authorization_url,
        reference
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Unable to create payment"
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
      const pool =
        req.app.locals.pool;

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

      await pool.query(
        `
        INSERT INTO payments
        (
          vendor_id,
          reference,
          amount,
          purpose,
          title,
          method,
          status
        )
        VALUES
        ($1,$2,$3,$4,$5,'crypto','PENDING')
      `,
        [
          req.user.id,
          reference,
          amount,
          purpose,
          title
        ]
      );

      res.json({
        reference,
        ...data
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Crypto payment failed"
      });
    }
  }
);

module.exports = router;
