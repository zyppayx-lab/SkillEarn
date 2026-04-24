const axios = require('axios');

async function check() {
  try {
    await axios.get('http://localhost:5000/health');
    console.log('API OK');
  } catch (e) {
    console.log('API DOWN');
  }
}

check();
