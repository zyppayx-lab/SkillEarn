// src/modules/payments/deposit.service.js

const router = require('../../integrations/payments/router.service');
const wallet = require('../../modules/wallets/wallet.service');
const fraud = require('../../core/fraud.engine');

exports.deposit = async (data) => {

  const risk = fraud.scoreTransaction(data);

  if (risk.risk === 'HIGH') {
    throw new Error('Transaction blocked by fraud system');
  }

  const payment = await router.processDeposit(data);

  await wallet.credit({
    userId: data.userId,
    amount: data.amount,
    ref: payment.reference || payment.payment_id,
    type: 'BUSINESS' // IMPORTANT FIX
  });

  return payment;
};
