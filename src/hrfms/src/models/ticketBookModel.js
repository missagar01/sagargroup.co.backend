const pool = require('../config/db');

class TicketBookModel {
  async findAll() {
    const query = `
      SELECT * FROM ticket_book 
      ORDER BY created_at ASC
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  async findById(id) {
    const query = 'SELECT * FROM ticket_book WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async create(data) {
    const query = `
      INSERT INTO ticket_book (
        id,
        bill_number,
        travels_name,
        type_of_bill,
        charges,
        per_ticket_amount,
        total_amount,
        status,
        upload_bill_image,
        person_name,
        booked_name,
        request_employee_code,
        booked_employee_code,
        created_at,
        updated_at
      ) VALUES (
        (SELECT COALESCE(MAX(id), 0) + 1 FROM ticket_book),
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING *
    `;

    const values = [
      data.bill_number,
      data.travels_name,
      data.type_of_bill,
      data.charges,
      data.per_ticket_amount,
      data.total_amount,
      data.status,
      data.upload_bill_image || null,
      data.person_name,
      data.booked_name,
      data.request_employee_code,
      data.booked_employee_code
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  async update(id, data) {
    const query = `
      UPDATE ticket_book
      SET 
        bill_number = COALESCE($1, bill_number),
        travels_name = COALESCE($2, travels_name),
        type_of_bill = COALESCE($3, type_of_bill),
        charges = COALESCE($4, charges),
        per_ticket_amount = COALESCE($5, per_ticket_amount),
        total_amount = COALESCE($6, total_amount),
        status = COALESCE($7, status),
        upload_bill_image = COALESCE($8, upload_bill_image),
        person_name = COALESCE($9, person_name),
        booked_name = COALESCE($10, booked_name),
        request_employee_code = COALESCE($11, request_employee_code),
        booked_employee_code = COALESCE($12, booked_employee_code),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $13
      RETURNING *
    `;

    const values = [
      data.bill_number,
      data.travels_name,
      data.type_of_bill,
      data.charges,
      data.per_ticket_amount,
      data.total_amount,
      data.status,
      data.upload_bill_image,
      data.person_name,
      data.booked_name,
      data.request_employee_code,
      data.booked_employee_code,
      id
    ];

    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  async delete(id) {
    const query = 'DELETE FROM ticket_book WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }
}

module.exports = new TicketBookModel();
