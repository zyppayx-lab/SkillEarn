// src/modules/tasks/task.approval.js

const db = require('../../config/db');
const escrow = require('../../core/escrow.service');

exports.approveTask = async (taskId) => {
  const task = await db.query(
    `SELECT * FROM tasks WHERE id=$1`,
    [taskId]
  );

  await db.query(
    `UPDATE tasks SET status='ACTIVE', approved_at=NOW()
     WHERE id=$1`,
    [taskId]
  );

  await escrow.lockFunds({
    taskId,
    amount: task.rows[0].reward * task.rows[0].slots
  });
};
