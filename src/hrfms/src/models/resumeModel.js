const pool = require('../config/db');

class ResumeModel {
  async findAll() {
    const query = `
      SELECT * FROM resume_request
      ORDER BY created_at ASC
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  async findById(id) {
    const query = 'SELECT * FROM resume_request WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async create(data) {
    // Check if the table is empty or has data
    const query = `
      INSERT INTO resume_request (
        id,
        candidate_name,
        candidate_email,
        candidate_mobile,
        applied_for_designation,
        req_id,
        experience,
        previous_company,
        previous_salary,
        reason_for_changing,
        marital_status,
        reference,
        address_present,
        resume,
        interviewer_planned,
        interviewer_actual,
        interviewer_status,
        candidate_status,
        joined_status,
        created_at,
        updated_at
      ) VALUES (
        (SELECT COALESCE(MAX(id), 0) + 1 FROM resume_request),
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING *
    `;

    const values = [
      data.candidate_name || null,
      data.candidate_email || null,
      data.candidate_mobile || null,
      data.applied_for_designation || null,
      data.req_id || null,
      data.experience || null,
      data.previous_company || null,
      data.previous_salary || null,
      data.reason_for_changing || null,
      data.marital_status || null,
      data.reference || null,
      data.address_present || null,
      data.resume || null,
      data.interviewer_planned || null,
      data.interviewer_actual || null,
      data.interviewer_status || null,
      data.candidate_status || 'Pending',
      data.joined_status || 'No'
    ];

    try {
      const result = await pool.query(query, values);

      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      } else {
        return null;
      }

    } catch (error) {
      console.error('❌ DB ERROR in ResumeModel.create:', error.message);
      console.error('❌ ERROR STACK:', error.stack);
      throw error;
    }
  }

  async update(id, data) {
    const query = `
      UPDATE resume_request
      SET
        candidate_name = COALESCE($1, candidate_name),
        candidate_email = COALESCE($2, candidate_email),
        candidate_mobile = COALESCE($3, candidate_mobile),
        applied_for_designation = COALESCE($4, applied_for_designation),
        req_id = COALESCE($5, req_id),
        experience = COALESCE($6, experience),
        previous_company = COALESCE($7, previous_company),
        previous_salary = COALESCE($8, previous_salary),
        reason_for_changing = COALESCE($9, reason_for_changing),
        marital_status = COALESCE($10, marital_status),
        reference = COALESCE($11, reference),
        address_present = COALESCE($12, address_present),
        resume = COALESCE($13, resume),
        interviewer_planned = COALESCE($14, interviewer_planned),
        interviewer_actual = COALESCE($15, interviewer_actual),
        interviewer_status = COALESCE($16, interviewer_status),
        candidate_status = COALESCE($17, candidate_status),
        joined_status = COALESCE($18, joined_status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $19
      RETURNING *
    `;

    const values = [
      data.candidate_name,
      data.candidate_email,
      data.candidate_mobile,
      data.applied_for_designation,
      data.req_id,
      data.experience,
      data.previous_company,
      data.previous_salary,
      data.reason_for_changing,
      data.marital_status,
      data.reference,
      data.address_present,
      data.resume,
      data.interviewer_planned,
      data.interviewer_actual,
      data.interviewer_status,
      data.candidate_status,
      data.joined_status,
      id
    ];

    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  async delete(id) {
    const query = 'DELETE FROM resume_request WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }

  // get only selected candidates
  async findSelectedCandidates() {
    const query = `
    SELECT *
    FROM resume_request
    WHERE candidate_status = 'Selected'
    ORDER BY updated_at DESC
  `;
    const result = await pool.query(query);
    return result.rows;
  }

}

module.exports = new ResumeModel();
