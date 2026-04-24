// src/modules/withdrawals/withdrawal.service.js

const wallet = require('../wallets/wallet.service');
const fraud = require('../../core/fraud.engine');

exports.withdraw = async ({ userId, amount, history }) => {
  const risk = fraud.scoreTransaction({ amount, userHistory: history });

  if (risk.risk === 'HIGH') {
    throw new Error('Withdrawal blocked (fraud risk)');
  }

  await wallet.debit({
    userId,
    amount,
    ref: 'WD-' + Date.now()
  });

  return { status: 'processing' };
};
