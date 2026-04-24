// src/middleware/admin.middleware.js

const roles = require('../constants/roles');

module.exports = (allowedRoles = []) => {
  return (req, res, next) => {
    const user = req.user;

    if (!user || !allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    next();
  };
};
