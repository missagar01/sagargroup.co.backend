-- Create enquiry table for O2D ERP system
-- This table stores all enquiry submissions from the frontend form

CREATE TABLE IF NOT EXISTS enq_erp (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_type VARCHAR(50) NOT NULL,
    size VARCHAR(50) NOT NULL,
    thickness NUMERIC(5,2) NOT NULL,
    enquiry_date DATE NOT NULL,
    customer VARCHAR(150) NOT NULL,
    quantity INT CHECK (quantity > 0),
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_enq_erp_item_type ON enq_erp(item_type);
CREATE INDEX IF NOT EXISTS idx_enq_erp_enquiry_date ON enq_erp(enquiry_date);
CREATE INDEX IF NOT EXISTS idx_enq_erp_customer ON enq_erp(customer);

-- Add comment to table
COMMENT ON TABLE enq_erp IS 'Stores enquiry submissions from O2D enquiry form';
COMMENT ON COLUMN enq_erp.id IS 'Auto-incrementing primary key';
COMMENT ON COLUMN enq_erp.item_type IS 'Type of item: round, square, or rectangular';
COMMENT ON COLUMN enq_erp.size IS 'Size specification from size_master';
COMMENT ON COLUMN enq_erp.thickness IS 'Thickness in mm (max 999.99)';
COMMENT ON COLUMN enq_erp.enquiry_date IS 'Date of enquiry submission';
COMMENT ON COLUMN enq_erp.customer IS 'Customer name';
COMMENT ON COLUMN enq_erp.quantity IS 'Optional quantity (must be positive if provided)';
COMMENT ON COLUMN enq_erp.created_at IS 'Timestamp when record was created';
