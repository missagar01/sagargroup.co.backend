import { Router } from "express";
import * as chatbotController from "../controllers/chatbotController.js";
import { validateApiKey } from "../middlewares/auth.middleware.js";

const router = Router();

// Public route to allow the local frontend to retrieve the API key for headers
router.get("/config", (req, res) => {
  res.status(200).json({ apiKey: process.env.API_KEY || "" });
});

// Protected routes for chatbot operations
router.get("/items", validateApiKey, chatbotController.searchItems);
router.get("/stock/:itemCode", validateApiKey, chatbotController.getItemStock);
router.get("/series", validateApiKey, chatbotController.getIndentSeries);
router.get("/departments", validateApiKey, chatbotController.getDepartments);
router.get("/cost-codes", validateApiKey, chatbotController.getCostCodes);
router.get("/employees", validateApiKey, chatbotController.getEmployees);
router.get("/makes", validateApiKey, chatbotController.getMakes);
router.post("/indent", validateApiKey, chatbotController.createIndent);
router.post("/users/query", validateApiKey, chatbotController.queryUsers);
router.post("/tasks/query", validateApiKey, chatbotController.queryTasks);
router.post("/query", validateApiKey, chatbotController.queryGeneral);

export default router;
