// src/core/fraud.engine.js

exports.scoreTransaction = ({ amount, userHistory }) => {
  let score = 0;

  if (amount > 1000) score += 30;
  if (userHistory?.failedWithdrawals > 3) score += 40;
  if (userHistory?.newUser) score += 20;

  return {
    score,
    risk: score > 70 ? 'HIGH' : score > 40 ? 'MEDIUM' : 'LOW'
  };
};
