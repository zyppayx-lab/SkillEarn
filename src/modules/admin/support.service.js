// src/modules/admin/support.service.js

const db = require('../../config/db');

exports.raiseDispute = async ({ taskId, userId, reason }) => {
  await db.query(
    `INSERT INTO disputes(task_id,user_id,reason,status)
     VALUES($1,$2,$3,'OPEN')`,
    [taskId, userId, reason]
  );
};
