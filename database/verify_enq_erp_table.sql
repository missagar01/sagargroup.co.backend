-- Verify enq_erp table exists and check its structure
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM 
    information_schema.columns
WHERE 
    table_name = 'enq_erp'
ORDER BY 
    ordinal_position;

-- Check if table exists
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_name = 'enq_erp'
) AS table_exists;

-- If table doesn't exist, create it
-- (Run the create_enq_erp_table.sql file first if this returns false)
