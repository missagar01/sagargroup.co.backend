-- Migration: Alter resume table interviewer columns to TIMESTAMP
-- Date: 2024
-- Description: Change interviewer_planned and interviewer_actual columns from their current type to TIMESTAMP

-- First, allow NULL values if not already allowed
ALTER TABLE resume
ALTER COLUMN interviewer_planned DROP NOT NULL;

ALTER TABLE resume
ALTER COLUMN interviewer_actual DROP NOT NULL;

-- Then change the type to TIMESTAMP
ALTER TABLE resume
ALTER COLUMN interviewer_planned TYPE TIMESTAMP
USING CASE 
  WHEN interviewer_planned = '' OR interviewer_planned IS NULL THEN NULL
  ELSE interviewer_planned::timestamp
END;

ALTER TABLE resume
ALTER COLUMN interviewer_actual TYPE TIMESTAMP
USING CASE 
  WHEN interviewer_actual = '' OR interviewer_actual IS NULL THEN NULL
  ELSE interviewer_actual::timestamp
END;

