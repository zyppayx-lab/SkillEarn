const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const authRoutes = require('./modules/auth/auth.routes');

// safer naming
const errorMiddleware = require('./middleware/error.middleware');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: process.env.APP_NAME || 'API',
    time: new Date().toISOString()
  });
});

app.use('/api/auth', authRoutes);

// IMPORTANT: must be last
app.use(errorMiddleware);

module.exports = app;
