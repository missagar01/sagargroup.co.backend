const resumeService = require('../services/resumeService');

class ResumeController {
  getResumeUrl(req) {
    if (!req.file) {
      return null;
    }
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return `${baseUrl}/uploads/resumes/${req.file.filename}`;
  }

  normalizeBody(body) {
    if (body && typeof body === 'object') {
      return body;
    }
    if (typeof body === 'string') {
      try {
        return JSON.parse(body);
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  async listResumes(req, res, next) {
    try {
      const resumes = await resumeService.getAllResumes();
      res.status(200).json({
        success: true,
        data: resumes,
        count: resumes.length
      });
    } catch (error) {
      next(error);
    }
  }

  async getResume(req, res, next) {
    try {
      const { id } = req.params;
      const resume = await resumeService.getResumeById(id);
      res.status(200).json({
        success: true,
        data: resume
      });
    } catch (error) {
      if (error.message === 'Resume not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  async createResume(req, res, next) {
    try {
      // Handle FormData - multer puts fields in req.body
      let payload = {};

      // If req.body is already an object (from multer), use it directly
      if (req.body && typeof req.body === 'object') {
        payload = { ...req.body };
      } else {
        // Try to parse as JSON if it's a string
        payload = this.normalizeBody(req.body) || {};
      }

      // Convert empty strings to null for optional fields
      Object.keys(payload).forEach(key => {
        if (payload[key] === '' || payload[key] === undefined) {
          payload[key] = null;
        }
      });

      const resumeUrl = this.getResumeUrl(req);
      if (resumeUrl) {
        payload.resume = resumeUrl;
      }

      const resume = await resumeService.createResume(payload);
      res.status(201).json({
        success: true,
        message: 'Resume created successfully',
        data: resume
      });
    } catch (error) {
      console.error('❌ CONTROLLER ERROR in createResume:', error.message);
      next(error);
    }
  }

  async updateResume(req, res, next) {
    try {
      const { id } = req.params;
      const payload = this.normalizeBody(req.body) || {};
      const resumeUrl = this.getResumeUrl(req);
      if (resumeUrl) {
        payload.resume = resumeUrl;
      }
      const resume = await resumeService.updateResume(id, payload);
      res.status(200).json({
        success: true,
        message: 'Resume updated successfully',
        data: resume
      });
    } catch (error) {
      if (error.message === 'Resume not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  async deleteResume(req, res, next) {
    try {
      const { id } = req.params;
      await resumeService.deleteResume(id);
      res.status(200).json({
        success: true,
        message: 'Resume deleted successfully'
      });
    } catch (error) {
      if (error.message === 'Resume not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }

  async listSelectedResumes(req, res, next) {
    try {
      const resumes = await resumeService.getSelectedResumes();
      res.status(200).json({
        success: true,
        data: resumes,
        count: resumes.length
      });
    } catch (error) {
      next(error);
    }
  }

}

module.exports = new ResumeController();
