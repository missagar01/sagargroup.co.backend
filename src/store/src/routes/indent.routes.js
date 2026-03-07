import { Router } from "express";
import {
  submitIndent,
  updateIndentDecision,
  listIndents,
  listAllIndents,
  getIndent,
  filterIndents,
  listIndentsByStatus,
  updateIndentNumber,
} from "../controllers/indent.controller.js";

const router = Router();

router.get("/", listIndents);
router.get("/all", listAllIndents);
router.get("/filter", filterIndents);
router.get("/status/:statusType", listIndentsByStatus); // New dynamic route
router.post("/", submitIndent);
// PUT route must come before GET /:requestNumber to avoid route conflicts
router.put("/:requestNumber/status", updateIndentDecision);
router.get("/:requestNumber", getIndent);
router.patch("/:requestNumber/indent-number", updateIndentNumber);

export default router;
