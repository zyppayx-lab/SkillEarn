// src/modules/admin/fraudReview.service.js

const db = require('../../config/db');

exports.freezeUser = async (userId, reason = 'FRAUD_SUSPECTED') => {

  await db.query(
    `UPDATE users 
     SET status='FROZEN', freeze_reason=$2
     WHERE id=$1`,
    [userId, reason]
  );

  await db.query(
    `INSERT INTO admin_actions(action, user_id, meta)
     VALUES('FREEZE_USER',$1,$2)`,
    [userId, { reason }]
  );
};

exports.unfreezeUser = async (userId) => {

  await db.query(
    `UPDATE users SET status='ACTIVE', freeze_reason=NULL WHERE id=$1`,
    [userId]
  );

  await db.query(
    `INSERT INTO admin_actions(action, user_id, meta)
     VALUES('UNFREEZE_USER',$1,$2)`,
    [userId, { status: 'restored' }]
  );
};
