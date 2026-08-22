import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ quiet: true });
const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 5432,
  ssl: { rejectUnauthorized: false }, // required for AWS RDS
});

pool
  .connect()
  .then(() => console.log("✅ Connected to AWS RDS PostgreSQL"))
  .catch((err) => console.error("❌ Database connection error:", err.message));

export default pool;
