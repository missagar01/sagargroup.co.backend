CREATE TABLE IF NOT EXISTS plant_visitor (
  id BIGSERIAL PRIMARY KEY,
  person_name VARCHAR(150),
  employee_code VARCHAR(50),
  reason_for_visit TEXT,
  no_of_person INTEGER,
  from_date DATE,
  to_date DATE,
  requester_name VARCHAR(150),
  approv_employee_code VARCHAR(50) DEFAULT '',
  approve_by_name VARCHAR(150) DEFAULT '',
  request_for VARCHAR(150),
  remarks TEXT,
  request_status VARCHAR(50) DEFAULT 'PENDING',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
