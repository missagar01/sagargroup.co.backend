import pool from "../config/postgres.js";

/* =========================
   HELPER: ORACLE DATE PARSE
========================= */
function parseOracleDateTime(value) {
  if (!value) return null;

  // DD/MM/YYYY HH:mm:ss → YYYY-MM-DD HH:mm:ss
  const [datePart, timePart] = value.split(" ");
  if (!datePart || !timePart) return null;

  const [dd, mm, yyyy] = datePart.split("/");
  if (!dd || !mm || !yyyy) return null;

  return `${yyyy}-${mm}-${dd} ${timePart}`;
}

/* =========================
   POST: SEND BILL (INSERT)
========================= */
export async function createSendedBill(data) {
  const query = `
    INSERT INTO store_grn (
      planned_date,
      grn_no,
      grn_date,
      party_name,
      party_bill_no,
      sended_bill,
      approved_by_admin
    )
    VALUES ($1, $2, $3, $4, $5, TRUE, TRUE)
    ON CONFLICT (grn_no)
    DO UPDATE SET
      sended_bill = TRUE,
      approved_by_admin = TRUE
    RETURNING *;
  `;

  const values = [
    parseOracleDateTime(data.planned_date),
    data.grn_no,
    data.grn_date || null,
    data.party_name || null,
    data.party_bill_no || null,
  ];

  const { rows } = await pool.query(query, values);
  return rows[0];
}


/* =========================
   GET ALL STORE GRN
========================= */
export async function getAllStoreGRN() {
  const query = `
    SELECT
      planned_date,
      grn_no,
      grn_date,
      party_name,
      party_bill_no,
      sended_bill,
      approved_by_admin,
      approved_by_gm,
      close_bill
    FROM store_grn
    ORDER BY planned_date DESC NULLS LAST;
  `;

  const { rows } = await pool.query(query);
  return rows;
}


/* =========================
   PATCH: APPROVED BY GM
========================= */
export async function patchApprovedByGM(grnNo) {
  const query = `
    UPDATE store_grn
    SET approved_by_gm = TRUE
    WHERE grn_no = $1
    RETURNING *;
  `;

  const { rows } = await pool.query(query, [grnNo]);
  return rows[0];
}

/* =========================
   PATCH: CLOSE BILL
========================= */
export async function patchCloseBill(grnNo) {
  const query = `
    UPDATE store_grn
    SET close_bill = TRUE
    WHERE grn_no = $1
    RETURNING *;
  `;

  const { rows } = await pool.query(query, [grnNo]);
  return rows[0];
}
