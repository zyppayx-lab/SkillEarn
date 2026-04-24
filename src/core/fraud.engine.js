exports.scoreTransaction = ({ amount, userHistory }) => {
  let score = 0;

  if (amount > 1000) score += 30;
  if (userHistory < 5) score += 40;

  return {
    risk: score > 50 ? 'HIGH' : 'LOW',
    score
  };
};
