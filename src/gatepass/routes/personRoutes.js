import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
    getAllPersons,
    createPerson,
    updatePerson,
    deletePerson
} from "../controllers/personController.js";

const router = express.Router();

router.use(protect);
router.get("/", getAllPersons);
router.post("/", createPerson);
router.put("/:id", updatePerson);
router.delete("/:id", deletePerson);

export default router;
