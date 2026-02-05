const { Router } = require("express");
const { login, logout } = require("../controllers/login.controller.js");
const { loginQuery } = require("../../../config/pg.js");

const router = Router();

router.post("/login", login);
router.post("/logout", logout);

// GET /auth/crm-users - Fetch all users from CRM department
router.get("/crm-users", async (req, res) => {
    try {
        const query = `
      SELECT 
        id,
        user_name,
        employee_id,
        email_id,
        department,
        role
      FROM users
      WHERE department = 'CRM'
        AND COALESCE(status, 'active') = 'active'
      ORDER BY user_name ASC
    `;

        const result = await loginQuery(query, []);

        return res.status(200).json({
            success: true,
            data: result.rows || []
        });
    } catch (err) {
        console.error("Error fetching CRM users:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch CRM users",
            error: process.env.NODE_ENV === "development" ? err.message : "Internal server error"
        });
    }
});

module.exports = router;
