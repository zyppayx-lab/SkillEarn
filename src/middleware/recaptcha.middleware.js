const axios = require('axios');
const env = require('../config/env');

module.exports = async (token, expectedAction) => {
  if (!token) throw new Error('Captcha required');

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

  console.log("CAPTCHA RESPONSE:", data); // 🔥 IMPORTANT DEBUG

  if (!data.success) {
    throw new Error(
      'Captcha failed: ' + (data['error-codes']?.join(', ') || 'unknown')
    );
  }

  // v3 SCORE CHECK (IMPORTANT)
  if (typeof data.score !== "number") {
    throw new Error("Not a v3 reCAPTCHA key configuration");
  }

  if (data.score < 0.5) {
    throw new Error("Captcha risk too high");
  }

  // ACTION CHECK
  if (expectedAction && data.action !== expectedAction) {
    throw new Error("Captcha action mismatch");
  }

  return data;
};
