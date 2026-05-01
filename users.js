const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { Resend } = require("resend");

const router = express.Router();
const resend = new Resend(process.env.RESEND_API_KEY);

/* AUTH */
function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

/* CONFIG */
const NAIRA_MIN = 1000;
const CRYPTO_MIN = 20;
const FEE_PERCENT = 1.75;

/* OTP */
async function sendOTP(email, code) {
  await resend.emails.send({
    from: process.env.FROM_EMAIL,
    to: email,
    subject: "Verify your SkillEarn account",
    html: `<h2>SkillEarn</h2><h1>${code}</h1>`
  });
}

/* REGISTER WITH REFERRAL */
router.post("/api/auth/register", async (req, res) => {
  const pool = req.app.locals.pool;
  const { name, email, password, country, referral_code } = req.body;

  const hash = await bcrypt.hash(password, 10);
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  const user = await pool.query(
    `INSERT INTO users
    (name,email,password_hash,role,balance,status,email_verified,otp_code,otp_expires,country,referral_code)
    VALUES($1,$2,$3,'user',0,'active',false,$4,NOW()+INTERVAL '10 minutes',$5, md5(random()::text))
    RETURNING id`,
    [name, email, hash, otp, country || "NG"]
  );

  const userId = user.rows[0].id;

  /* REFERRAL TRACK */
  if (referral_code) {
    const ref = await pool.query(
      "SELECT id FROM users WHERE referral_code=$1",
      [referral_code]
    );

    if (ref.rows.length > 0) {
      const referrerId = ref.rows[0].id;

      await pool.query(
        "UPDATE users SET referred_by=$1 WHERE id=$2",
        [referrerId, userId]
      );

      const reward = country === "NG" ? 500 : 1;

      await pool.query(
        `INSERT INTO referral_earnings
        (referrer_id,referred_user_id,amount,currency)
        VALUES($1,$2,$3,$4)`,
        [referrerId, userId, reward, country === "NG" ? "NGN" : "USD"]
      );
    }
  }

  await sendOTP(email, otp);
  res.json({ message: "OTP sent" });
});

/* VERIFY */
router.post("/api/auth/verify-email", async (req, res) => {
  const pool = req.app.locals.pool;
  const { email, otp } = req.body;

  const user = await pool.query(
    `SELECT id FROM users WHERE email=$1 AND otp_code=$2 AND otp_expires > NOW()`,
    [email, otp]
  );

  if (user.rows.length === 0) {
    return res.status(400).json({ message: "Invalid OTP" });
  }

  await pool.query(
    `UPDATE users SET email_verified=true, otp_code=NULL WHERE email=$1`,
    [email]
  );

  res.json({ message: "Verified" });
});

/* LOGIN */
router.post("/api/auth/login", async (req, res) => {
  const pool = req.app.locals.pool;
  const { email, password } = req.body;

  const result = await pool.query(
    "SELECT * FROM users WHERE email=$1",
    [email]
  );

  if (result.rows.length === 0) {
    return res.status(400).json({ message: "Invalid login" });
  }

  const user = result.rows[0];

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(400).json({ message: "Invalid login" });

  if (!user.email_verified) {
    return res.status(403).json({ message: "Verify email first" });
  }

  const token = jwt.sign(
    { id: user.id, role: "user", country: user.country },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token, user });
});

/* TASK LIST */
router.get("/api/users/tasks", auth, async (req, res) => {
  const pool = req.app.locals.pool;

  const tasks = await pool.query(
    "SELECT id,title,reward FROM tasks WHERE status='ACTIVE'"
  );

  res.json(tasks.rows);
});

/* SUBMIT TASK */
router.post("/api/users/submit-task", auth, async (req, res) => {
  const pool = req.app.locals.pool;
  const { task_id, proof } = req.body;

  await pool.query(
    `INSERT INTO submissions (user_id,task_id,proof,status)
     VALUES($1,$2,$3,'PENDING')`,
    [req.user.id, task_id, proof]
  );

  res.json({ message: "Submitted" });
});

/* WALLET */
router.get("/api/users/wallet", auth, async (req, res) => {
  const pool = req.app.locals.pool;

  const result = await pool.query(
    "SELECT balance,country FROM users WHERE id=$1",
    [req.user.id]
  );

  res.json(result.rows[0]);
});

/* WITHDRAW */
router.post("/api/users/withdraw", auth, async (req, res) => {
  const pool = req.app.locals.pool;
  const { amount, bank_name, account_number, crypto_address, crypto_network } = req.body;

  const user = await pool.query(
    "SELECT balance,country FROM users WHERE id=$1",
    [req.user.id]
  );

  const u = user.rows[0];

  const isNG = u.country === "NG";
  const min = isNG ? NAIRA_MIN : CRYPTO_MIN;

  if (amount < min) return res.status(400).json({ message: "Below minimum" });
  if (amount > u.balance) return res.status(400).json({ message: "Insufficient" });

  const fee = (amount * FEE_PERCENT) / 100;

  await pool.query(
    `INSERT INTO withdrawals
    (user_id,amount,fee,type,bank_name,account_number,crypto_address,crypto_network,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'PENDING')`,
    [
      req.user.id,
      amount,
      fee,
      isNG ? "BANK" : "CRYPTO",
      bank_name,
      account_number,
      crypto_address,
      crypto_network
    ]
  );

  await pool.query(
    "UPDATE users SET balance=balance-$1 WHERE id=$2",
    [amount, req.user.id]
  );

  res.json({ message: "Withdrawal submitted" });
});

module.exports = router;
