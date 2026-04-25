// ===========================================
// UPDATED: src/integrations/payments/providers/nowpayments.webhook.js
// ===========================================

const service = require('./nowpayments.service');

async function webhook(req, res) {
  try {

    const signature =
      req.headers['x-nowpayments-sig'];

    const isValid =
      await service.verifySignature(
        req.body,
        signature
      );

    if (!isValid) {
      return res.status(403).json({
        error: 'Invalid signature'
      });
    }

    const payment = req.body;

    if (payment.payment_status === 'finished') {

      console.log(
        'CRYPTO PAYMENT SUCCESS:',
        payment.payment_id
      );

      // TODO:
      // Credit user wallet
      // Save transaction
      // Send notification
    }

    return res.status(200).json({
      success: true
    });

  } catch (err) {

    return res.status(500).json({
      error: 'Webhook error'
    });
  }
}

module.exports = { webhook };
