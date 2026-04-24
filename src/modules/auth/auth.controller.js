const service = require('./auth.service');

exports.register = async (req,res,next) => {
  try {
    res.json(await service.register(req.body));
  } catch (e) { next(e); }
};

exports.login = async (req,res,next) => {
  try {
    res.json(await service.login(req.body));
  } catch (e) { next(e); }
};
