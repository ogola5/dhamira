// routes/clientRoutes.js
import express from 'express';
import {
  onboardClient,
  approveClient,
  getClients,
} from '../controllers/clientController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';
import multer from 'multer';

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({ storage });

const router = express.Router();

/**
 * LIST CLIENTS
 * - loan_officer: only their portfolio
 * - admins: all
 */
router.get(
  '/',
  protect,
  restrictTo(
    'super_admin',
    'initiator_admin',
    'approver_admin',
    'loan_officer'
  ),
  getClients
);

/**
 * ONBOARD CLIENT
 * - ONLY loan officer
 * - status = pending
 */
router.post(
  '/',
  protect,
  restrictTo('loan_officer'),
  upload.single('photo'),
  onboardClient
);

/**
 * APPROVE CLIENT
 * - admins + super admin
 */
router.put(
  '/:id/approve',
  protect,
  restrictTo('initiator_admin', 'approver_admin', 'super_admin'),
  approveClient
);

export default router;
