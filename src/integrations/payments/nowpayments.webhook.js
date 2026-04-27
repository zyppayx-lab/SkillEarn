// src/integrations/payments/providers/nowpayments.webhook.js

const service = require('./nowpayments.service');
const wallet = require('../../../modules/wallets/wallet.service');

async function webhook(req, res) {
  try {

    const signature = req.headers['x-nowpayments-sig'];

    const isValid = await service.verifySignature(req.body, signature);

    if (!isValid) {
      return res.status(403).json({ error: 'Invalid signature' });
    }

    const payment = req.body;

    if (payment.payment_status === 'finished') {

      const userId = payment.order_id; // IMPORTANT FIX

      await wallet.credit({
        userId,
        amount: payment.price_amount,
        ref: payment.payment_id,
        type: 'BUSINESS'
      });

    }

    return res.status(200).json({ success: true });

  } catch (err) {
    return res.status(500).json({ error: 'Webhook error' });
  }
}

module.exports = { webhook };
