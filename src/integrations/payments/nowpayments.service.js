const provider = require("./nowpayments.provider");
const crypto = require("crypto");

class NowPaymentsService {

  async checkSystem() {
    return await provider.getStatus();
  }

  async listCurrencies() {
    return await provider.getCurrencies();
  }

  async calculateMinAmount(from, to) {
    return await provider.getMinAmount(from, to);
  }

  async createDeposit({ amount, currency, orderId, userId }) {

    const payload = {
      price_amount: amount,
      price_currency: "usd",
      pay_currency: currency,
      order_id: orderId,
      ipn_callback_url: `${process.env.APP_URL}/api/payments/nowpayments/webhook`,
    };

    const payment = await provider.createPayment(payload);

    return {
      paymentId: payment.payment_id,
      address: payment.pay_address,
      amount: payment.pay_amount,
      status: payment.payment_status,
    };
  }

  async verifySignature(body, signature) {
    const sorted = JSON.stringify(body, Object.keys(body).sort());

    const hash = crypto
      .createHmac("sha512", process.env.NOWPAYMENTS_IPN_SECRET)
      .update(sorted)
      .digest("hex");

    return hash === signature;
  }

}

module.exports = new NowPaymentsService();
