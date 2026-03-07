const pool = require('../config/db');

class LeaveRequestModel {
  async findAll() {
    const query = `
      SELECT * FROM leave_request
      ORDER BY created_at ASC
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  async findById(id) {
    const query = 'SELECT * FROM leave_request WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByApprovedStatus(status) {
    const query = `
      SELECT * FROM leave_request
      WHERE approved_by_status = $1
      ORDER BY created_at ASC
    `;
    const result = await pool.query(query, [status]);
    return result.rows;
  }

  async create(data) {
    const query = `
      INSERT INTO leave_request (
        id,
        employee_id,
          employee_name,
        designation,
        department,
        from_date,
        to_date,
        reason,
        request_status,
        approved_by,
        approved_by_status,
        hr_approval,
        approval_hr,
        mobilenumber,
        urgent_mobilenumber,
        commercial_head_status,
        approve_dates,
        created_at,
        updated_at,
        user_id
      ) VALUES (
        (SELECT COALESCE(MAX(id), 0) + 1 FROM leave_request),
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $17
      )
      RETURNING *
    `;

    const values = [
      data.employee_id ?? null,
      data.employee_name ?? null,
      data.designation ?? null,
      data.department ?? null,
      data.from_date ?? null,
      data.to_date ?? null,
      data.reason ?? null,
      data.request_status ?? null,
      data.approved_by ?? null,
      data.approved_by_status ?? null,
      data.hr_approval ?? null,
      data.approval_hr ?? null,
      data.mobilenumber ?? null,
      data.urgent_mobilenumber ?? null,
      data.commercial_head_status ?? null,
      data.approve_dates ?? null,
      data.user_id ?? null
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  async update(id, data) {
    const query = `
      UPDATE leave_request
      SET
        employee_id = COALESCE($1, employee_id),
          employee_name = COALESCE($2,   employee_name),
        designation = COALESCE($3, designation),
        department = COALESCE($4, department),
        from_date = COALESCE($5, from_date),
        to_date = COALESCE($6, to_date),
        reason = COALESCE($7, reason),
        request_status = COALESCE($8, request_status),
        approved_by = COALESCE($9, approved_by),
        approved_by_status = COALESCE($10, approved_by_status),
        hr_approval = COALESCE($11, hr_approval),
        approval_hr = COALESCE($12, approval_hr),
        mobilenumber = COALESCE($13, mobilenumber),
        urgent_mobilenumber = COALESCE($14, urgent_mobilenumber),
        commercial_head_status = COALESCE($15, commercial_head_status),
        approve_dates = COALESCE($16, approve_dates),
        user_id = COALESCE($17, user_id),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $18
      RETURNING *
    `;

    const values = [
      data.employee_id,
      data.employee_name,
      data.designation,
      data.department,
      data.from_date,
      data.to_date,
      data.reason,
      data.request_status,
      data.approved_by,
      data.approved_by_status,
      data.hr_approval,
      data.approval_hr,
      data.mobilenumber,
      data.urgent_mobilenumber,
      data.commercial_head_status,
      data.approve_dates,
      data.user_id,
      id
    ];

    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  async delete(id) {
    const query = 'DELETE FROM leave_request WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }
}

module.exports = new LeaveRequestModel();
