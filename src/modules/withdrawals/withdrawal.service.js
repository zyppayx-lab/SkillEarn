// ===========================================
// UPDATED: src/modules/withdrawals/withdrawal.service.js
// Crypto = automatic
// Bank = manual approval
// ===========================================

const wallet = require('../wallets/wallet.service');
const fraud = require('../../core/fraud.engine');

exports.withdraw = async ({
  userId,
  amount,
  method,
  account,
  history
}) => {

  const risk = fraud.scoreTransaction({
    amount,
    userHistory: history
  });

  if (risk.risk === 'HIGH') {
    throw new Error('Withdrawal blocked (fraud risk)');
  }

  // Debit wallet first
  await wallet.debit({
    userId,
    amount,
    ref: 'WD-' + Date.now()
  });

  // CRYPTO = automatic
  if (method === 'crypto') {
    return {
      status: 'processing',
      type: 'crypto',
      message: 'Crypto withdrawal started automatically'
    };
  }

  // BANK = manual review
  if (method === 'bank') {
    return {
      status: 'pending_manual',
      type: 'bank',
      message: 'Bank withdrawal awaiting admin approval'
    };
  }

  throw new Error('Invalid withdrawal method');
};
