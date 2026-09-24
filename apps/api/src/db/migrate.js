'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const migrationDirectory = path.resolve(__dirname, '../../../../migrations');
const normaliseSql = (source) => {
  const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/);
  const sql = lines.filter((line) => !/^\\set ON_ERROR_STOP on\s*$/.test(line) &&
    !/^\\dt public\.\*\s*$/.test(line) && !/^\s*(BEGIN|COMMIT);\s*$/i.test(line)).join('\n');
  if (/^\s*\\/m.test(sql)) throw new Error('Unsupported psql command in migration.');
  return sql;
};
const migrate = async (pool, directory = migrationDirectory) => {
  const client = await pool.connect();
  let locked = false;
  const applied = [];
  try {
    await client.query("SELECT pg_advisory_lock(713146, 1)");
    locked = true;
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    const files = (await fs.readdir(directory)).filter((name) => /^\d+_.+\.up\.sql$/.test(name)).sort();
    if (!files.length) throw new Error('No migrations found.');
    for (const name of files) {
      const source = await fs.readFile(path.join(directory, name), 'utf8');
      const sql = normaliseSql(source);
      // Normalize line endings so Windows and Linux have the same checksum.
      const checksum = createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
      const { rows } = await client.query('SELECT checksum FROM schema_migrations WHERE name = $1', [name]);
      if (rows.length) {
        if (rows[0].checksum !== checksum) throw new Error('Applied migration checksum mismatch: ' + name);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name, checksum) VALUES ($1, $2)', [name, checksum]);
        await client.query('COMMIT');
        applied.push(name);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    return applied;
  } finally {
    let releaseError;
    if (locked) {
      try { await client.query('SELECT pg_advisory_unlock(713146, 1)'); }
      catch (error) { releaseError = error; }
    }
    client.release(releaseError);
  }
};
if (require.main === module) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const { createPool } = require('./pool');
  const pool = createPool(process.env.DATABASE_URL);
  migrate(pool).then((names) => console.log('Applied migrations: ' + (names.join(', ') || 'none')))
    .catch(() => { console.error('Migration failed. Release stopped; inspect the schema using a secure database client.'); process.exitCode = 1; })
    .finally(() => pool.end());
}
module.exports = { migrate, normaliseSql };

