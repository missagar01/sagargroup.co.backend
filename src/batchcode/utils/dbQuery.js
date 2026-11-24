const { getPool } = require("../config/database");

// pg releases the checked-out client after both success and failure.
const query = (text, params = []) => getPool().query(text, params);

module.exports = { query };