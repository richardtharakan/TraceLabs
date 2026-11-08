import { ensureSchema, pool } from './db.js';

try {
  await ensureSchema();
  console.log('TraceLab database schema is ready.');
} catch (error) {
  console.error('Database initialization failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
