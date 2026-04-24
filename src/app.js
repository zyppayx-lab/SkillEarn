const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const authRoutes = require('./modules/auth/auth.routes');
const error = require('./middleware/error.middleware');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (req,res)=>res.json({status:'ok'}));
app.use('/api/auth', authRoutes);
app.use(error);

module.exports = app;
