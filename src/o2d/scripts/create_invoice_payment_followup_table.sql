-- Stores CRM-entered payment status against ERP-generated sales invoices (vrno).
-- Invoice data itself (vrno, date, party, truck, item) is read live from Oracle
-- (view_itemtran_engine); this table only holds the follow-up status CRM enters.

CREATE TABLE IF NOT EXISTS invoice_payment_followup (
    id BIGSERIAL PRIMARY KEY,
    vrno VARCHAR(50) NOT NULL UNIQUE,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (payment_status IN ('pending', 'advance', 'half', 'full')),
    amount_received NUMERIC(14,2),
    remarks VARCHAR(1000),
    updated_by VARCHAR(150),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
