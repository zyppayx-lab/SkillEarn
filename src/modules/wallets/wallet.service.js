// src/modules/wallets/wallet.service.js

const ledger = require('../../core/ledger.service');

exports.credit = async ({ userId, amount, ref }) => {
  return ledger.postEntry({
    userId,
    type: 'credit',
    amount,
    reference: ref
  });
};

exports.debit = async ({ userId, amount, ref }) => {
  return ledger.postEntry({
    userId,
    type: 'debit',
    amount,
    reference: ref
  });
};
