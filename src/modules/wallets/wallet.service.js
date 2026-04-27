// src/modules/wallets/wallet.service.js

const ledger = require('../../core/ledger.service');

exports.credit = async ({ userId, amount, ref, type }) => {
  return ledger.postEntry({
    userId,
    type: 'credit',
    amount,
    reference: ref,
    walletType: type // USER or BUSINESS
  });
};

exports.debit = async ({ userId, amount, ref, type }) => {
  return ledger.postEntry({
    userId,
    type: 'debit',
    amount,
    reference: ref,
    walletType: type
  });
};
