'use strict';
const { Pool } = require('pg');
const createPool = (connectionString) => {
  const pool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000, statement_timeout: 10000, lock_timeout: 5000 });
  // Do not log queries, connection URLs or error detail containing private values.
  pool.on('error', () => console.error('Database connection error.'));
  return pool;
};
module.exports = { createPool };

