// routes/clientRoutes.js
import express from 'express';
import { onboardClient, getClients } from '../controllers/clientController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';
import multer from 'multer';

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({ storage });
const router = express.Router();

router.get(
  '/',
  protect,
  restrictTo('super_admin', 'initiator_admin', 'approver_admin', 'loan_officer'),
  getClients
);

router.post(
  '/onboard',
  protect,
  restrictTo('super_admin', 'initiator_admin', 'approver_admin', 'loan_officer'),
  upload.single('photo'),
  onboardClient
);

export default router;
