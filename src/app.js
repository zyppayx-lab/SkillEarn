const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./modules/auth/auth.routes');
const businessRoutes = require('./modules/businesses/business.routes');
const taskRoutes = require('./modules/tasks/task.routes');
const userRoutes = require('./modules/users/user.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const paymentRoutes = require('./integrations/payments/nowpayments.routes');
const withdrawalRoutes = require('./modules/withdrawals/withdrawal.routes');

const errorMiddleware = require('./middleware/error.middleware');
const requestLogger = require('./middleware/requestLog.middleware');

const app = express();

/**
 * SECURITY
 */
app.use(helmet());

app.use(cors({
  origin: "*", // lock this in production
  credentials: true
}));

app.use(express.json({ limit: "2mb" }));

/**
 * GLOBAL REQUEST LOGGING (IMPORTANT FOR FINTECH)
 */
app.use(requestLogger);

/**
 * BASE RATE LIMIT (GENERAL)
 */
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 200
}));

/**
 * ROUTE-SPECIFIC RATE LIMITS (IMPORTANT UPGRADE)
 */
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: "Too many auth attempts"
});

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: "Too many payment requests"
});

/**
 * HEALTH CHECK
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: process.env.APP_NAME || 'SkillEarn API',
    time: new Date().toISOString()
  });
});

/**
 * ROUTES
 */

// AUTH (STRICT LIMIT)
app.use('/api/auth', authLimiter, authRoutes);

// USERS
app.use('/api/users', userRoutes);

// BUSINESS
app.use('/api/business', businessRoutes);

// TASKS
app.use('/api/tasks', taskRoutes);

// PAYMENTS (STRICT LIMIT)
app.use('/api/payments', paymentLimiter, paymentRoutes);

// WITHDRAWALS (HIGH RISK ROUTE)
app.use('/api/withdrawals', paymentLimiter, withdrawalRoutes);

// ADMIN (should have auth middleware inside routes)
app.use('/api/admin', adminRoutes);

/**
 * ERROR HANDLER (MUST BE LAST)
 */
app.use(errorMiddleware);

module.exports = app;
