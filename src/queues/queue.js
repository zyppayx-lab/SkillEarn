const Redis = require('ioredis');
const env = require('../config/env');
module.exports = new Redis(env.REDIS_URL);
