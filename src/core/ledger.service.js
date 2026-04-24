const db = require('../config/db');

exports.credit = async ({ userId, amount, ref }) => {
  await db.query(
    'INSERT INTO ledger(user_id,type,amount,reference) VALUES($1,$2,$3,$4)',
    [userId, 'credit', amount, ref]
  );
};

exports.debit = async ({ userId, amount, ref }) => {
  await db.query(
    'INSERT INTO ledger(user_id,type,amount,reference) VALUES($1,$2,$3,$4)',
    [userId, 'debit', amount, ref]
  );
};
