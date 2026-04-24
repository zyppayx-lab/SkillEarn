// src/modules/payments/webhook.controller.js

const wallet = require('../wallets/wallet.service');

exports.paystackWebhook = async (req, res) => {
  const event = req.body;

  if (event.event === 'charge.success') {
    await wallet.credit({
      userId: event.data.metadata.userId,
      amount: event.data.amount / 100,
      ref: event.data.reference
    });
  }

  res.sendStatus(200);
};
