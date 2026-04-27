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

  // ❌ Token invalid / expired
  if (!data.success) {
    throw new Error('Captcha verification failed');
  }

  // ❌ Score check (main protection layer)
  const score = data.score ?? 0;

  if (score < 0.5) {
    throw new Error('Captcha risk too high');
  }

  // ⚠️ Action check (ONLY if present)
  // Some responses may not include action reliably
  if (expectedAction && data.action && data.action !== expectedAction) {
    throw new Error('Captcha action mismatch');
  }

  return {
    success: true,
    score,
    action: data.action || null,
    hostname: data.hostname || null
  };
};
