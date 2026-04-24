const db = require('../config/db');
const ledger = require('./ledger.service');

exports.deposit = async ({ userId, amount, ref }) => {
  await ledger.credit({ userId, amount, ref });
  return { status: 'credited' };
};

exports.withdraw = async ({ userId, amount, ref }) => {
  const bal = await this.getBalance(userId);

  if (Number(bal.balance) < amount) {
    throw new Error('Insufficient funds');
  }

  await ledger.debit({ userId, amount, ref });
  return { status: 'debited' };
};

exports.getBalance = async (userId) => {
  const res = await db.query(
    `SELECT COALESCE(SUM(CASE WHEN type='credit' THEN amount ELSE -amount END),0) as balance
     FROM ledger WHERE user_id=$1`,
    [userId]
  );
  return res.rows[0];
};
