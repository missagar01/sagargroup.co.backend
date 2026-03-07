// src/controllers/costLocation.controller.js
import { 
  getCostLocationsService, 
  getCostLocationsRP, 
  getCostLocationsPM,
  getCostLocationsCO 
} from "../services/costLocation.service.js";

export async function getCostLocations(req, res) {
  try {
    // Get division code from query parameter (optional)
    const divCode = req.query.divCode || null;
    
    const result = await getCostLocationsService(divCode);

    if (!result.ok) {
      return res.status(500).json({
        success: false,
        error: result.error || "Failed to fetch cost locations",
      });
    }

    const data = result.rows.map((row) => ({
      cost_name: row.COST_NAME || row.cost_name,
    }));

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("getCostLocations controller error:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

export async function getCostLocationsRPController(req, res) {
  try {
    const result = await getCostLocationsRP();

    if (!result.ok) {
      return res.status(500).json({
        success: false,
        error: result.error || "Failed to fetch RP cost locations",
      });
    }

    const data = result.rows.map((row) => ({
      cost_name: row.COST_NAME || row.cost_name,
    }));

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("getCostLocationsRP controller error:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

export async function getCostLocationsPMController(req, res) {
  try {
    const result = await getCostLocationsPM();

    if (!result.ok) {
      return res.status(500).json({
        success: false,
        error: result.error || "Failed to fetch PM cost locations",
      });
    }

    const data = result.rows.map((row) => ({
      cost_name: row.COST_NAME || row.cost_name,
    }));

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("getCostLocationsPM controller error:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

export async function getCostLocationsCOController(req, res) {
  try {
    const result = await getCostLocationsCO();

    if (!result.ok) {
      return res.status(500).json({
        success: false,
        error: result.error || "Failed to fetch CO cost locations",
      });
    }

    const data = result.rows.map((row) => ({
      cost_name: row.COST_NAME || row.cost_name,
    }));

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("getCostLocationsCO controller error:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

