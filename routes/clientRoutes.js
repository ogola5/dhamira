import express from 'express';
import {
  onboardClient,
  approveClient,
  getClients,
  getClientById,
  updateClient,
  deactivateClient,
  searchClients,
  addSavings,
  getClientHistory,
} from '../controllers/clientController.js';

import { protect, restrictTo } from '../middleware/authMiddleware.js';
import multer from 'multer';

const upload = multer({ dest: 'uploads/' });
const router = express.Router();

/**
 * ============================
 * SEARCH
 * ============================
 */
router.get(
  '/search',
  protect,
  restrictTo('super_admin', 'admin', 'loan_officer'),
  searchClients
);

/**
 * ============================
 * LIST CLIENTS
 * ============================
 */
router.get(
  '/',
  protect,
  restrictTo('super_admin', 'admin', 'loan_officer'),
  getClients
);

/**
 * ============================
 * CREATE CLIENT (LOAN OFFICER ONLY - MAKER)
 * ============================
 */
router.post(
  '/',
  protect,
  restrictTo('loan_officer'),
  upload.single('photo'),
  onboardClient
);

/**
 * ADD SAVINGS (admin action only)
 */
router.post(
  '/:id/savings',
  protect,
  restrictTo('admin'),
  addSavings
);

/**
 * VIEW CLIENT HISTORY (repayments grouped by loan)
 */
router.get(
  '/:id/history',
  protect,
  restrictTo('super_admin', 'admin', 'loan_officer'),
  getClientHistory
);

/**
 * ============================
 * GET SINGLE CLIENT
 * ============================
 */
router.get(
  '/:id',
  protect,
  restrictTo('super_admin', 'admin', 'loan_officer'),
  getClientById
);

/**
 * ============================
 * UPDATE CLIENT
 * ============================
 */
router.put(
  '/:id',
  protect,
  restrictTo('super_admin', 'admin', 'loan_officer'),
  updateClient
);

/**
 * ============================
 * APPROVE CLIENT (ADMIN ONLY - CHECKER)
 * ============================
 */
router.put(
  '/:id/approve',
  protect,
  restrictTo('admin'),
  approveClient
);

/**
 * ============================
 * DEACTIVATE CLIENT
 * ============================
 */
router.put(
  '/:id/deactivate',
  protect,
  restrictTo('admin', 'super_admin'),
  deactivateClient
);

export default router;
