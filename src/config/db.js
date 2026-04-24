const { Pool } = require('pg');
const env = require('./env');

module.exports = new Pool({
  connectionString: env.DATABASE_URL
});
