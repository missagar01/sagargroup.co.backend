import { createManagedPool } from "../../../config/postgresPool.js";
import config from '../utils/config.js';

export const pool = config.env !== 'test' && config.pg.host
  ? createManagedPool("Housekeeping", () => ({
    host: config.pg.host,
    port: config.pg.port,
    user: config.pg.user,
    password: config.pg.password,
    database: config.pg.database,
    ssl: config.pg.ssl ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
  }))
  : undefined;

export const query = (text, params) => {
  if (!pool) throw new Error('PostgreSQL pool not initialized');
  return pool.query(text, params);
};