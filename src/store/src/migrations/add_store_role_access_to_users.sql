-- Migration to add store_role_access column to users table
-- Run this against your PostgreSQL database (checklist-delegation)

ALTER TABLE users ADD COLUMN IF NOT EXISTS store_role_access VARCHAR(100);

-- Example: Set a user as HOD
-- UPDATE users SET store_role_access = 'hod' WHERE user_name = 'your_hod_username';
