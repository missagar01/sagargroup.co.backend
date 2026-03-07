const pool = require('../config/db');

class RequestModel {
  async findAll() {
    const query = `
      SELECT * FROM request 
      ORDER BY created_at ASC
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  async findById(id) {
    const query = 'SELECT * FROM request WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async create(data) {
    const query = `
      WITH next_vals AS (
        SELECT COALESCE(MAX(id), 0) + 1 AS id FROM request
      ),
      next_no AS (
        SELECT 'T-' || LPAD((v.id)::text, 4, '0') AS request_no 
        FROM next_vals v
      )
      INSERT INTO request (
        id,
        request_no,
        employee_code,
        person_name,
        type_of_travel,
        reason_for_travel,
        no_of_person,
        from_date,
        to_date,
        from_city,
        to_city,
        departure_date,
        requester_name,
        requester_designation,
        requester_department,
        request_for,
        request_quantity,
        experience,
        education,
        remarks,
        request_status,
        created_at,
        updated_at
      )
      SELECT
        v.id,
        n.request_no,
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17, $18, $19, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM next_vals v, next_no n
      RETURNING *
    `;

    const values = [
      data.employee_code || null,
      data.person_name || null,
      data.type_of_travel || null,
      data.reason_for_travel || null,
      data.no_of_person !== null && data.no_of_person !== undefined ? data.no_of_person : null,
      data.from_date || null,
      data.to_date || null,
      data.from_city || null,
      data.to_city || null,
      data.departure_date || null,
      data.requester_name || null,
      data.requester_designation || null,
      data.requester_department || null,
      data.request_for || null,
      data.request_quantity !== null && data.request_quantity !== undefined ? data.request_quantity : null,
      data.experience || null,
      data.education || null,
      data.remarks || null,
      data.request_status || 'Open'
    ];

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('❌ MODEL ERROR in RequestModel.create:', error.message);
      console.error('❌ Values:', JSON.stringify(values, null, 2));
      throw error;
    }
  }

  async update(id, data) {
    const query = `
      UPDATE request
      SET 
        employee_code = COALESCE($1, employee_code),
        person_name = COALESCE($2, person_name),
        type_of_travel = COALESCE($3, type_of_travel),
        reason_for_travel = COALESCE($4, reason_for_travel),
        no_of_person = COALESCE($5, no_of_person),
        from_date = COALESCE($6, from_date),
        to_date = COALESCE($7, to_date),
        from_city = COALESCE($8, from_city),
        to_city = COALESCE($9, to_city),
        departure_date = COALESCE($10, departure_date),
        requester_name = COALESCE($11, requester_name),
        requester_designation = COALESCE($12, requester_designation),
        requester_department = COALESCE($13, requester_department),
        request_for = COALESCE($14, request_for),
        request_quantity = COALESCE($15, request_quantity),
        experience = COALESCE($16, experience),
        education = COALESCE($17, education),
        remarks = COALESCE($18, remarks),
        request_status = COALESCE($19, request_status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $20
      RETURNING *
    `;

    const values = [
      data.employee_code,
      data.person_name,
      data.type_of_travel,
      data.reason_for_travel,
      data.no_of_person,
      data.from_date,
      data.to_date,
      data.from_city,
      data.to_city,
      data.departure_date,
      data.requester_name,
      data.requester_designation,
      data.requester_department,
      data.request_for,
      data.request_quantity,
      data.experience,
      data.education,
      data.remarks,
      data.request_status,
      id
    ];

    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  async delete(id) {
    const query = 'DELETE FROM request WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }
}

module.exports = new RequestModel();
