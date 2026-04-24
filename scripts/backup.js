const { exec } = require('child_process');

exec(
  'pg_dump fintech_db > backup.sql',
  (err) => {
    if (err) console.error(err);
    else console.log('Backup completed');
  }
);
