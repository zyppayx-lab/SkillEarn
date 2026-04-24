// src/jobs/taskAutoApprove.js

const db = require('../config/db');

exports.run = async () => {
  await db.query(
    `UPDATE tasks
     SET status='ACTIVE'
     WHERE status='PENDING_APPROVAL'
     AND created_at < NOW() - INTERVAL '5 hours'`
  );
};
