// src/modules/tasks/task.service.js

const db = require('../../config/db');
const taskPayment = require('./taskPayment.service');

exports.createTask = async ({
  businessId,
  userId,
  title,
  description,
  reward,
  slots,
  feePaid
}) => {

  if (!feePaid) {
    throw new Error('Task creation fee not paid');
  }

  const res = await db.query(
    `INSERT INTO tasks(business_id, title, description, reward, slots, status)
     VALUES ($1,$2,$3,$4,$5,'PENDING_APPROVAL')
     RETURNING *`,
    [businessId, title, description, reward, slots]
  );

  return res.rows[0];
};
