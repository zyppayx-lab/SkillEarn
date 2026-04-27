const axios = require('axios');
const env = require('../config/env');

module.exports = async (token, expectedAction) => {
  if (!token) throw new Error('Captcha required');

  const res = await axios.post(
    'https://www.google.com/recaptcha/api/siteverify',
    null,
    {
      params: {
        secret: env.RECAPTCHA_SECRET,
        response: token
      }
    }
  );

  const data = res.data;

  // 1. Must be successful
  if (!data.success) {
    throw new Error('Captcha verification failed (invalid token)');
  }

  // 2. MUST match action (v3 requirement)
  if (expectedAction && data.action !== expectedAction) {
    throw new Error('Captcha action mismatch');
  }

  // 3. Score check (VERY IMPORTANT)
  // Google recommends 0.5, but fintech apps should use 0.6–0.8
  if (data.score < 0.5) {
    throw new Error('Captcha risk score too low (bot detected)');
  }

  return {
    success: true,
    score: data.score,
    action: data.action,
    hostname: data.hostname
  };
};
