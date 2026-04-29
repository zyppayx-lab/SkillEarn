// payments-webhook.js
// FINAL AUTOMATED VERSION
// Paystack + Crypto Webhooks
// Auto Create Tasks / Jobs
// Includes Small Escrow Hold

const express = require("express");
const crypto = require("crypto");

const router = express.Router();

/* ==========================================
   RAW BODY FOR PAYSTACK
========================================== */
router.post(
  "/api/webhook/paystack",
  express.raw({
    type:
      "application/json"
  }),
  async (req, res) => {
    try {
      const secret =
        process.env
          .PAYSTACK_SECRET_KEY;

      const hash =
        crypto
          .createHmac(
            "sha512",
            secret
          )
          .update(req.body)
          .digest("hex");

      if (
        hash !==
        req.headers[
          "x-paystack-signature"
        ]
      ) {
        return res
          .status(401)
          .end();
      }

      const event =
        JSON.parse(
          req.body
            .toString()
        );

      if (
        event.event !==
        "charge.success"
      ) {
        return res.end();
      }

      const pool =
        req.app.locals.pool;

      const data =
        event.data;

      const ref =
        data.reference;

      const amount =
        data.amount /
        100;

      // Prevent duplicates
      const check =
        await pool.query(
          `
          SELECT id
          FROM payments
          WHERE reference=$1
          `,
          [ref]
        );

      if (
        check.rows.length >
        0
      ) {
        return res.end();
      }

      const meta =
        data.metadata ||
        {};

      const {
        vendor_id,
        purpose,
        category,
        qty,
        title,
        description
      } = meta;

      // Escrow 10%
      const escrow =
        amount * 0.10;

      const released =
        amount - escrow;

      await pool.query(
        `
        INSERT INTO payments
        (
          vendor_id,
          amount,
          method,
          purpose,
          reference,
          status
        )
        VALUES
        ($1,$2,'paystack',$3,$4,'SUCCESS')
        `,
        [
          vendor_id,
          amount,
          purpose,
          ref
        ]
      );

      await createJob(
        pool,
        purpose,
        {
          vendor_id,
          category,
          qty,
          title,
          description,
          paid: true,
          payment_ref:
            ref
        }
      );

      await pool.query(
        `
        UPDATE vendors
        SET wallet =
        wallet + $1
        WHERE id=$2
        `,
        [
          escrow,
          vendor_id
        ]
      );

      return res.end();

    } catch (
      error
    ) {
      console.error(
        error
      );
      return res
        .status(500)
        .end();
    }
  }
);

/* ==========================================
   CRYPTO WEBHOOK
========================================== */
router.post(
  "/api/webhook/crypto",
  express.json(),
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const data =
        req.body;

      if (
        data.payment_status !==
        "finished"
      ) {
        return res.end();
      }

      const ref =
        data.order_id;

      const check =
        await pool.query(
          `
          SELECT id
          FROM payments
          WHERE reference=$1
          `,
          [ref]
        );

      if (
        check.rows.length >
        0
      ) {
        return res.end();
      }

      const meta =
        data.order_description
          .split("|");

      const purpose =
        meta[0];
      const category =
        meta[1];
      const vendor_id =
        meta[2];

      const amount =
        Number(
          data.price_amount
        ) || 0;

      const escrow =
        amount * 0.10;

      await pool.query(
        `
        INSERT INTO payments
        (
          vendor_id,
          amount,
          method,
          purpose,
          reference,
          status
        )
        VALUES
        ($1,$2,'crypto',$3,$4,'SUCCESS')
        `,
        [
          vendor_id,
          amount,
          purpose,
          ref
        ]
      );

      await createJob(
        pool,
        purpose,
        {
          vendor_id,
          category,
          qty: 1,
          title:
            purpose +
            " Campaign",
          description:
            "Crypto paid",
          paid: true,
          payment_ref:
            ref
        }
      );

      await pool.query(
        `
        UPDATE vendors
        SET wallet =
        wallet + $1
        WHERE id=$2
        `,
        [
          escrow,
          vendor_id
        ]
      );

      res.end();

    } catch (
      error
    ) {
      console.error(
        error
      );
      res
        .status(500)
        .end();
    }
  }
);

/* ==========================================
   AUTO CREATE JOBS
========================================== */
async function createJob(
  pool,
  purpose,
  data
) {
  if (
    purpose ===
    "task"
  ) {
    await pool.query(
      `
      INSERT INTO tasks
      (
        vendor_id,
        title,
        description,
        reward,
        paid,
        payment_referrence,
        status
      )
      VALUES
      ($1,$2,$3,50,$4,$5,'ACTIVE')
      `,
      [
        data.vendor_id,
        data.title,
        data.description,
        true,
        data.payment_ref
      ]
    );
  }

  if (
    purpose ===
    "social"
  ) {
    await pool.query(
      `
      INSERT INTO social_media_tasks
      (
        vendor_id,
        platform,
        action,
        title,
        description,
        reward,
        paid,
        payment_referrence,
        status
      )
      VALUES
      ($1,'instagram',$2,$3,$4,20,true,$5,'ACTIVE')
      `,
      [
        data.vendor_id,
        data.category,
        data.title,
        data.description,
        data.payment_ref
      ]
    );
  }

  if (
    purpose ===
    "freelance"
  ) {
    await pool.query(
      `
      INSERT INTO freelance_jobs
      (
        vendor_id,
        title,
        description,
        budget,
        paid,
        payment_referrence,
        status
      )
      VALUES
      ($1,$2,$3,5000,true,$4,'ACTIVE')
      `,
      [
        data.vendor_id,
        data.title,
        data.description,
        data.payment_ref
      ]
    );
  }

  if (
    purpose ===
    "hiring"
  ) {
    await pool.query(
      `
      INSERT INTO hiring_jobs
      (
        vendor_id,
        title,
        description,
        salary,
        paid,
        payment_referrence,
        status
      )
      VALUES
      ($1,$2,$3,'Negotiable',true,$4,'ACTIVE')
      `,
      [
        data.vendor_id,
        data.title,
        data.description,
        data.payment_ref
      ]
    );
  }

  if (
    purpose ===
    "influencer"
  ) {
    await pool.query(
      `
      INSERT INTO influencer_jobs
      (
        vendor_id,
        title,
        description,
        budget,
        paid,
        payment_referrence,
        status
      )
      VALUES
      ($1,$2,$3,10000,true,$4,'ACTIVE')
      `,
      [
        data.vendor_id,
        data.title,
        data.description,
        data.payment_ref
      ]
    );
  }
}

module.exports =
  router;
