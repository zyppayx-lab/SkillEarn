// src/modules/analytics/analytics.service.jssrc/modules/analytics/analytics.service.js

const db = require('../../config/db');

exports.platformStats = async () => {
  const users = await db.query(`SELECT COUNT(*) FROM users`);
  const revenue = await db.query(
    `SELECT SUM(amount) FROM ledger WHERE type='credit'`
  );

  return {
    totalUsers: users.rows[0].count,
    totalRevenue: revenue.rows[0].sum || 0
  };
};
