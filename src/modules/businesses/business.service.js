// src/modules/businesses/business.service.js

const db = require('../../config/db');

exports.createBusiness = async ({ userId, name, country }) => {
  const res = await db.query(
    `INSERT INTO businesses(user_id, name, country)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [userId, name, country]
  );

  return res.rows[0];
};
