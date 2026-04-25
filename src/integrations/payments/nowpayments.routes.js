// ===========================================
// UPDATED: src/integrations/payments/providers/nowpayments.routes.js
// ===========================================

const express = require('express');
const router = express.Router();

const service = require('./nowpayments.service');
const webhook = require('./nowpayments.webhook');

router.get('/status', async (req, res) => {
  const data = await service.checkSystem();
  res.json(data);
});

router.post('/create', async (req, res) => {
  const result = await service.createDeposit(req.body);
  res.json(result);
});

router.post('/webhook', webhook.webhook);

module.exports = router;
