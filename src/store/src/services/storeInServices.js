import pool from "../config/postgres.js";

export const fetchRepairTasks = async () => {
  const query = `
  SELECT
  id,
  time_stamp,
  task_no,
  serial_no,
  machine_name,
  machine_part_name,
  given_by,
  doer_name,
  problem_with_machine,
  enable_reminders,
  require_attachment,
  task_start_date,
  task_ending_date,
  priority,
  department,
  location,
  image_link,

  planned_1,
  actual_1,
  delay_1,

  vendor_name,
  lead_time_to_deliver,
  transporter_name_1,
  transportation_charges,
  weighment_slip,
  transporting_image_with_machine,
  payment_type,
  how_much,

  planned_2,
  actual_2,
  delay_2,

  planned_3,
  actual_3,
  delay_3,

  received_quantity,
  bill_match,
  product_image,

  bill_image,
  bill_no,
  type_of_bill,
  total_bill_amount,
  to_be_paid_amount

FROM repair_system
ORDER BY id DESC;

  `;

  const { rows } = await pool.query(query);

return rows.map((row) => ({
  id: row.id,
  taskNo: row.task_no,
  serialNo: row.serial_no,
  machineName: row.machine_name,
  machinePartName: row.machine_part_name,
  doerName: row.doer_name,
  vendorName: row.vendor_name,

  planned2: row.planned_2,
  actual2: row.actual_2,
  delay2: row.delay_2,

  planned_3: row.planned_3,    // 🔥 FIX
  actual_3: row.actual_3,      // 🔥 FIX
  delay_3: row.delay_3,        // 🔥 FIX

  receivedQuantity: row.received_quantity,
  billMatch: row.bill_match ? "Yes" : "No",
  billImage: row.bill_image,
  billNo: row.bill_no,
  toBePaidAmount: row.to_be_paid_amount,
  totalBillAmount: row.total_bill_amount,
  productImage: row.product_image,
  paymentType: row.payment_type,
  howMuch: row.how_much,
  leadTimeToDeliverDays: row.lead_time_to_deliver,
}));

};



export const updateStoreIn = async (taskNo, data) => {
  const query = `
    UPDATE repair_system
    SET
      actual_3 = COALESCE($1, NOW()),
      received_quantity = $2,
      bill_match = $3,
      product_image = $4,
      bill_image = $5,
      bill_no = $6
    WHERE task_no = $7
    RETURNING *;
  `;

  const values = [
    data.actual_3 || null,      // ⭐ NOW FIXED
    data.receivedQuantity,
    data.billMatch === "Yes",
    data.productImage || null,
    data.billImage || null,
    data.billNo || null,
    taskNo
  ];

  const { rows } = await pool.query(query, values);
  return rows[0];
};
