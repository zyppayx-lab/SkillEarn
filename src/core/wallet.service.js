const db = require('../config/db');

exports.getBalance = async (userId) => {
  const res = await db.query(
    `SELECT COALESCE(SUM(
      CASE
        WHEN type='credit' THEN amount
        ELSE -amount
      END
    ),0) as balance
    FROM ledger WHERE user_id=$1`,
    [userId]
  );

  return res.rows[0];
};
