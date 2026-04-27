// src/modules/admin/admin.service.js

const db = require('../../config/db');

exports.dashboard = async () => {

  const walletRes = await db.query(
    `SELECT COALESCE(SUM(amount),0) AS total FROM ledger`
  );

  const escrowRes = await db.query(
    `SELECT COALESCE(SUM(amount),0) AS total FROM escrow WHERE status='LOCKED'`
  );

  const usersRes = await db.query(
    `SELECT COUNT(*) FROM users`
  );

  const withdrawalsRes = await db.query(
    `SELECT COUNT(*) FROM withdrawals WHERE status='PENDING'`
  );

  return {
    totalVolume: Number(walletRes.rows[0].total),
    lockedFunds: Number(escrowRes.rows[0].total),
    totalUsers: Number(usersRes.rows[0].count),
    pendingWithdrawals: Number(withdrawalsRes.rows[0].count)
  };
};
