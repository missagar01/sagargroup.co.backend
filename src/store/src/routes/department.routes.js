import { Router } from 'express';
import * as departmentController from '../controllers/department.controller.js';

const router = Router();

router.get('/', departmentController.getDepartments);
router.post('/', departmentController.createDepartment);
router.put('/:id', departmentController.updateDepartment);
router.delete('/:id', departmentController.deleteDepartment);

export default router;
