// ===========================================
// UPDATED: src/integrations/payments/router.service.js
// Removed Stripe completely
// Supports only Paystack + Crypto
// ===========================================

const paystack = require('./providers/paystack.provider');
const crypto = require('./providers/nowpayments.provider');

exports.processDeposit = async ({ provider, data }) => {
  try {
    if (provider === 'paystack') {
      return await paystack.initialize(data);
    }

    if (provider === 'crypto') {
      return await crypto.createPayment(data);
    }

    throw new Error('Unsupported provider');
  } catch (err) {
    throw new Error(err.message || 'Deposit failed');
  }
};
