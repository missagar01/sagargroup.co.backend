// src/routes/costLocation.routes.js
import { Router } from "express";
import { 
  getCostLocations, 
  getCostLocationsRPController, 
  getCostLocationsPMController,
  getCostLocationsCOController 
} from "../controllers/costLocation.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

// GET http://localhost:3004/cost-location?divCode=SM (optional)
router.get("/", authenticate, getCostLocations);

// GET http://localhost:3004/cost-location/rp - RP Division Cost Locations
router.get("/rp", authenticate, getCostLocationsRPController);

// GET http://localhost:3004/cost-location/pm - PM Division Cost Locations
router.get("/pm", authenticate, getCostLocationsPMController);

// GET http://localhost:3004/cost-location/co - CO Division Cost Locations (DIV_CODE IS NULL)
router.get("/co", authenticate, getCostLocationsCOController);

export default router;

