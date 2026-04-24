// src/modules/tasks/task.service.js

const db = require('../../config/db');

exports.createTask = async ({ businessId, title, description, reward, slots }) => {
  const res = await db.query(
    `INSERT INTO tasks(business_id, title, description, reward, slots, status)
     VALUES ($1,$2,$3,$4,$5,'PENDING_APPROVAL')
     RETURNING *`,
    [businessId, title, description, reward, slots]
  );

  return res.rows[0];
};
