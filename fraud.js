const MAX_WITHDRAWALS_PER_DAY = 3;
const MAX_ACCOUNTS_PER_IP = 3;

/* ==========================================
LOG FRAUD
========================================== */
async function logFraud(pool, userId, type, reason, ip) {
  await pool.query(
    `INSERT INTO fraud_logs (user_id,type,reason,ip)
     VALUES ($1,$2,$3,$4)`,
    [userId, type, reason, ip]
  );

  // Increase fraud score
  await pool.query(
    `UPDATE users
     SET fraud_score = fraud_score + 1
     WHERE id=$1`,
    [userId]
  );
}

/* ==========================================
CHECK MULTI ACCOUNT
========================================== */
async function checkMultipleAccounts(pool, ip, userId) {
  const result = await pool.query(
    `SELECT COUNT(*) FROM users WHERE last_ip=$1`,
    [ip]
  );

  if (Number(result.rows[0].count) > MAX_ACCOUNTS_PER_IP) {
    await logFraud(
      pool,
      userId,
      "MULTI_ACCOUNT",
      "Too many accounts from same IP",
      ip
    );
  }
}

/* ==========================================
CHECK WITHDRAWAL ABUSE
========================================== */
async function checkWithdrawLimit(pool, userId, ip) {
  let row = await pool.query(
    `SELECT * FROM withdrawal_limits WHERE user_id=$1`,
    [userId]
  );

  if (row.rows.length === 0) {
    await pool.query(
      `INSERT INTO withdrawal_limits (user_id,count)
       VALUES ($1,1)`,
      [userId]
    );
    return true;
  }

  let data = row.rows[0];

  // reset daily
  const now = new Date();
  const last = new Date(data.last_reset);

  if (now - last > 24 * 60 * 60 * 1000) {
    await pool.query(
      `UPDATE withdrawal_limits
       SET count=1,last_reset=NOW()
       WHERE user_id=$1`,
      [userId]
    );
    return true;
  }

  if (data.count >= MAX_WITHDRAWALS_PER_DAY) {
    await logFraud(
      pool,
      userId,
      "WITHDRAW_LIMIT",
      "Too many withdrawals",
      ip
    );
    return false;
  }

  await pool.query(
    `UPDATE withdrawal_limits
     SET count=count+1
     WHERE user_id=$1`,
    [userId]
  );

  return true;
}

/* ==========================================
CHECK SUSPICIOUS AMOUNT
========================================== */
async function checkAmountSpike(pool, userId, amount, ip) {
  const avg = await pool.query(
    `SELECT AVG(amount) FROM withdrawals WHERE user_id=$1`,
    [userId]
  );

  const average = Number(avg.rows[0].avg || 0);

  if (average > 0 && amount > average * 5) {
    await logFraud(
      pool,
      userId,
      "AMOUNT_SPIKE",
      "Unusual withdrawal spike",
      ip
    );
  }
}

/* ==========================================
BLOCK HIGH FRAUD USERS
========================================== */
async function checkFraudScore(pool, userId) {
  const user = await pool.query(
    `SELECT fraud_score FROM users WHERE id=$1`,
    [userId]
  );

  if (user.rows[0].fraud_score >= 5) {
    await pool.query(
      `UPDATE users
       SET status='blocked'
       WHERE id=$1`,
      [userId]
    );

    return false;
  }

  return true;
}

module.exports = {
  checkMultipleAccounts,
  checkWithdrawLimit,
  checkAmountSpike,
  checkFraudScore
};
