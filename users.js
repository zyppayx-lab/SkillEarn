const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const axios = require("axios");
const { Resend } = require("resend");
const db = require("./db");

const resend = new Resend(process.env.RESEND_API_KEY);

// ================= AUTH MIDDLEWARE =================
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ msg: "No token" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ msg: "Invalid token" });
  }
};

// ================= LEDGER HELPER =================
async function addTransaction({ userId, amount, type, reference }) {
  await db.query(
    `INSERT INTO transactions(user_id,amount,type,reference,status)
     VALUES($1,$2,$3,$4,'success')`,
    [userId, amount, type, reference]
  );
}

// ================= FRAUD CHECK (basic) =================
async function isSuspicious(userId, amount) {
  const recent = await db.query(
    `SELECT * FROM transactions 
     WHERE user_id=$1 AND created_at > NOW() - INTERVAL '10 minutes'`,
    [userId]
  );

  if (recent.rows.length > 10) return true;
  if (amount > 500000) return true;

  return false;
}

// ================= REGISTER =================
router.post("/register", async (req, res) => {
  const { email, password, referralCode } = req.body;

  const hash = await bcrypt.hash(password, 10);
  const refCode = crypto.randomBytes(3).toString("hex");

  const user = await db.query(
    "INSERT INTO users(email,password,referral_code) VALUES($1,$2,$3) RETURNING *",
    [email, hash, refCode]
  );

  await db.query(
    "INSERT INTO wallets(user_id,balance) VALUES($1,0)",
    [user.rows[0].id]
  );

  if (referralCode) {
    const ref = await db.query(
      "SELECT id FROM users WHERE referral_code=$1",
      [referralCode]
    );

    if (ref.rows.length) {
      await db.query(
        `INSERT INTO referrals(referrer_id,referred_id,tasks_completed)
         VALUES($1,$2,0)`,
        [ref.rows[0].id, user.rows[0].id]
      );
    }
  }

  await resend.emails.send({
    from: "no-reply@yourapp.com",
    to: email,
    subject: "Welcome",
    html: "<h2>Welcome to the platform</h2>",
  });

  const token = jwt.sign({ id: user.rows[0].id }, process.env.JWT_SECRET);

  res.json({ token });
});

// ================= LOGIN =================
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await db.query("SELECT * FROM users WHERE email=$1", [email]);
  if (!user.rows.length) return res.status(400).json({ msg: "Not found" });

  const ok = await bcrypt.compare(password, user.rows[0].password);
  if (!ok) return res.status(400).json({ msg: "Wrong password" });

  await resend.emails.send({
    from: "no-reply@yourapp.com",
    to: email,
    subject: "Login Alert",
    html: "<p>You just logged in</p>",
  });

  const token = jwt.sign({ id: user.rows[0].id }, process.env.JWT_SECRET);
  res.json({ token });
});

// ================= FORGOT PASSWORD =================
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  const code = crypto.randomBytes(3).toString("hex");

  await db.query(
    "UPDATE users SET reset_code=$1 WHERE email=$2",
    [code, email]
  );

  await resend.emails.send({
    from: "no-reply@yourapp.com",
    to: email,
    subject: "Reset Password",
    html: `<p>Code: <b>${code}</b></p>`,
  });

  res.json({ msg: "Email sent" });
});

// ================= RESET PASSWORD =================
router.post("/reset-password", async (req, res) => {
  const { email, code, newPassword } = req.body;

  const user = await db.query(
    "SELECT * FROM users WHERE email=$1 AND reset_code=$2",
    [email, code]
  );

  if (!user.rows.length)
    return res.status(400).json({ msg: "Invalid code" });

  const hash = await bcrypt.hash(newPassword, 10);

  await db.query(
    "UPDATE users SET password=$1, reset_code=NULL WHERE email=$2",
    [hash, email]
  );

  res.json({ msg: "Password updated" });
});

// ================= PAYSTACK DEPOSIT WEBHOOK =================
router.post("/paystack/webhook", express.json(), async (req, res) => {
  const hash = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (hash !== req.headers["x-paystack-signature"]) {
    return res.status(401).send("Invalid signature");
  }

  const event = req.body;

  if (event.event === "charge.success") {
    const ref = event.data.reference;
    const userId = event.data.metadata.userId;
    const amount = event.data.amount / 100;

    const exists = await db.query(
      "SELECT id FROM transactions WHERE reference=$1",
      [ref]
    );

    if (exists.rows.length) return res.sendStatus(200);

    if (await isSuspicious(userId, amount)) {
      await db.query("UPDATE users SET flagged=true WHERE id=$1", [userId]);
    }

    await db.query("BEGIN");

    try {
      await db.query(
        "UPDATE wallets SET balance = balance + $1 WHERE user_id=$2",
        [amount, userId]
      );

      await addTransaction({
        userId,
        amount,
        type: "deposit",
        reference: ref,
      });

      await db.query("COMMIT");
    } catch {
      await db.query("ROLLBACK");
    }
  }

  res.sendStatus(200);
});

// ================= TASK CREATE (1% FEE) =================
router.post("/task/create", auth, async (req, res) => {
  const { title, reward, slots } = req.body;

  const total = reward * slots;
  const fee = total * 0.01;

  const wallet = await db.query(
    "SELECT balance FROM wallets WHERE user_id=$1",
    [req.user.id]
  );

  if (wallet.rows[0].balance < total)
    return res.status(400).json({ msg: "Insufficient balance" });

  await db.query("BEGIN");

  try {
    await db.query(
      "UPDATE wallets SET balance = balance - $1 WHERE user_id=$2",
      [total, req.user.id]
    );

    await addTransaction({
      userId: req.user.id,
      amount: -total,
      type: "task_funding",
      reference: crypto.randomUUID(),
    });

    const task = await db.query(
      `INSERT INTO tasks(title,reward,slots,creator_id)
       VALUES($1,$2,$3,$4) RETURNING *`,
      [title, reward, slots, req.user.id]
    );

    await db.query("COMMIT");

    res.json({ task, fee });
  } catch {
    await db.query("ROLLBACK");
  }
});

// ================= SUBMIT TASK =================
router.post("/task/submit", auth, async (req, res) => {
  const { taskId, proof } = req.body;

  if (!proof.startsWith("data:image"))
    return res.status(400).json({ msg: "Invalid proof" });

  const exists = await db.query(
    "SELECT id FROM task_submissions WHERE task_id=$1 AND user_id=$2",
    [taskId, req.user.id]
  );

  if (exists.rows.length)
    return res.status(400).json({ msg: "Already submitted" });

  await db.query(
    `INSERT INTO task_submissions(task_id,user_id,proof,status)
     VALUES($1,$2,$3,'pending')`,
    [taskId, req.user.id, proof]
  );

  res.json({ msg: "Submitted" });
});

// ================= APPROVE TASK =================
router.post("/task/approve", auth, async (req, res) => {
  const { submissionId } = req.body;

  const sub = await db.query(
    "SELECT * FROM task_submissions WHERE id=$1",
    [submissionId]
  );

  const task = await db.query(
    "SELECT * FROM tasks WHERE id=$1",
    [sub.rows[0].task_id]
  );

  if (task.rows[0].creator_id !== req.user.id)
    return res.status(403).json({ msg: "Not allowed" });

  await db.query("BEGIN");

  try {
    await db.query(
      "UPDATE wallets SET balance = balance + $1 WHERE user_id=$2",
      [task.rows[0].reward, sub.rows[0].user_id]
    );

    await db.query(
      "UPDATE task_submissions SET status='approved' WHERE id=$1",
      [submissionId]
    );

    // referral logic (₦200 after 2 tasks)
    const ref = await db.query(
      "SELECT * FROM referrals WHERE referred_id=$1",
      [sub.rows[0].user_id]
    );

    if (ref.rows.length) {
      await db.query(
        "UPDATE referrals SET tasks_completed = tasks_completed + 1 WHERE referred_id=$1",
        [sub.rows[0].user_id]
      );

      const updated = await db.query(
        "SELECT tasks_completed FROM referrals WHERE referred_id=$1",
        [sub.rows[0].user_id]
      );

      if (updated.rows[0].tasks_completed === 2) {
        await db.query(
          "UPDATE wallets SET balance = balance + 200 WHERE user_id=$1",
          [ref.rows[0].referrer_id]
        );
      }
    }

    await db.query("COMMIT");

    res.json({ msg: "Approved" });
  } catch {
    await db.query("ROLLBACK");
  }
});

// ================= WALLET =================
router.get("/wallet", auth, async (req, res) => {
  const w = await db.query(
    "SELECT balance FROM wallets WHERE user_id=$1",
    [req.user.id]
  );

  res.json(w.rows[0]);
});

// ================= WITHDRAW (MANUAL + 0.75% FEE) =================
router.post("/withdraw", auth, async (req, res) => {
  const { amount } = req.body;

  const fee = amount * 0.0075;
  const total = amount + fee;

  const wallet = await db.query(
    "SELECT balance FROM wallets WHERE user_id=$1",
    [req.user.id]
  );

  if (wallet.rows[0].balance < total)
    return res.status(400).json({ msg: "Insufficient balance" });

  await db.query(
    "UPDATE wallets SET balance = balance - $1 WHERE user_id=$2",
    [total, req.user.id]
  );

  await addTransaction({
    userId: req.user.id,
    amount: -total,
    type: "withdrawal",
    reference: crypto.randomUUID(),
  });

  res.json({
    msg: "Withdrawal submitted (manual review)",
    fee,
    net: amount,
  });
});

module.exports = router;
