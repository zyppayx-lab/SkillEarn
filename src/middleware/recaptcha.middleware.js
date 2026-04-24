const axios = require('axios');
const env = require('../config/env');

module.exports = async (token) => {
  if (!token) throw new Error('Captcha required');

  const res = await axios.post(
    `https://www.google.com/recaptcha/api/siteverify`,
    null,
    {
      params: {
        secret: env.RECAPTCHA_SECRET,
        response: token
      }
    }
  );

  if (!res.data.success) {
    throw new Error('Captcha verification failed');
  }
};
