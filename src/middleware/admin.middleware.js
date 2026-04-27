// src/middleware/admin.middleware.js

const db = require('../config/db');

module.exports = (allowedRoles = []) => {
  return async (req, res, next) => {

    const user = req.user;

    // 1. HARD CHECK: authentication must exist
    if (!user || !user.id) {
      return res.status(401).json({
        error: 'Unauthorized: missing user session'
      });
    }

    // 2. HARD CHECK: role must exist
    if (!user.role) {
      return res.status(403).json({
        error: 'Access denied: role missing'
      });
    }

    // 3. ROLE VALIDATION
    if (!allowedRoles.includes(user.role)) {

      // 4. LOG SECURITY EVENT (VERY IMPORTANT FOR FINTECH)
      await db.query(
        `INSERT INTO security_logs(user_id, action, meta)
         VALUES ($1,$2,$3)`,
        [
          user.id,
          'UNAUTHORIZED_ADMIN_ACCESS',
          { role: user.role, path: req.originalUrl }
        ]
      );

      return res.status(403).json({
        error: 'Access denied'
      });
    }

    next();
  };
};
