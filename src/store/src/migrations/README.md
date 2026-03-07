# Database Migration Instructions

## Problem
The `indent` table does not exist in PostgreSQL, causing the error:
```
relation "indent" does not exist
```

## Solution
Run the migration to create the `indent` table in PostgreSQL.

## Steps to Run Migration

### Option 1: Using psql (Recommended)
```bash
# Connect to your PostgreSQL database
psql -h <your-host> -U <your-user> -d <your-database>

# Run the migration SQL file
\i backend/src/migrations/create_indent_table.sql

# Or directly:
psql -h <your-host> -U <your-user> -d <your-database> -f backend/src/migrations/create_indent_table.sql
```

### Option 2: Using Node.js Migration Script
```bash
# From the backend directory
cd backend
node src/migrations/run-migration.js
```

### Option 3: Manual SQL Execution
Copy the contents of `create_indent_table.sql` and run it in your PostgreSQL client (pgAdmin, DBeaver, etc.)

## Verify Migration
After running the migration, verify the table was created:
```sql
SELECT * FROM indent LIMIT 1;
```

If the query runs without error, the table exists!

## Environment Variables
Make sure your `.env` file has the correct PostgreSQL connection details:
```
PG_HOST=your-rds-endpoint.rds.amazonaws.com
PG_PORT=5432
PG_USER=your-username
PG_PASSWORD=your-password
PG_NAME=your-database-name
```

## Notes
- The migration uses `CREATE TABLE IF NOT EXISTS`, so it's safe to run multiple times
- The table includes indexes for better query performance
- All columns match the structure used in `indent.service.js`










