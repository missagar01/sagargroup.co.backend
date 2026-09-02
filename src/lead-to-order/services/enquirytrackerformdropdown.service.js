const pool = require("../config/db.js");

const getDropdownValues = async (columnName) => {
  // Validate only allowed columns
const allowedColumns = [
  "lead_receiver_name",
  "lead_source",
  "state",
  "quotation_shared_by",
  "enquiry_status",
  "acceptance_via",
  "payment_mode",
  "payment_terms_days",
  "not_received_reason_status",
  "hold_reason_category",
  "followup_status",
  "what_did_customer_say",
  
  // ADD THESE ↓↓↓
  "transport_mode"
];

  if (!allowedColumns.includes(columnName)) {
    throw new Error(`Invalid dropdown column: "${columnName}". Allowed columns: ${allowedColumns.join(", ")}`);
  }

  const query = `
      SELECT DISTINCT ${columnName}
      FROM dropdown
      WHERE ${columnName} IS NOT NULL AND ${columnName} <> ''
      ORDER BY ${columnName} ASC
  `;

  const result = await pool.query(query);

  return result.rows.map(r => r[columnName]);
};

module.exports = {
  getDropdownValues
};

