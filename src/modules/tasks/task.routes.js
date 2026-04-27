// src/modules/tasks/user.task.service.js

const db = require('../../config/db');

exports.getTasks = async () => {

  const res = await db.query(
    `SELECT * FROM tasks WHERE status='ACTIVE'`
  );

  return res.rows;
};
