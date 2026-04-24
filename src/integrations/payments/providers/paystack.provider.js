const axios = require('axios');
const env = require('../../../config/env');

exports.charge = async (data) => {
  const res = await axios.post(
    'https://api.paystack.co/transaction/initialize',
    data,
    {
      headers: {
        Authorization: `Bearer ${env.PAYSTACK_SECRET}`
      }
    }
  );
  return res.data;
};
