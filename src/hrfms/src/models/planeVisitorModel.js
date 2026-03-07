const pool = require('../config/db');

class PlaneVisitorModel {
  async findAll() {
    const query = `
      SELECT *
      FROM plant_visitor
      ORDER BY created_at ASC
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  async findById(id) {
    const query = 'SELECT * FROM plant_visitor WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async create(data) {
    const query = `
      INSERT INTO plant_visitor (
        id,
        person_name,
        employee_code,
        reason_for_visit,
        no_of_person,
        from_date,
        to_date,
        requester_name,
        approv_employee_code,
        approve_by_name,
        request_for,
        remarks,
        request_status,
        created_at,
        updated_at
      ) VALUES (
        (SELECT COALESCE(MAX(id), 0) + 1 FROM plant_visitor),
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING *
    `;

    const values = [
      data.person_name,
      data.employee_code,
      data.reason_for_visit,
      data.no_of_person,
      data.from_date,
      data.to_date,
      data.requester_name,
      data.approv_employee_code,
      data.approve_by_name,
      data.request_for,
      data.remarks,
      data.request_status
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  async update(id, data) {
    const query = `
      UPDATE plant_visitor
      SET
        person_name = COALESCE($1, person_name),
        employee_code = COALESCE($2, employee_code),
        reason_for_visit = COALESCE($3, reason_for_visit),
        no_of_person = COALESCE($4, no_of_person),
        from_date = COALESCE($5, from_date),
        to_date = COALESCE($6, to_date),
        requester_name = COALESCE($7, requester_name),
        approv_employee_code = COALESCE($8, approv_employee_code),
        approve_by_name = COALESCE($9, approve_by_name),
        request_for = COALESCE($10, request_for),
        remarks = COALESCE($11, remarks),
        request_status = COALESCE($12, request_status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $13
      RETURNING *
    `;

    const values = [
      data.person_name,
      data.employee_code,
      data.reason_for_visit,
      data.no_of_person,
      data.from_date,
      data.to_date,
      data.requester_name,
      data.approv_employee_code,
      data.approve_by_name,
      data.request_for,
      data.remarks,
      data.request_status,
      id
    ];

    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  async delete(id) {
    const query = 'DELETE FROM plant_visitor WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }
}

module.exports = new PlaneVisitorModel();
