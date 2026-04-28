// payments-webhook.js
// FULL AUTO VERSION
// Vendor pays -> webhook confirms -> task goes live automatically

const express = require("express");
const crypto = require("crypto");

const router = express.Router();

/* ==================================================
   PAYSTACK WEBHOOK
================================================== */
router.post(
  "/api/webhook/paystack",
  express.raw({
    type: "application/json"
  }),
  async (req, res) => {
    const pool =
      req.app.locals.pool;

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
          .send("Invalid");
      }

      const event =
        JSON.parse(
          req.body.toString()
        );

      if (
        event.event ===
        "charge.success"
      ) {
        const data =
          event.data;

        const reference =
          data.reference;

        /* ==================================
           FIND PAYMENT RECORD
        ================================== */
        const payment =
          await pool.query(
            `
            SELECT * FROM payments
            WHERE payment_reference=$1
          `,
            [reference]
          );

        if (
          payment.rows.length ===
          0
        ) {
          return res.sendStatus(
            200
          );
        }

        const row =
          payment.rows[0];

        /* ==================================
           PREVENT DUPLICATE
        ================================== */
        if (
          row.status ===
          "SUCCESS"
        ) {
          return res.sendStatus(
            200
          );
        }

        /* ==================================
           MARK SUCCESS
        ================================== */
        await pool.query(
          `
          UPDATE payments
          SET status='SUCCESS'
          WHERE payment_reference=$1
        `,
          [reference]
        );

        /* ==================================
           CREATE TASK AUTOMATICALLY
        ================================== */
        if (
          row.purpose ===
          "task"
        ) {
          await pool.query(
            `
            INSERT INTO tasks
            (
              vendor_id,
              title,
              reward,
              paid,
              payment_reference,
              status
            )
            VALUES
            ($1,$2,$3,true,$4,'ACTIVE')
          `,
            [
              row.vendor_id,
              row.task_title,
              row.amount,
              reference
            ]
          );
        }

        /* ==================================
           FREELANCE JOB
        ================================== */
        if (
          row.purpose ===
          "freelance"
        ) {
          await pool.query(
            `
            INSERT INTO freelance_jobs
            (
              vendor_id,
              title,
              budget,
              paid,
              payment_reference,
              status
            )
            VALUES
            ($1,$2,$3,true,$4,'ACTIVE')
          `,
            [
              row.vendor_id,
              row.task_title,
              row.amount,
              reference
            ]
          );
        }

        /* ==================================
           HIRING JOB
        ================================== */
        if (
          row.purpose ===
          "hiring"
        ) {
          await pool.query(
            `
            INSERT INTO hiring_jobs
            (
              vendor_id,
              title,
              salary,
              paid,
              payment_reference,
              status
            )
            VALUES
            ($1,$2,$3,true,$4,'ACTIVE')
          `,
            [
              row.vendor_id,
              row.task_title,
              row.amount,
              reference
            ]
          );
        }

        /* ==================================
           INFLUENCER JOB
        ================================== */
        if (
          row.purpose ===
          "influencer"
        ) {
          await pool.query(
            `
            INSERT INTO influencer_jobs
            (
              vendor_id,
              title,
              budget,
              paid,
              payment_reference,
              status
            )
            VALUES
            ($1,$2,$3,true,$4,'ACTIVE')
          `,
            [
              row.vendor_id,
              row.task_title,
              row.amount,
              reference
            ]
          );
        }
      }

      res.sendStatus(200);

    } catch (error) {
      console.error(error);
      res.sendStatus(500);
    }
  }
);

/* ==================================================
   CRYPTO WEBHOOK
================================================== */
router.post(
  "/api/webhook/crypto",
  express.json(),
  async (req, res) => {
    try {
      // Same logic as paystack
      // mark success
      // create task/job

      res.sendStatus(200);

    } catch {
      res.sendStatus(500);
    }
  }
);

module.exports = router;
