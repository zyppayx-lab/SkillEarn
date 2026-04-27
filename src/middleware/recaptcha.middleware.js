const axios = require('axios');
const env = require('../config/env');

module.exports = async (token, expectedAction) => {
  if (!token) {
    throw new Error('Captcha required');
  }

  const res = await axios.post(
    'https://www.google.com/recaptcha/api/siteverify',
    new URLSearchParams({
      secret: env.RECAPTCHA_SECRET,
      response: token
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );

  const data = res.data;

  // ❌ invalid or expired token
  if (!data.success) {
    throw new Error('Captcha verification failed (invalid token)');
  }

  // ❌ score check (critical)
  if ((data.score || 0) < 0.5) {
    throw new Error('Captcha risk too high');
  }

  // ⚠️ action check (optional but safer)
  if (expectedAction && data.action && data.action !== expectedAction) {
    throw new Error('Captcha action mismatch');
  }

  return data;
};
