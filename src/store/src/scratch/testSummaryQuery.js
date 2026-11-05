import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: "h:\\sagargroup\\250626\\backend\\.env" });

const { Client } = pg;

async function check() {
  try {
    const { initSSHTunnel, getLocalPostgresPort } = await import("../../../../config/sshTunnel.js");
    
    console.log("Initializing SSH Tunnel...");
    await initSSHTunnel();
    const localPort = getLocalPostgresPort();

    const client = new Client({
      host: "127.0.0.1",
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: localPort,
      ssl: { rejectUnauthorized: false },
    });

    await client.connect();
    console.log("Connected to PostgreSQL!");

    const username = "Hem Kumar Jagat";

    // 1. Checklist query
    const checklistRes = await client.query(`
      SELECT
        COUNT(CASE WHEN task_start_date::date >= date_trunc('month', CURRENT_DATE) AND task_start_date::date <= CURRENT_DATE THEN 1 END) as total,
        COUNT(CASE WHEN task_start_date::date >= date_trunc('month', CURRENT_DATE) AND submission_date IS NOT NULL AND LOWER(status::text) = 'yes' THEN 1 END) as completed,
        COUNT(CASE WHEN task_start_date::date >= date_trunc('month', CURRENT_DATE) AND task_start_date::date <= CURRENT_DATE AND submission_date IS NULL THEN 1 END) as pending,
        COUNT(CASE WHEN task_start_date::date >= date_trunc('month', CURRENT_DATE) AND submission_date IS NOT NULL AND LOWER(status::text) = 'no' THEN 1 END) as notdone,
        COUNT(CASE WHEN task_start_date::date = CURRENT_DATE + 1 THEN 1 END) as future
      FROM checklist
      WHERE LOWER(name) = LOWER($1)
    `, [username]);
    console.log("Checklist status counts:", checklistRes.rows[0]);

    // 2. Maintenance query
    const maintenanceRes = await client.query(`
      SELECT
        COUNT(CASE WHEN task_start_date::date >= date_trunc('month', CURRENT_DATE) AND task_start_date::date <= CURRENT_DATE THEN 1 END) as total,
        COUNT(CASE WHEN task_start_date::date >= date_trunc('month', CURRENT_DATE) AND actual_date IS NOT NULL AND LOWER(task_status::text) = 'yes' THEN 1 END) as completed,
        COUNT(CASE WHEN task_start_date::date >= date_trunc('month', CURRENT_DATE) AND task_start_date::date <= CURRENT_DATE AND actual_date IS NULL THEN 1 END) as pending,
        COUNT(CASE WHEN task_start_date::date >= date_trunc('month', CURRENT_DATE) AND actual_date IS NOT NULL AND LOWER(task_status::text) = 'no' THEN 1 END) as notdone,
        COUNT(CASE WHEN task_start_date::date = CURRENT_DATE + 1 THEN 1 END) as future
      FROM maintenance_task_assign
      WHERE LOWER(doer_name) = LOWER($1)
    `, [username]);
    console.log("Maintenance status counts:", maintenanceRes.rows[0]);

    // 3. Housekeeping query
    const housekeepingRes = await client.query(`
      SELECT
        COUNT(CASE WHEN task_start_date::date >= date_trunc('month', CURRENT_DATE) AND task_start_date::date <= CURRENT_DATE THEN 1 END) as total,
        COUNT(CASE WHEN task_start_date::date >= date_trunc('month', CURRENT_DATE) AND submission_date IS NOT NULL AND LOWER(status::text) = 'yes' THEN 1 END) as completed,
        COUNT(CASE WHEN task_start_date::date >= date_trunc('month', CURRENT_DATE) AND task_start_date::date <= CURRENT_DATE AND submission_date IS NULL THEN 1 END) as pending,
        COUNT(CASE WHEN task_start_date::date >= date_trunc('month', CURRENT_DATE) AND submission_date IS NOT NULL AND LOWER(status::text) = 'no' THEN 1 END) as notdone,
        COUNT(CASE WHEN task_start_date::date = CURRENT_DATE + 1 THEN 1 END) as future
      FROM assign_task
      WHERE LOWER(name) = LOWER($1)
    `, [username]);
    console.log("Housekeeping status counts:", housekeepingRes.rows[0]);

    await client.end();
  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit(0);
  }
}

check();
