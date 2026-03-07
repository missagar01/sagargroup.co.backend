-- Migration: add columns for profile and document image URLs on the employees table
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS profile_img TEXT,
ADD COLUMN IF NOT EXISTS document_img TEXT;
