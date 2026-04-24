// src/core/escrow.service.js

const db = require('../config/db');

exports.lockFunds = async ({ taskId, amount }) => {
  await db.query(
    `INSERT INTO escrow(task_id, amount, status)
     VALUES ($1, $2, 'LOCKED')`,
    [taskId, amount]
  );
};

exports.releaseFunds = async ({ taskId }) => {
  await db.query(
    `UPDATE escrow SET status='RELEASED' WHERE task_id=$1`,
    [taskId]
  );
};
