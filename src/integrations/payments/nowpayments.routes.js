const express = require("express");
const router = express.Router();

const service = require("./nowpayments.service");
const webhook = require("./nowpayments.webhook");

// SYSTEM CHECK
router.get("/status", async (req, res) => {
  const data = await service.checkSystem();
  res.json(data);
});

// CREATE PAYMENT
router.post("/create", async (req, res) => {
  const result = await service.createDeposit(req.body);
  res.json(result);
});

// WEBHOOK
router.post("/webhook", webhook.webhook);

module.exports = router;
