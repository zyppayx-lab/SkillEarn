// src/jobs/fraudScanner.js

const fraud = require('../core/fraud.engine');
const db = require('../config/db');

exports.run = async () => {
  const users = await db.query(`SELECT * FROM users`);

  for (let user of users.rows) {
    const result = fraud.evaluateUser({
      ip: user.last_ip,
      device: user.device_id,
      velocity: user.login_count_1h,
      walletActivity: {}
    });

    if (result.risk === 'BLOCK') {
      await db.query(
        `UPDATE users SET status='FROZEN' WHERE id=$1`,
        [user.id]
      );
    }
  }
};
