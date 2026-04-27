// src/modules/analytics/analytics.service.js

const db = require('../../config/db');

exports.platformStats = async () => {

  const users = await db.query(
    `SELECT COUNT(*) FROM users`
  );

  const revenue = await db.query(
    `SELECT COALESCE(SUM(amount),0) 
     FROM ledger 
     WHERE type='credit'`
  );

  const tasks = await db.query(
    `SELECT COUNT(*) FROM tasks`
  );

  return {
    totalUsers: Number(users.rows[0].count),
    totalRevenue: Number(revenue.rows[0].sum),
    totalTasks: Number(tasks.rows[0].count)
  };
};
