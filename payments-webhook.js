// payments-webhook.js
// FINAL PRODUCTION WEBHOOK SYSTEM
// Paystack + NOWPayments
// Auto update DB + activate campaigns

const express = require("express");
const crypto = require("crypto");

const router = express.Router();

/* ==========================================
   RAW BODY FOR SIGNATURE CHECK
========================================== */
router.use(
  express.raw({
    type: "*/*"
  })
);

/* ==========================================
   PAYSTACK WEBHOOK
========================================== */
router.post(
  "/api/webhook/paystack",
  async (req, res) => {
    try {
      const secret =
        process.env.PAYSTACK_SECRET_KEY;

      const hash =
        crypto
          .createHmac(
            "sha512",
            secret
          )
          .update(req.body)
          .digest("hex");

      const signature =
        req.headers[
          "x-paystack-signature"
        ];

      if (hash !== signature) {
        return res
          .status(401)
          .send("Invalid signature");
      }

      const event =
        JSON.parse(
          req.body.toString()
        );

      if (
        event.event ===
        "charge.success"
      ) {
        const ref =
          event.data.reference;

        const amount =
          event.data.amount /
          100;

        const pool =
          req.app.locals.pool;

        /* save/update payment */
        await pool.query(
          `
          INSERT INTO payments
          (reference,amount,status,method)
          VALUES ($1,$2,'SUCCESS','paystack')
          ON CONFLICT (reference)
          DO UPDATE SET
          status='SUCCESS'
        `,
          [ref, amount]
        );

        /* activate task if TASK_ */
        if (
          ref.startsWith(
            "TASK_"
          )
        ) {
          await pool.query(
            `
            UPDATE tasks
            SET paid=true,
                status='ACTIVE'
            WHERE payment_reference=$1
          `,
            [ref]
          );
        }

        if (
          ref.startsWith(
            "FREE_"
          )
        ) {
          await pool.query(
            `
            UPDATE freelance_jobs
            SET paid=true,
                status='ACTIVE'
            WHERE payment_reference=$1
          `,
            [ref]
          );
        }

        if (
          ref.startsWith(
            "HIR_"
          )
        ) {
          await pool.query(
            `
            UPDATE hiring_jobs
            SET paid=true,
                status='ACTIVE'
            WHERE payment_reference=$1
          `,
            [ref]
          );
        }

        if (
          ref.startsWith(
            "INF_"
          )
        ) {
          await pool.query(
            `
            UPDATE influencer_jobs
            SET paid=true,
                status='ACTIVE'
            WHERE payment_reference=$1
          `,
            [ref]
          );
        }
      }

      res.send("ok");

    } catch (error) {
      console.error(error);
      res
        .status(500)
        .send("Webhook failed");
    }
  }
);

/* ==========================================
   NOWPAYMENTS WEBHOOK
========================================== */
router.post(
  "/api/webhook/crypto",
  express.json(),
  async (req, res) => {
    try {
      const data =
        req.body;

      const ref =
        data.order_id;

      const status =
        data.payment_status;

      if (
        status !== "finished" &&
        status !== "confirmed"
      ) {
        return res.send("ignored");
      }

      const amount =
        data.price_amount;

      const pool =
        req.app.locals.pool;

      await pool.query(
        `
        INSERT INTO payments
        (reference,amount,status,method)
        VALUES ($1,$2,'SUCCESS','crypto')
        ON CONFLICT (reference)
        DO UPDATE SET
        status='SUCCESS'
      `,
        [ref, amount]
      );

      if (
        ref.startsWith(
          "CRYPTO_"
        )
      ) {
        /* optional task activation here */
      }

      res.send("ok");

    } catch (error) {
      console.error(error);
      res
        .status(500)
        .send("Webhook failed");
    }
  }
);

module.exports = router;
