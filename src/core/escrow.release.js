// src/core/escrow.release.js

const db = require('../config/db');
const wallet = require('../modules/wallets/wallet.service');

exports.releasePayment = async ({ userId, amount, taskId }) => {
  await wallet.credit({
    userId,
    amount,
    ref: 'ESCROW-' + taskId
  });

  await db.query(
    `UPDATE escrow SET status='RELEASED' WHERE task_id=$1`,
    [taskId]
  );
};
