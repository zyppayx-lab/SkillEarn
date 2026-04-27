// src/modules/withdrawals/withdrawal.service.js

const wallet = require('../wallets/wallet.service');
const fraud = require('../../core/fraud.engine');
const db = require('../../config/db');

exports.withdraw = async ({
  userId,
  amount,
  method,
  account,
  history
}) => {

  // 1. Validate method FIRST
  if (!['crypto', 'bank'].includes(method)) {
    throw new Error('Invalid withdrawal method');
  }

  // 2. Fraud check
  const risk = fraud.scoreTransaction({
    amount,
    userHistory: history
  });

  if (risk.risk === 'HIGH') {
    throw new Error('Withdrawal blocked (fraud risk)');
  }

  // 3. Create withdrawal record FIRST (important for audit)
  const withdrawal = await db.query(
    `INSERT INTO withdrawals(user_id, amount, method, account, status)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [userId, amount, method, account,
      method === 'bank' ? 'PENDING' : 'PROCESSING'
    ]
  );

  // 4. Debit wallet AFTER validation + record
  await wallet.debit({
    userId,
    amount,
    ref: 'WD-' + withdrawal.rows[0].id,
    type: 'USER'
  });

  // 5. Crypto = automatic
  if (method === 'crypto') {
    return {
      status: 'processing',
      type: 'crypto',
      withdrawalId: withdrawal.rows[0].id,
      message: 'Crypto withdrawal started automatically'
    };
  }

  // 6. Bank = manual approval
  if (method === 'bank') {
    return {
      status: 'pending_manual',
      type: 'bank',
      withdrawalId: withdrawal.rows[0].id,
      message: 'Bank withdrawal awaiting admin approval'
    };
  }
};
