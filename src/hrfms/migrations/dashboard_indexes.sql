-- Dashboard Performance Optimization - Database Indexes
-- Execute this SQL in your PostgreSQL database to significantly improve query performance
-- Estimated execution time: 2-5 minutes
-- IMPORTANT: Run during low-traffic hours if possible

-- ============================================
-- USERS TABLE INDEXES
-- ============================================

-- Index for status filtering (used in employee counts, active/inactive queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_status 
  ON users(status) 
  WHERE status IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_status_lower
  ON users((LOWER(status::text)))
  WHERE status IS NOT NULL;

-- Index for created_at (used in hiring trend queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_created_at 
  ON users(created_at DESC) 
  WHERE created_at IS NOT NULL;

-- Index for updated_at (used in attrition tracking)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_updated_at 
  ON users(updated_at DESC) 
  WHERE updated_at IS NOT NULL;

-- Index for designation grouping
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_designation 
  ON users(designation) 
  WHERE designation IS NOT NULL AND designation != '';

-- Index for employee_id lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_employee_id 
  ON users(employee_id);

-- Composite index for active employee queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_active_employees 
  ON users(status, employee_id) 
  WHERE LOWER(status::text) = 'active';

-- ============================================
-- LEAVE_REQUEST TABLE INDEXES
-- ============================================

-- Index for request status filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leave_request_status 
  ON leave_request(request_status) 
  WHERE request_status IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leave_request_status_lower
  ON leave_request((LOWER(request_status::text)))
  WHERE request_status IS NOT NULL;

-- Index for approved_by_status filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leave_request_approved_by_status 
  ON leave_request(approved_by_status) 
  WHERE approved_by_status IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leave_request_approved_by_status_lower
  ON leave_request((LOWER(approved_by_status::text)))
  WHERE approved_by_status IS NOT NULL;

-- Index for HR approval status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leave_request_hr_approval 
  ON leave_request(hr_approval) 
  WHERE hr_approval IS NOT NULL;

-- Index for created_at (monthly trends)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leave_request_created_at 
  ON leave_request(created_at DESC) 
  WHERE created_at IS NOT NULL;

-- Index for employee_id lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leave_request_employee_id 
  ON leave_request(employee_id);

-- Index for date range queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leave_request_from_date 
  ON leave_request(from_date DESC) 
  WHERE from_date IS NOT NULL;

-- Composite index for employee dashboard queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leave_request_employee_date 
  ON leave_request(employee_id, from_date DESC, created_at DESC);

-- Composite index for status-based filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leave_request_status_created 
  ON leave_request(request_status, created_at DESC) 
  WHERE request_status IS NOT NULL AND created_at IS NOT NULL;

-- ============================================
-- REQUEST TABLE (Travel Requests) INDEXES
-- ============================================

-- Index for request status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_request_status 
  ON request(request_status) 
  WHERE request_status IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_request_status_lower
  ON request((LOWER(request_status::text)))
  WHERE request_status IS NOT NULL;

-- Index for created_at
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_request_created_at 
  ON request(created_at DESC) 
  WHERE created_at IS NOT NULL;

-- Index for employee_code lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_request_employee_code 
  ON request(employee_code);

-- Index for date range queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_request_from_date 
  ON request(from_date DESC) 
  WHERE from_date IS NOT NULL;

-- Composite index for employee dashboard
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_request_employee_date 
  ON request(employee_code, from_date DESC, created_at DESC);

-- ============================================
-- TICKET_BOOK TABLE INDEXES
-- ============================================

-- Index for ticket status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ticket_book_status 
  ON ticket_book(status) 
  WHERE status IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ticket_book_status_lower
  ON ticket_book((LOWER(status::text)))
  WHERE status IS NOT NULL;

-- Index for created_at
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ticket_book_created_at 
  ON ticket_book(created_at DESC) 
  WHERE created_at IS NOT NULL;

-- Index for request_employee_code
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ticket_book_request_employee 
  ON ticket_book(request_employee_code);

-- Index for booked_employee_code
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ticket_book_booked_employee 
  ON ticket_book(booked_employee_code);

-- Index for total_amount (revenue queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ticket_book_amount 
  ON ticket_book(total_amount) 
  WHERE total_amount IS NOT NULL;

-- Composite index for employee lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ticket_book_employee_created 
  ON ticket_book(request_employee_code, created_at DESC);

-- ============================================
-- RESUME_REQUEST TABLE INDEXES
-- ============================================

-- Index for candidate_status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resume_request_candidate_status 
  ON resume_request(candidate_status) 
  WHERE candidate_status IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resume_request_candidate_status_lower
  ON resume_request((LOWER(candidate_status::text)))
  WHERE candidate_status IS NOT NULL;

-- Index for joined_status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resume_request_joined_status 
  ON resume_request(joined_status) 
  WHERE joined_status IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resume_request_joined_status_lower
  ON resume_request((LOWER(joined_status::text)))
  WHERE joined_status IS NOT NULL;

-- Index for interviewer_status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resume_request_interviewer_status 
  ON resume_request(interviewer_status) 
  WHERE interviewer_status IS NOT NULL;

-- Index for created_at
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resume_request_created_at 
  ON resume_request(created_at DESC) 
  WHERE created_at IS NOT NULL;

-- ============================================
-- PLANT_VISITOR TABLE INDEXES
-- ============================================

-- Index for request_status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_plant_visitor_status 
  ON plant_visitor(request_status) 
  WHERE request_status IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_plant_visitor_status_lower
  ON plant_visitor((LOWER(request_status::text)))
  WHERE request_status IS NOT NULL;

-- Index for created_at
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_plant_visitor_created_at 
  ON plant_visitor(created_at DESC) 
  WHERE created_at IS NOT NULL;

-- Index for employee_code
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_plant_visitor_employee_code 
  ON plant_visitor(employee_code);

-- Index for date range queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_plant_visitor_from_date 
  ON plant_visitor(from_date DESC) 
  WHERE from_date IS NOT NULL;

-- Composite index for employee queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_plant_visitor_employee_date 
  ON plant_visitor(employee_code, from_date DESC, created_at DESC);

-- ============================================
-- UPDATE TABLE STATISTICS
-- ============================================

-- Analyze all tables to update query planner statistics
ANALYZE users;
ANALYZE leave_request;
ANALYZE request;
ANALYZE ticket_book;
ANALYZE resume_request;
ANALYZE plant_visitor;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check which indexes were created successfully
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- Check table sizes and index usage
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS index_size
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('users', 'leave_request', 'request', 'ticket_book', 'resume_request', 'plant_visitor')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- ============================================
-- NOTES
-- ============================================

/*
1. CONCURRENTLY option allows index creation without locking the table
2. Partial indexes (WHERE clauses) reduce index size and improve performance
3. DESC ordering on timestamp columns improves recent data queries
4. Composite indexes cover multiple filter combinations
5. Run ANALYZE after creating indexes to update query planner statistics

Expected Performance Improvement: 60-80% faster dashboard queries
*/
