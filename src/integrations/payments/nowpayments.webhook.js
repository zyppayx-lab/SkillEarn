const service = require("./nowpayments.service");

async function webhook(req, res) {
  try {
    const signature = req.headers["x-nowpayments-sig"];

    const isValid = await service.verifySignature(req.body, signature);

    if (!isValid) {
      return res.status(403).json({ error: "Invalid signature" });
    }

    const payment = req.body;

    // IMPORTANT FINTECH LOGIC
    if (payment.payment_status === "finished") {

      // 1. credit wallet
      // 2. update ledger
      // 3. release escrow if needed

      console.log("PAYMENT SUCCESS:", payment.payment_id);
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Webhook error" });
  }
}

module.exports = { webhook };
