const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists for employee images
const uploadsDir = path.join(process.cwd(), 'uploads', 'employees');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const fieldName = file.fieldname === 'profile_img' ? 'profile' : 'document';
    cb(null, `employee-${fieldName}-${uniqueSuffix}${ext}`);
  }
});

// File filter - allow profile images and document uploads (images + pdf)
const fileFilter = (req, file, cb) => {
  const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mimetype = (file.mimetype || '').toLowerCase();

  const isImage = allowedImageTypes.test(ext) && allowedImageTypes.test(mimetype);
  if (file.fieldname === 'document_img') {
    const isPdf = ext === '.pdf' || mimetype === 'application/pdf';
    if (isImage || isPdf) {
      return cb(null, true);
    }
    return cb(new Error('Document uploads must be JPEG/PNG/WebP/GIF or PDF files.'));
  }

  if (file.fieldname === 'profile_img') {
    if (isImage) {
      return cb(null, true);
    }
    return cb(new Error('Profile photo must be a JPEG/PNG/WebP/GIF image.'));
  }

  cb(new Error('Unsupported file upload field.'));
};

// Multer configuration for employee images
const uploadEmployeeImages = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: fileFilter
}).fields([
  { name: 'profile_img', maxCount: 1 },
  { name: 'document_img', maxCount: 10 }
]);

// Determine base URL from explicit value or environment defaults
const resolveBaseUrl = (overrideUrl) => {
  const fromEnv = process.env.BASE_URL || process.env.API_BASE_URL;
  const resolved = fromEnv || overrideUrl;

  if (resolved && resolved.trim()) {
    return resolved.replace(/\/+$/, '');
  }

  const fallbackPort = process.env.PORT || 3004;
  const fallback = process.env.NODE_ENV === 'production' ? '' : `http://localhost:${fallbackPort}`;
  return fallback.replace(/\/+$/, '');
};

// Helper function to generate image URL
const getEmployeeImageUrl = (filename, baseUrlOverride) => {
  if (!filename) return null;
  const baseUrl = resolveBaseUrl(baseUrlOverride);
  if (!baseUrl) {
    return `/uploads/employees/${filename}`;
  }
  return `${baseUrl}/uploads/employees/${filename}`;
};

// Helper function to extract filename from URL
const getFilenameFromUrl = (url) => {
  if (!url) return null;
  const parts = url.split('/');
  return parts[parts.length - 1];
};

module.exports = {
  uploadEmployeeImages,
  getEmployeeImageUrl,
  getFilenameFromUrl
};
