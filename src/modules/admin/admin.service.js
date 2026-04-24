// src/modules/admin/admin.service.js

const db = require('../../config/db');

exports.dashboard = async () => {
  const wallet = await db.query(`SELECT SUM(amount) FROM ledger`);
  const escrow = await db.query(`SELECT SUM(amount) FROM escrow WHERE status='LOCKED'`);
  const users = await db.query(`SELECT COUNT(*) FROM users`);

  return {
    totalVolume: wallet.rows[0].sum || 0,
    lockedFunds: escrow.rows[0].sum || 0,
    users: users.rows[0].count
  };
};
