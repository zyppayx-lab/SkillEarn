// payments-webhook.js
// FINAL PRODUCTION VERSION (FIXED ROUTING)
// Paystack + Crypto Webhooks
// Metadata-safe + Duplicate-safe + Logging enabled

const express = require("express");
const crypto = require("crypto");

const router = express.Router();

/* ==========================================
   PAYSTACK WEBHOOK
========================================== */
router.post(
  "/paystack", // ✅ FIXED (NO /api/webhook)
  express.raw({ type: "application/json" }),
  async (req, res) => {
    console.log("🔥 PAYSTACK WEBHOOK HIT");

    try {
      const secret = process.env.PAYSTACK_SECRET_KEY;

      const signature = req.headers["x-paystack-signature"];

      const hash = crypto
        .createHmac("sha512", secret)
        .update(req.body)
        .digest("hex");

      if (hash !== signature) {
        console.log("❌ Invalid signature");
        return res.status(401).end();
      }

      const event = JSON.parse(req.body.toString());

      if (event.event !== "charge.success") {
        return res.end();
      }

      const pool = req.app.locals.pool;

      const data = event.data;

      const reference = data.reference;
      const amount = Number(data.amount) / 100;

      /* DUPLICATE CHECK */
      const exists = await pool.query(
        "SELECT id FROM payments WHERE reference=$1",
        [reference]
      );

      if (exists.rows.length > 0) {
        console.log("⚠️ Duplicate webhook ignored");
        return res.end();
      }

      /* METADATA */
      const meta = data.metadata || {};

      const vendorId = Number(meta.vendor_id || 0);
      const purpose = meta.purpose || "task";
      const category = meta.category || "";
      const qty = Number(meta.qty || 1);
      const title = meta.title || "Campaign";
      const description = meta.description || "";

      /* ESCROW */
      const escrow = amount * 0.1;
      const released = amount - escrow;

      /* SAVE PAYMENT */
      await pool.query(
        `
        INSERT INTO payments
        (
          vendor_id,
          amount,
          escrow_amount,
          released_amount,
          method,
          purpose,
          reference,
          status
        )
        VALUES
        ($1,$2,$3,$4,'paystack',$5,$6,'SUCCESS')
        `,
        [
          vendorId,
          amount,
          escrow,
          released,
          purpose,
          reference
        ]
      );

      console.log("✅ Payment saved:", reference);

      /* CREATE JOB */
      await createJob(pool, purpose, {
        vendor_id: vendorId,
        category,
        qty,
        title,
        description,
        payment_ref: reference
      });

      console.log("✅ Job created");

      return res.end();

    } catch (error) {
      console.error("❌ Webhook error:", error);
      return res.status(500).end();
    }
  }
);

/* ==========================================
   CRYPTO WEBHOOK
========================================== */
router.post(
  "/crypto", // ✅ FIXED
  express.json(),
  async (req, res) => {
    console.log("🔥 CRYPTO WEBHOOK HIT");

    try {
      const pool = req.app.locals.pool;
      const data = req.body;

      if (data.payment_status !== "finished") {
        return res.end();
      }

      const reference = data.order_id;

      const exists = await pool.query(
        "SELECT id FROM payments WHERE reference=$1",
        [reference]
      );

      if (exists.rows.length > 0) {
        return res.end();
      }

      const meta = (data.order_description || "").split("|");

      const purpose = meta[0] || "task";
      const category = meta[1] || "";
      const vendorId = Number(meta[2] || 0);
      const title = meta[3] || "Crypto Campaign";
      const description = meta[4] || "Crypto Paid";

      const amount = Number(data.price_amount) || 0;

      const escrow = amount * 0.1;
      const released = amount - escrow;

      await pool.query(
        `
        INSERT INTO payments
        (
          vendor_id,
          amount,
          escrow_amount,
          released_amount,
          method,
          purpose,
          reference,
          status
        )
        VALUES
        ($1,$2,$3,$4,'crypto',$5,$6,'SUCCESS')
        `,
        [
          vendorId,
          amount,
          escrow,
          released,
          purpose,
          reference
        ]
      );

      console.log("✅ Crypto payment saved");

      await createJob(pool, purpose, {
        vendor_id: vendorId,
        category,
        qty: 1,
        title,
        description,
        payment_ref: reference
      });

      return res.end();

    } catch (error) {
      console.error("❌ Crypto webhook error:", error);
      return res.status(500).end();
    }
  }
);

/* ==========================================
   AUTO CREATE JOBS
========================================== */
async function createJob(pool, purpose, data) {
  if (purpose === "task") {
    await pool.query(
      `
      INSERT INTO tasks
      (vendor_id,title,description,reward,paid,payment_reference,status)
      VALUES ($1,$2,$3,50,true,$4,'ACTIVE')
      `,
      [data.vendor_id, data.title, data.description, data.payment_ref]
    );
  }

  if (purpose === "social") {
    await pool.query(
      `
      INSERT INTO social_tasks
      (vendor_id,platform,action,title,description,reward,paid,payment_reference,status)
      VALUES ($1,'instagram',$2,$3,$4,20,true,$5,'ACTIVE')
      `,
      [data.vendor_id, data.category, data.title, data.description, data.payment_ref]
    );
  }

  if (purpose === "freelance") {
    await pool.query(
      `
      INSERT INTO freelance_jobs
      (vendor_id,title,description,budget,paid,payment_reference,status)
      VALUES ($1,$2,$3,5000,true,$4,'ACTIVE')
      `,
      [data.vendor_id, data.title, data.description, data.payment_ref]
    );
  }

  if (purpose === "hiring") {
    await pool.query(
      `
      INSERT INTO hiring_jobs
      (vendor_id,title,description,salary,paid,payment_reference,status)
      VALUES ($1,$2,$3,'Negotiable',true,$4,'ACTIVE')
      `,
      [data.vendor_id, data.title, data.description, data.payment_ref]
    );
  }

  if (purpose === "influencer") {
    await pool.query(
      `
      INSERT INTO influencer_jobs
      (vendor_id,title,description,budget,paid,payment_reference,status)
      VALUES ($1,$2,$3,10000,true,$4,'ACTIVE')
      `,
      [data.vendor_id, data.title, data.description, data.payment_ref]
    );
  }
}

module.exports = router;
