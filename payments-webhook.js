// payments-webhook.js
// Save as: payments-webhook.js
// SkillEarn Production Webhooks
// Backend: https://api.skillearn.com
// Frontend: https://skillearn.com

const express = require("express");
const crypto = require("crypto");

const router = express.Router();

/* ==================================================
   PAYSTACK WEBHOOK
   Set in Paystack dashboard:
   https://api.skillearn.com/api/webhook/paystack
================================================== */
router.post(
  "/api/webhook/paystack",
  express.raw({
    type: "application/json"
  }),
  async (req, res) => {
    try {
      const signature =
        req.headers[
          "x-paystack-signature"
        ];

      const hash =
        crypto
          .createHmac(
            "sha512",
            process.env
              .PAYSTACK_SECRET_KEY
          )
          .update(req.body)
          .digest("hex");

      if (hash !== signature) {
        return res
          .status(401)
          .send("Invalid signature");
      }

      const event =
        JSON.parse(
          req.body.toString()
        );

      /* ======================================
         PAYMENT SUCCESS
      ====================================== */
      if (
        event.event ===
        "charge.success"
      ) {
        const payment =
          event.data;

        const reference =
          payment.reference;

        const amount =
          payment.amount / 100;

        const email =
          payment.customer.email;

        // TODO:
        // 1. Check if already processed
        // 2. Mark payment SUCCESS in DB
        // 3. Create task/job
        // 4. Send notification
        // 5. Prevent duplicates

        console.log(
          "Paystack success:",
          reference,
          amount,
          email
        );
      }

      return res.sendStatus(200);

    } catch (error) {
      console.error(error);
      return res.sendStatus(500);
    }
  }
);

/* ==================================================
   CRYPTO WEBHOOK
   Provider dashboard:
   https://api.skillearn.com/api/webhook/crypto
================================================== */
router.post(
  "/api/webhook/crypto",
  express.json(),
  async (req, res) => {
    try {
      const secret =
        req.headers[
          "x-nowpayments-sig"
        ];

      if (
        secret !==
        process.env
          .CRYPTO_WEBHOOK_SECRET
      ) {
        return res
          .status(401)
          .send("Invalid signature");
      }

      const payment =
        req.body;

      if (
        payment.payment_status ===
        "finished"
      ) {
        const reference =
          payment.payment_id;

        const amount =
          payment.price_amount;

        const coin =
          payment.pay_currency;

        // TODO:
        // 1. Check duplicate
        // 2. Mark SUCCESS in DB
        // 3. Create task/job
        // 4. Notify business

        console.log(
          "Crypto paid:",
          reference,
          amount,
          coin
        );
      }

      return res.sendStatus(200);

    } catch (error) {
      console.error(error);
      return res.sendStatus(500);
    }
  }
);

module.exports = router;
