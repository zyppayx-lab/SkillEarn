// src/modules/payments/user.earnings.service.js

const wallet = require('../../modules/wallets/wallet.service');

exports.payUser = async ({ userId, amount, taskId }) => {

  await wallet.credit({
    userId,
    amount,
    ref: 'TASK-REWARD-' + taskId,
    type: 'USER'
  });

  return { success: true };
};
