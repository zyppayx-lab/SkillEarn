const queue = require('./queue');

exports.addPaymentJob = async (data) => {
  await queue.lpush('payments', JSON.stringify(data));
};
