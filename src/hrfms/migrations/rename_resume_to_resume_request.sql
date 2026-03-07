-- Migration: Rename resume table to resume_request
-- Description: Renames the 'resume' table to 'resume_request'

ALTER TABLE resume RENAME TO resume_request;
