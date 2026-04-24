// src/core/audit.service.js

const db = require('../config/db');

exports.log = async ({ action, userId, meta }) => {
  await db.query(
    `INSERT INTO audit_logs(action, user_id, meta)
     VALUES ($1,$2,$3)`,
    [action, userId, meta]
  );
};
