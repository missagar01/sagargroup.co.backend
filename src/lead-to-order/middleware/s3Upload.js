// s3Upload.js
const multer = require("multer");
const { S3Client } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const dotenv = require("dotenv");

dotenv.config({ quiet: true });

// 1️⃣ Initialize S3 client (AWS SDK v3)
const s3 = new S3Client({
  region: process.env.AWS_REGION, // e.g. "us-east-1"
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// 2️⃣ Multer setup (store in memory)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// 3️⃣ Upload function to S3
const uploadToS3 = async (file) => {
  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: `uploads/${Date.now()}_${file.originalname}`,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  const parallelUploads3 = new Upload({
    client: s3,
    params,
  });

  await parallelUploads3.done();
  return `https://${process.env.AWS_BUCKET_NAME}.s3.amazonaws.com/${params.Key}`;
};

module.exports = {
  upload,
  uploadToS3
};
