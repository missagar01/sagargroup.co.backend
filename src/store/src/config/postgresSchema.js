import pool from "./postgres.js";

let initPromise = null;

async function ensureRepairSystemTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.repair_system (
      id SERIAL PRIMARY KEY,
      time_stamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      task_no VARCHAR(100),
      serial_no VARCHAR(100),
      machine_name TEXT,
      machine_part_name TEXT,
      given_by VARCHAR(255),
      doer_name VARCHAR(255),
      problem_with_machine TEXT,
      enable_reminders BOOLEAN DEFAULT FALSE,
      require_attachment BOOLEAN DEFAULT FALSE,
      task_start_date DATE,
      task_ending_date DATE,
      priority VARCHAR(50),
      department VARCHAR(100),
      location VARCHAR(255),
      image_link TEXT,
      planned_1 TIMESTAMPTZ,
      actual_1 TIMESTAMPTZ,
      delay_1 INTEGER,
      vendor_name VARCHAR(255),
      lead_time_to_deliver INTEGER,
      transporter_name_1 VARCHAR(255),
      transportation_charges NUMERIC(14, 2),
      weighment_slip TEXT,
      transporting_image_with_machine TEXT,
      payment_type VARCHAR(100),
      how_much NUMERIC(14, 2),
      planned_2 TIMESTAMPTZ,
      actual_2 TIMESTAMPTZ,
      delay_2 INTEGER,
      planned_3 TIMESTAMPTZ,
      actual_3 TIMESTAMPTZ,
      delay_3 INTEGER,
      received_quantity NUMERIC(14, 2),
      bill_match BOOLEAN DEFAULT FALSE,
      product_image TEXT,
      bill_image TEXT,
      bill_no VARCHAR(100),
      type_of_bill VARCHAR(100),
      total_bill_amount NUMERIC(14, 2),
      to_be_paid_amount NUMERIC(14, 2),
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const repairSystemColumns = [
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS task_no VARCHAR(100)",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS serial_no VARCHAR(100)",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS machine_name TEXT",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS machine_part_name TEXT",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS given_by VARCHAR(255)",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS doer_name VARCHAR(255)",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS problem_with_machine TEXT",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS enable_reminders BOOLEAN DEFAULT FALSE",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS require_attachment BOOLEAN DEFAULT FALSE",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS task_start_date DATE",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS task_ending_date DATE",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS priority VARCHAR(50)",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS department VARCHAR(100)",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS location VARCHAR(255)",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS image_link TEXT",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS planned_1 TIMESTAMPTZ",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS actual_1 TIMESTAMPTZ",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS delay_1 INTEGER",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS vendor_name VARCHAR(255)",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS lead_time_to_deliver INTEGER",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS transporter_name_1 VARCHAR(255)",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS transportation_charges NUMERIC(14, 2)",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS weighment_slip TEXT",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS transporting_image_with_machine TEXT",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS payment_type VARCHAR(100)",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS how_much NUMERIC(14, 2)",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS planned_2 TIMESTAMPTZ",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS actual_2 TIMESTAMPTZ",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS delay_2 INTEGER",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS planned_3 TIMESTAMPTZ",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS actual_3 TIMESTAMPTZ",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS delay_3 INTEGER",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS received_quantity NUMERIC(14, 2)",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS bill_match BOOLEAN DEFAULT FALSE",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS product_image TEXT",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS bill_image TEXT",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS bill_no VARCHAR(100)",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS type_of_bill VARCHAR(100)",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS total_bill_amount NUMERIC(14, 2)",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS to_be_paid_amount NUMERIC(14, 2)",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending'",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    "ALTER TABLE public.repair_system ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  ];

  for (const statement of repairSystemColumns) {
    await pool.query(statement);
  }

  await pool.query("CREATE INDEX IF NOT EXISTS idx_repair_system_task_no ON public.repair_system (task_no)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_repair_system_status ON public.repair_system (status)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_repair_system_department ON public.repair_system (department)");
}

async function ensureRepairFollowupTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.repair_followup (
      id SERIAL PRIMARY KEY,
      gate_pass_date DATE,
      gate_pass_no VARCHAR(100),
      department VARCHAR(100),
      party_name VARCHAR(255),
      item_name TEXT,
      item_code VARCHAR(100),
      remarks TEXT,
      uom VARCHAR(50),
      qty_issued NUMERIC(14, 2),
      lead_time INTEGER,
      planned1 DATE,
      actual1 DATE,
      time_delay1 INTEGER,
      stage1_status VARCHAR(50),
      planned2 DATE,
      actual2 DATE,
      time_delay2 INTEGER,
      stage2_status VARCHAR(50),
      gate_pass_status VARCHAR(50),
      extended_date DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const repairFollowupColumns = [
    "ALTER TABLE public.repair_followup ADD COLUMN IF NOT EXISTS gate_pass_date DATE",
    "ALTER TABLE public.repair_followup ADD COLUMN IF NOT EXISTS gate_pass_no VARCHAR(100)",
    "ALTER TABLE public.repair_followup ADD COLUMN IF NOT EXISTS department VARCHAR(100)",
    "ALTER TABLE public.repair_followup ADD COLUMN IF NOT EXISTS party_name VARCHAR(255)",
    "ALTER TABLE public.repair_followup ADD COLUMN IF NOT EXISTS item_name TEXT",
    "ALTER TABLE public.repair_followup ADD COLUMN IF NOT EXISTS item_code VARCHAR(100)",
    "ALTER TABLE public.repair_followup ADD COLUMN IF NOT EXISTS remarks TEXT",
    "ALTER TABLE public.repair_followup ADD COLUMN IF NOT EXISTS uom VARCHAR(50)",
    "ALTER TABLE public.repair_followup ADD COLUMN IF NOT EXISTS qty_issued NUMERIC(14, 2)",
    "ALTER TABLE public.repair_followup ADD COLUMN IF NOT EXISTS lead_time INTEGER",
    "ALTER TABLE public.repair_followup ADD COLUMN IF NOT EXISTS planned1 DATE",
    "ALTER TABLE public.repair_followup ADD COLUMN IF NOT EXISTS actual1 DATE",
    "ALTER TABLE public.repair_followup ADD COLUMN IF NOT EXISTS time_delay1 INTEGER",
    "ALTER TABLE public.repair_followup ADD COLUMN IF NOT EXISTS stage1_status VARCHAR(50)",
    "ALTER TABLE public.repair_followup ADD COLUMN IF NOT EXISTS planned2 DATE",
    "ALTER TABLE public.repair_followup ADD COLUMN IF NOT EXISTS actual2 DATE",
    "ALTER TABLE public.repair_followup ADD COLUMN IF NOT EXISTS time_delay2 INTEGER",
    "ALTER TABLE public.repair_followup ADD COLUMN IF NOT EXISTS stage2_status VARCHAR(50)",
    "ALTER TABLE public.repair_followup ADD COLUMN IF NOT EXISTS gate_pass_status VARCHAR(50)",
    "ALTER TABLE public.repair_followup ADD COLUMN IF NOT EXISTS extended_date DATE",
    "ALTER TABLE public.repair_followup ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    "ALTER TABLE public.repair_followup ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  ];

  for (const statement of repairFollowupColumns) {
    await pool.query(statement);
  }

  await pool.query("CREATE INDEX IF NOT EXISTS idx_repair_followup_gate_pass_no ON public.repair_followup (gate_pass_no)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_repair_followup_status ON public.repair_followup (gate_pass_status)");
}

async function ensureUsersStoreAccessColumn() {
  await pool.query("ALTER TABLE public.users ADD COLUMN IF NOT EXISTS store_access TEXT");
}

export async function initStorePostgresSchema() {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    await ensureRepairSystemTable();
    await ensureRepairFollowupTable();
    await ensureUsersStoreAccessColumn();
    console.log("Store PostgreSQL schema ensured");
  })();

  try {
    return await initPromise;
  } catch (error) {
    initPromise = null;
    throw error;
  }
}
