// routes/clientRoutes.js
import express from 'express';
import { onboardClient, getClients } from '../controllers/clientController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';
import multer from 'multer';

// Multer setup for photo upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Create 'uploads' folder in root
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});
const upload = multer({ storage });

const router = express.Router();

router.get('/', protect, getClients);
router.post(
  '/onboard',
  protect,
  restrictTo('super_admin', 'initiator_admin', 'approver_admin', 'loan_officer'),
  upload.single('photo'), // 'photo' is the field name for file upload
  onboardClient
);

export default router;