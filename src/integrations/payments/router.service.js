// src/integrations/payments/router.service.js

const paystack = require('./providers/paystack.provider');
const stripe = require('./providers/stripe.provider');
const crypto = require('./providers/nowpayments.provider');

exports.processDeposit = async ({ provider, data }) => {
  try {
    if (provider === 'paystack') return await paystack.initialize(data);
    if (provider === 'stripe') return await stripe.initialize(data);
    if (provider === 'crypto') return await crypto.initialize(data);

    throw new Error('Unsupported provider');
  } catch (err) {
    // failover to stripe
    return await stripe.initialize(data);
  }
};
