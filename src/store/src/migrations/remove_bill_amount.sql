-- Migration: Remove party_bill_amount from store_grn table
-- Created at: 2026-02-24

ALTER TABLE store_grn DROP COLUMN IF EXISTS party_bill_amount;
