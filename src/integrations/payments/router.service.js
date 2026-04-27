// src/integrations/payments/router.service.js

const paystack = require('./providers/paystack.provider');
const crypto = require('./providers/nowpayments.provider');

exports.processDeposit = async ({ provider, data }) => {
  try {

    // Basic validation (IMPORTANT FIX)
    if (!provider) {
      throw new Error('Payment provider is required');
    }

    if (!data || typeof data !== 'object') {
      throw new Error('Invalid payment data');
    }

    // Normalize provider
    const selectedProvider = provider.toLowerCase();

    // PAYSTACK FLOW
    if (selectedProvider === 'paystack') {
      if (!data.email || !data.amount) {
        throw new Error('Paystack requires email and amount');
      }

      return await paystack.initialize(data);
    }

    // CRYPTO FLOW (NOWPAYMENTS)
    if (selectedProvider === 'crypto') {
      if (!data.amount || !data.currency || !data.orderId) {
        throw new Error('Crypto payment requires amount, currency, orderId');
      }

      return await crypto.createPayment(data);
    }

    throw new Error('Unsupported payment provider');

  } catch (err) {
    console.error('Payment Router Error:', err.message);
    throw new Error(err.message || 'Deposit failed');
  }
};
