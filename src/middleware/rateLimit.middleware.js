// src/middleware/rateLimit.middleware.js

const rateLimit = require('express-rate-limit');

module.exports = rateLimit({
  windowMs: 60 * 1000,
  max: 120, // requests per minute
  message: 'Too many requests, slow down'
});
