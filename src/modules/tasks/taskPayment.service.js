// src/modules/tasks/taskPayment.service.js

const wallet = require('../../modules/wallets/wallet.service');

exports.payTaskFee = async ({ userId, amount }) => {

  await wallet.debit({
    userId,
    amount,
    ref: 'TASK-FEE-' + Date.now(),
    type: 'BUSINESS'
  });

  return {
    success: true,
    message: 'Task creation fee paid'
  };
};
