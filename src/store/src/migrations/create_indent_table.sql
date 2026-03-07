-- Create indent table for PostgreSQL (AWS RDS)
-- This table stores indent and requisition data

CREATE TABLE IF NOT EXISTS indent (
  id SERIAL PRIMARY KEY,
  sample_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  form_type VARCHAR(20) NOT NULL CHECK (form_type IN ('INDENT', 'REQUISITION')),
  request_number VARCHAR(50) NOT NULL,
  indent_series VARCHAR(10),
  requester_name VARCHAR(255),
  department VARCHAR(255),
  division VARCHAR(50),
  item_code VARCHAR(100),
  product_name VARCHAR(255),
  request_qty NUMERIC(10, 2) DEFAULT 0,
  uom VARCHAR(50),
  specification TEXT,
  make VARCHAR(255),
  purpose TEXT,
  cost_location VARCHAR(255),
  group_name VARCHAR(255),
  planned_1 TIMESTAMPTZ,
  actual_1 TIMESTAMPTZ,
  time_delay_1 INTERVAL,
  request_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (request_status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  approved_quantity NUMERIC(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_indent_request_number ON indent(request_number);
CREATE INDEX IF NOT EXISTS idx_indent_form_type ON indent(form_type);
CREATE INDEX IF NOT EXISTS idx_indent_request_status ON indent(request_status);
CREATE INDEX IF NOT EXISTS idx_indent_created_at ON indent(created_at);
CREATE INDEX IF NOT EXISTS idx_indent_requester_name ON indent(requester_name);
CREATE INDEX IF NOT EXISTS idx_indent_item_code ON indent(item_code);

-- Add unique constraint on request_number + form_type combination if needed
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_indent_unique_request ON indent(request_number, form_type);

COMMENT ON TABLE indent IS 'Stores indent and requisition data from users';
COMMENT ON COLUMN indent.form_type IS 'Type of form: INDENT or REQUISITION';
COMMENT ON COLUMN indent.request_status IS 'Status: PENDING, APPROVED, REJECTED, or CANCELLED';










