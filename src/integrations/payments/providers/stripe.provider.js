const Stripe = require('stripe');
const env = require('../../../config/env');
const stripe = Stripe(env.STRIPE_SECRET);

exports.charge = async (data) => {
  return await stripe.paymentIntents.create({
    amount: data.amount,
    currency: data.currency || 'usd',
    payment_method_types: ['card']
  });
};
