import { pool } from "./config/db.js";

async function runMigration() {
  console.log("🚀 Starting Database Migration for Checklist Master Tables...");
  
  try {
    // 1. Create Tables
    console.log("📁 Creating tables if not exist...");
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS checklist_divisions (
        id SERIAL PRIMARY KEY,
        division_name VARCHAR(100) UNIQUE NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS checklist_departments (
        id SERIAL PRIMARY KEY,
        department_name VARCHAR(100) UNIQUE NOT NULL,
        division_name VARCHAR(100),
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS checklist_given_by (
        id SERIAL PRIMARY KEY,
        manager_name VARCHAR(100) UNIQUE NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    console.log("✅ Tables created successfully.");

    // 2. Fetch distinct values from users table
    console.log("🔍 Fetching distinct divisions from users...");
    const divResult = await pool.query(`
      SELECT DISTINCT division 
      FROM users 
      WHERE division IS NOT NULL AND TRIM(division) <> ''
    `);
    
    console.log("🔍 Fetching distinct departments and division from users...");
    const deptResult = await pool.query(`
      SELECT DISTINCT department, division 
      FROM users 
      WHERE department IS NOT NULL AND TRIM(department) <> ''
    `);
    
    console.log("🔍 Fetching distinct given_by from users...");
    const givenByResult = await pool.query(`
      SELECT DISTINCT given_by 
      FROM users 
      WHERE given_by IS NOT NULL AND TRIM(given_by) <> ''
    `);

    // 3. Populate checklist_divisions
    console.log(`📥 Migrating ${divResult.rows.length} unique divisions...`);
    for (const row of divResult.rows) {
      const divisionName = row.division.trim();
      await pool.query(`
        INSERT INTO checklist_divisions (division_name)
        VALUES ($1)
        ON CONFLICT (division_name) DO NOTHING
      `, [divisionName]);
    }
    
    // 4. Populate checklist_departments
    console.log(`📥 Migrating ${deptResult.rows.length} unique departments...`);
    for (const row of deptResult.rows) {
      const departmentName = row.department.trim();
      const divisionName = row.division ? row.division.trim() : null;
      await pool.query(`
        INSERT INTO checklist_departments (department_name, division_name)
        VALUES ($1, $2)
        ON CONFLICT (department_name) DO UPDATE 
        SET division_name = EXCLUDED.division_name WHERE checklist_departments.division_name IS NULL
      `, [departmentName, divisionName]);
    }

    // 5. Populate checklist_given_by
    console.log(`📥 Migrating ${givenByResult.rows.length} unique managers (given_by)...`);
    for (const row of givenByResult.rows) {
      const managerName = row.given_by.trim();
      await pool.query(`
        INSERT INTO checklist_given_by (manager_name)
        VALUES ($1)
        ON CONFLICT (manager_name) DO NOTHING
      `, [managerName]);
    }

    // 6. Clean up dummy DEPT_... users
    console.log("🧹 Cleaning up dummy DEPT_... users from users table...");
    const deleteResult = await pool.query(`
      DELETE FROM users 
      WHERE user_name LIKE 'DEPT_%'
    `);
    console.log(`✅ Cleaned up ${deleteResult.rowCount} dummy users.`);

    console.log("🎉 Database Migration Completed Successfully!");
  } catch (error) {
    console.error("❌ Migration failed with error:", error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

runMigration();
