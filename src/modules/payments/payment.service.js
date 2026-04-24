const router = require('../../integrations/payments/router.service');
const wallet = require('../../core/wallet.service');
const fraud = require('../../core/fraud.engine');

exports.deposit = async (data) => {
  const risk = fraud.scoreTransaction(data);

  if (risk.risk === 'HIGH') {
    throw new Error('Transaction blocked by fraud system');
  }

  const payment = await router.processDeposit(data);

  await wallet.deposit({
    userId: data.userId,
    amount: data.amount,
    ref: payment.reference || 'tx'
  });

  return payment;
};
