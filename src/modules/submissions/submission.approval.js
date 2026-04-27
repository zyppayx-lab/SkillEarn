// src/modules/submissions/submission.approval.js

const db = require('../../config/db');
const earnings = require('../payments/user.earnings.service');
const escrow = require('../../core/escrow.release');

exports.approveSubmission = async (submissionId) => {

  const submission = await db.query(
    `SELECT * FROM submissions WHERE id=$1`,
    [submissionId]
  );

  const data = submission.rows[0];

  await db.query(
    `UPDATE submissions SET status='APPROVED' WHERE id=$1`,
    [submissionId]
  );

  // release escrow → pay user
  await escrow.releasePayment({
    userId: data.user_id,
    amount: data.reward || 100, // fallback or join task table
    taskId: data.task_id
  });

  return { success: true };
};
