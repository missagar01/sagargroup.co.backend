const express = require('express');
const resumeController = require('../controllers/resumeController');
const { authenticateToken } = require('../middleware/auth');
const resumeUpload = require('../middleware/resumeUpload');

const router = express.Router();

router.use(authenticateToken);

router.get('/', resumeController.listResumes.bind(resumeController));
router.get('/selected', resumeController.listSelectedResumes.bind(resumeController)
);
router.get('/:id', resumeController.getResume.bind(resumeController));
// GET only selected candidates


router.post('/', resumeUpload.single('resume'), resumeController.createResume.bind(resumeController));
router.put('/:id', resumeUpload.single('resume'), resumeController.updateResume.bind(resumeController));
router.delete('/:id', resumeController.deleteResume.bind(resumeController));

module.exports = router;
