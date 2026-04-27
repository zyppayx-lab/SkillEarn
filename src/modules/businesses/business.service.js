// src/modules/businesses/business.service.js

const db = require('../../config/db');

exports.createBusiness = async ({ userId, name, country }) => {

  // prevent duplicate business accounts per user
  const existing = await db.query(
    `SELECT * FROM businesses WHERE user_id=$1`,
    [userId]
  );

  if (existing.rows.length > 0) {
    throw new Error('Business already exists for this user');
  }

  const res = await db.query(
    `INSERT INTO businesses(user_id, name, country)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, name, country, created_at`,
    [userId, name, country]
  );

  return res.rows[0];
};
