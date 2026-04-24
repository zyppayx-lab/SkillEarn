const app = require('./app');
const env = require('./config/env');

app.listen(env.PORT || 5000, () => {
  console.log('Server running on port', env.PORT);
});
