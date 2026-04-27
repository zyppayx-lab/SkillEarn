// src/modules/admin/support.service.js

const db = require('../../config/db');

exports.raiseDispute = async ({ taskId, userId, reason }) => {

  const res = await db.query(
    `INSERT INTO disputes(task_id,user_id,reason,status)
     VALUES($1,$2,$3,'OPEN')
     RETURNING *`,
    [taskId, userId, reason]
  );

  // auto-link to admin queue system
  await db.query(
    `INSERT INTO admin_queue(type, ref_id, status)
     VALUES('DISPUTE',$1,'PENDING')`,
    [res.rows[0].id]
  );

  return res.rows[0];
};
