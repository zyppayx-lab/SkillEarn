const axios = require("axios");

const BASE_URL = process.env.NOWPAYMENTS_BASE_URL;

const headers = {
  "x-api-key": process.env.NOWPAYMENTS_API_KEY,
  "Content-Type": "application/json",
};

async function getStatus() {
  const res = await axios.get(`${BASE_URL}/status`, { headers });
  return res.data;
}

async function getCurrencies() {
  const res = await axios.get(`${BASE_URL}/currencies`, { headers });
  return res.data;
}

async function getMinAmount(currency_from, currency_to) {
  const res = await axios.get(
    `${BASE_URL}/min-amount?currency_from=${currency_from}&currency_to=${currency_to}`,
    { headers }
  );
  return res.data;
}

async function createPayment(data) {
  const res = await axios.post(`${BASE_URL}/payment`, data, { headers });
  return res.data;
}

async function getPaymentStatus(payment_id) {
  const res = await axios.get(`${BASE_URL}/payment/${payment_id}`, {
    headers,
  });
  return res.data;
}

module.exports = {
  getStatus,
  getCurrencies,
  getMinAmount,
  createPayment,
  getPaymentStatus,
};
