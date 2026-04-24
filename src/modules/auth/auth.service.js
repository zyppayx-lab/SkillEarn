const db = require('../../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const verifyCaptcha = require('../../middleware/recaptcha.middleware');

exports.register = async (data) => {
  await verifyCaptcha(data.recaptchaToken);

  const hash = await bcrypt.hash(data.password, 10);

  const result = await db.query(
    `INSERT INTO users(email, phone, name, password_hash, role)
     VALUES($1,$2,$3,$4,'user') RETURNING id,email,phone,name`,
    [data.email, data.phone, data.name, hash]
  );

  return result.rows[0];
};

exports.login = async (data) => {
  await verifyCaptcha(data.recaptchaToken);

  const userRes = await db.query('SELECT * FROM users WHERE email=$1', [data.email]);

  if (!userRes.rows[0]) throw new Error('Invalid credentials');

  const user = userRes.rows[0];

  const ok = await bcrypt.compare(data.password, user.password_hash);
  if (!ok) throw new Error('Invalid credentials');

  const access = jwt.sign(
    { id: user.id, role: user.role },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  const refresh = jwt.sign(
    { id: user.id },
    env.JWT_REFRESH_SECRET,
    { expiresIn: '30d' }
  );

  return { access, refresh };
};
