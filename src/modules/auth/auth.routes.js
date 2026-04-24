const router = require('express').Router();
const c = require('./auth.controller');

router.post('/register', c.register);
router.post('/login', c.login);

module.exports = router;
