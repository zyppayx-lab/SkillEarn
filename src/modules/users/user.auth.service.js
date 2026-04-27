// src/modules/users/user.auth.service.js

const db = require('../../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');

exports.register = async (data) => {

  const hash = await bcrypt.hash(data.password, 10);

  const result = await db.query(
    `INSERT INTO users(email, phone, name, password_hash, role)
     VALUES($1,$2,$3,$4,'user')
     RETURNING id,email,name,role`,
    [data.email, data.phone, data.name, hash]
  );

  return result.rows[0];
};

exports.login = async (data) => {

  const userRes = await db.query(
    `SELECT * FROM users WHERE email=$1`,
    [data.email]
  );

  if (!userRes.rows[0]) throw new Error('Invalid credentials');

  const user = userRes.rows[0];

  const ok = await bcrypt.compare(data.password, user.password_hash);
  if (!ok) throw new Error('Invalid credentials');

  const access = jwt.sign(
    { id: user.id, role: user.role },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  return { access };
};
