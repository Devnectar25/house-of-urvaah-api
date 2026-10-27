const pool = require('../src/config/db');
pool.query("SELECT DISTINCT payment_method, payment_type, payment_status FROM orders")
  .then(r => {
    console.log(JSON.stringify(r.rows, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
