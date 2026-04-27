const axios = require('axios');
const env = require('../config/env');

module.exports = async (token, expectedAction) => {
  if (!token) {
    throw new Error('Captcha required');
  }

  const params = new URLSearchParams();
  params.append('secret', env.RECAPTCHA_SECRET);
  params.append('response', token);

  const res = await axios.post(
    'https://www.google.com/recaptcha/api/siteverify',
    params
  );

  const data = res.data;

  // ❌ Invalid token or expired
  if (!data.success) {
    throw new Error(`Captcha verification failed`);
  }

  // ❌ Action mismatch (VERY IMPORTANT for v3)
  if (expectedAction && data.action !== expectedAction) {
    throw new Error('Captcha action mismatch');
  }

  // ❌ Bot risk check
  if (data.score < 0.5) {
    throw new Error('Captcha risk too high');
  }

  return {
    success: true,
    score: data.score,
    action: data.action,
    hostname: data.hostname
  };
};
