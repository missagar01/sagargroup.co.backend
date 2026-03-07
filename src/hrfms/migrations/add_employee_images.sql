-- Migration: Add profile_img and document_img columns to employees table
-- Run this SQL script to add the new columns

ALTER TABLE employees
ADD COLUMN IF NOT EXISTS profile_img TEXT,
ADD COLUMN IF NOT EXISTS document_img TEXT;
