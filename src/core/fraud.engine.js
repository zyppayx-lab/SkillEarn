// src/core/fraud.engine.js

exports.evaluateUser = ({ ip, device, velocity, walletActivity }) => {
  let score = 0;

  if (velocity > 10) score += 40;
  if (walletActivity.largeWithdrawals) score += 30;
  if (device?.reused === true) score += 20;

  return {
    score,
    risk:
      score > 70 ? 'BLOCK' :
      score > 40 ? 'REVIEW' : 'CLEAR'
  };
};
