// src/modules/admin/fraudReview.service.js

const db = require('../../config/db');

exports.freezeUser = async (userId) => {
  await db.query(
    `UPDATE users SET status='FROZEN' WHERE id=$1`,
    [userId]
  );
};

exports.unfreezeUser = async (userId) => {
  await db.query(
    `UPDATE users SET status='ACTIVE' WHERE id=$1`,
    [userId]
  );
};
