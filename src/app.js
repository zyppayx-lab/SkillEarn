const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./modules/auth/auth.routes');
const paymentRoutes = require('./integrations/payments/nowpayments.routes');

// FIX: make sure this file exists
const errorMiddleware = require('./middleware/error.middleware');

const app = express();

/**
 * SECURITY MIDDLEWARE
 */
app.use(helmet());

app.use(cors({
  origin: "*", // later restrict to frontend domain in production
  credentials: true
}));

app.use(express.json({ limit: "2mb" }));

/**
 * RATE LIMIT (basic fraud protection layer)
 */
app.use(rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // limit each IP
}));

/**
 * HEALTH CHECK
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: process.env.APP_NAME || 'CO Finance API',
    time: new Date().toISOString()
  });
});

/**
 * ROUTES
 */
app.use('/api/auth', authRoutes);

// 💰 NOWPayments crypto payment system
app.use('/api/payments/nowpayments', paymentRoutes);

/**
 * ERROR HANDLER (MUST BE LAST)
 */
app.use(errorMiddleware);

module.exports = app;
