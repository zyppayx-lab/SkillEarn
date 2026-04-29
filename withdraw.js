const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

/* ==========================================
   AUTH
========================================== */
function auth(req, res, next) {
  const token =
    (req.headers.authorization || "")
      .replace("Bearer ", "");

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

/* ==========================================
   FRAUD SCORE SYSTEM
========================================== */
async function getFraudScore(pool, userId) {
  let score = 0;

  // Too many withdrawals
  const w = await pool.query(`
    SELECT COUNT(*) FROM withdrawals
    WHERE user_id=$1
    AND created_at > NOW() - INTERVAL '10 minutes'
  `, [userId]);

  if (Number(w.rows[0].count) >= 3) score += 40;

  // Multiple IPs
  const ip = await pool.query(`
    SELECT COUNT(DISTINCT ip_address)
    FROM login_logs
    WHERE user_id=$1
    AND created_at > NOW() - INTERVAL '24 hours'
  `, [userId]);

  if (Number(ip.rows[0].count) >= 5) score += 30;

  return score;
}

/* ==========================================
   MAIN WITHDRAW
========================================== */
router.post("/api/withdraw", auth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const {
      amount,
      bank_name,
      account_name,
      account_number,
      wallet_address,
      coin
    } = req.body;

    const userRes = await pool.query(
      "SELECT * FROM users WHERE id=$1",
      [req.user.id]
    );

    const user = userRes.rows[0];
    const amt = Number(amount);

    if (amt > Number(user.balance)) {
      return res.status(400).json({
        message: "Insufficient balance"
      });
    }

    /* ==========================================
       DETERMINE METHOD
    ========================================== */
    let method =
      user.country === "NG" ? "bank" : "crypto";

    if (wallet_address) method = "crypto";

    /* ==========================================
       LIMITS
    ========================================== */
    if (method === "bank" && amt < 1000) {
      return res.status(400).json({
        message: "Min ₦1000"
      });
    }

    if (method === "crypto" && amt < 20) {
      return res.status(400).json({
        message: "Min $20"
      });
    }

    const fee = amt * 0.0175;
    const finalAmount = amt - fee;

    /* ==========================================
       FRAUD SCORE
    ========================================== */
    const risk = await getFraudScore(
      pool,
      req.user.id
    );

    let status = "PENDING";

    if (risk >= 50) {
      status = "FLAGGED";
    }

    /* ==========================================
       SAVE FIRST (IMPORTANT)
    ========================================== */
    const save = await pool.query(`
      INSERT INTO withdrawals
      (user_id,amount,fee,final_amount,method,bank_name,account_name,account_number,wallet_address,coin,status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [
      req.user.id,
      amt,
      fee,
      finalAmount,
      method,
      bank_name || null,
      account_name || null,
      account_number || null,
      wallet_address || null,
      coin || null,
      status
    ]);

    const withdrawal = save.rows[0];

    /* Deduct balance */
    await pool.query(`
      UPDATE users
      SET balance=balance-$1
      WHERE id=$2
    `, [amt, req.user.id]);

    /* ==========================================
       AUTO CRYPTO PAYOUT (ONLY IF SAFE)
    ========================================== */
    if (
      method === "crypto" &&
      status === "PENDING"
    ) {
      try {
        const response = await fetch(
          "https://api.nowpayments.io/v1/payout",
          {
            method: "POST",
            headers: {
              "x-api-key":
                process.env.CRYPTO_API_KEY,
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              currency: coin || "usdt",
              amount: finalAmount,
              address: wallet_address
            })
          }
        );

        const data = await response.json();

        await pool.query(`
          UPDATE withdrawals
          SET status='PROCESSING',
              reference=$1
          WHERE id=$2
        `, [data.id || null, withdrawal.id]);

      } catch (err) {
        console.error("Crypto error:", err);

        await pool.query(`
          UPDATE withdrawals
          SET status='FAILED'
          WHERE id=$1
        `, [withdrawal.id]);
      }
    }

    res.json({
      message:
        status === "FLAGGED"
          ? "Withdrawal flagged for review"
          : "Withdrawal submitted",
      risk,
      fee,
      finalAmount,
      method
    });

  } catch (e) {
    res.status(500).json({
      message: e.message
    });
  }
});

/* ==========================================
   WEBHOOK (AUTO CONFIRM)
========================================== */
router.post("/api/withdraw/webhook", async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const { payment_id, status } = req.body;

    if (status === "finished") {
      await pool.query(`
        UPDATE withdrawals
        SET status='PAID'
        WHERE reference=$1
      `, [payment_id]);
    }

    res.sendStatus(200);

  } catch {
    res.sendStatus(500);
  }
});

/* ==========================================
   RETRY FAILED CRYPTO
========================================== */
router.post("/api/withdraw/retry/:id", auth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const w = await pool.query(`
      SELECT * FROM withdrawals
      WHERE id=$1 AND user_id=$2
    `, [req.params.id, req.user.id]);

    if (w.rows.length === 0)
      return res.status(404).json({
        message: "Not found"
      });

    const row = w.rows[0];

    if (row.status !== "FAILED")
      return res.status(400).json({
        message: "Not retryable"
      });

    // You can re-call payout API here

    res.json({
      message: "Retry initiated"
    });

  } catch {
    res.status(500).json({
      message: "Retry failed"
    });
  }
});

module.exports = router;
