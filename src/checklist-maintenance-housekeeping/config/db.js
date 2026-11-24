import { createManagedPool } from "../../../config/postgresPool.js";

const options = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 5432),
  ssl: { rejectUnauthorized: false },
};

export const pool = createManagedPool("Checklist", () => options);
export const maintenancePool = createManagedPool("Maintenance", () => ({
  ...options,
  database: process.env.MAINTENANCE_DB_NAME || options.database,
}));