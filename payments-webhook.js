// payments-webhook.js
// FINAL PRODUCTION VERSION (CLEAN + SAFE + CORRECT LOGIC)

const express = require("express");
const crypto = require("crypto");

const router = express.Router();

/* ==========================================
   PAYSTACK WEBHOOK
========================================== */
router.post(
  "/paystack",
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

      await processPaystackPayment(event.data, req);

      return res.end();

    } catch (error) {
      console.error("❌ Webhook error:", error);
      return res.status(500).end();
    }
  }
);

/* ==========================================
   PAYSTACK VERIFY (FALLBACK)
========================================== */
router.post(
  "/paystack/verify",
  express.json(),
  async (req, res) => {
    console.log("🔁 MANUAL VERIFY HIT");

    try {
      const { reference } = req.body;

      if (!reference) {
        return res.status(400).json({
          message: "Reference required"
        });
      }

      const verify = await fetch(
        `https://api.paystack.co/transaction/verify/${reference}`,
        {
          headers: {
            Authorization:
              "Bearer " + process.env.PAYSTACK_SECRET_KEY
          }
        }
      );

      const result = await verify.json();

      if (!result.status || result.data.status !== "success") {
        return res.status(400).json({
          message: "Payment not successful"
        });
      }

      await processPaystackPayment(result.data, req);

      return res.json({
        message: "Payment verified and processed"
      });

    } catch (error) {
      console.error("❌ Verify error:", error);
      return res.status(500).json({
        message: "Verification failed"
      });
    }
  }
);

/* ==========================================
   CRYPTO WEBHOOK
========================================== */
router.post(
  "/crypto",
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

      /* DUPLICATE CHECK */
      const exists = await pool.query(
        "SELECT id FROM payments WHERE reference=$1",
        [reference]
      );

      if (exists.rows.length > 0) {
        console.log("⚠️ Duplicate crypto webhook");
        return res.end();
      }

      const meta = (data.order_description || "").split("|");

      const purpose = meta[0] || "task";
      const category = meta[1] || "";
      const vendorId = Number(meta[2] || 0);
      const title = meta[3] || "Crypto Campaign";
      const description = meta[4] || "Crypto Paid";

      const amount = Number(data.price_amount) || 0;

      /* ✅ CHECK VENDOR EXISTS */
      const vendorCheck = await pool.query(
        "SELECT id FROM vendors WHERE id=$1",
        [vendorId]
      );

      if (vendorCheck.rows.length === 0) {
        console.log("❌ Vendor does not exist:", vendorId);
        return res.end();
      }

      const escrow = amount * 0.1;
      const released = amount - escrow;

      await pool.query(
        `
        INSERT INTO payments
        (vendor_id, amount, escrow_amount, released_amount, method, purpose, reference, status)
        VALUES ($1,$2,$3,$4,'crypto',$5,$6,'SUCCESS')
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

      console.log("✅ Crypto saved:", reference);

      await createJob(pool, purpose, {
        vendor_id: vendorId,
        category,
        title,
        description,
        payment_ref: reference
      });

      return res.end();

    } catch (error) {
      console.error("❌ Crypto error:", error);
      return res.status(500).end();
    }
  }
);

/* ==========================================
   SHARED PROCESSOR
========================================== */
async function processPaystackPayment(data, req) {
  const pool = req.app.locals.pool;

  const reference = data.reference;
  const amount = Number(data.amount) / 100;

  /* DUPLICATE CHECK */
  const exists = await pool.query(
    "SELECT id FROM payments WHERE reference=$1",
    [reference]
  );

  if (exists.rows.length > 0) {
    console.log("⚠️ Already processed:", reference);
    return;
  }

  const meta = data.metadata || {};

  const vendorId = Number(meta.vendor_id || 0);
  const purpose = meta.purpose || "task";
  const category = meta.category || "";
  const qty = Number(meta.qty || 1);
  const title = meta.title || "Campaign";
  const description = meta.description || "";

  /* ✅ CHECK VENDOR EXISTS */
  const vendorCheck = await pool.query(
    "SELECT id FROM vendors WHERE id=$1",
    [vendorId]
  );

  if (vendorCheck.rows.length === 0) {
    console.log("❌ Vendor does not exist:", vendorId);
    return;
  }

  const escrow = amount * 0.1;
  const released = amount - escrow;

  await pool.query(
    `
    INSERT INTO payments
    (vendor_id, amount, escrow_amount, released_amount, method, purpose, reference, status)
    VALUES ($1,$2,$3,$4,'paystack',$5,$6,'SUCCESS')
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

  await createJob(pool, purpose, {
    vendor_id: vendorId,
    category,
    qty,
    title,
    description,
    payment_ref: reference
  });

  console.log("✅ Job created:", reference);
}

/* ==========================================
   CREATE JOBS (SAFE)
========================================== */
async function createJob(pool, purpose, data) {
  try {
    if (purpose === "task") {
      await pool.query(
        `
        INSERT INTO tasks
        (vendor_id, title, description, reward, paid, payment_reference, status)
        VALUES ($1,$2,$3,50,true,$4,'ACTIVE')
        `,
        [data.vendor_id, data.title, data.description, data.payment_ref]
      );
    }

    if (purpose === "social") {
      await pool.query(
        `
        INSERT INTO social_tasks
        (vendor_id, platform, action, title, description, reward, paid, payment_reference, status)
        VALUES ($1,'instagram',$2,$3,$4,20,true,$5,'ACTIVE')
        `,
        [data.vendor_id, data.category, data.title, data.description, data.payment_ref]
      );
    }

    if (purpose === "freelance") {
      await pool.query(
        `
        INSERT INTO freelance_jobs
        (vendor_id, title, description, budget, paid, payment_reference, status)
        VALUES ($1,$2,$3,5000,true,$4,'ACTIVE')
        `,
        [data.vendor_id, data.title, data.description, data.payment_ref]
      );
    }

    if (purpose === "hiring") {
      await pool.query(
        `
        INSERT INTO hiring_jobs
        (vendor_id, title, description, salary, paid, payment_reference, status)
        VALUES ($1,$2,$3,'Negotiable',true,$4,'ACTIVE')
        `,
        [data.vendor_id, data.title, data.description, data.payment_ref]
      );
    }

    if (purpose === "influencer") {
      await pool.query(
        `
        INSERT INTO influencer_jobs
        (vendor_id, title, description, budget, paid, payment_reference, status)
        VALUES ($1,$2,$3,10000,true,$4,'ACTIVE')
        `,
        [data.vendor_id, data.title, data.description, data.payment_ref]
      );
    }

  } catch (err) {
    console.error("❌ Job creation failed:", err);
  }
}

module.exports = router;
