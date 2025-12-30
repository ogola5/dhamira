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
  restrictTo('super_admin', 'initiator_admin', 'approver_admin', 'loan_officer'),
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
  restrictTo('super_admin', 'initiator_admin', 'approver_admin', 'loan_officer'),
  getClients
);

/**
 * ============================
 * CREATE CLIENT
 * ============================
 */
router.post(
  '/',
  protect,
  restrictTo('loan_officer', 'super_admin'),
  upload.single('photo'),
  onboardClient
);

/**
 * ADD SAVINGS (admin action)
 */
router.post(
  '/:id/savings',
  protect,
  restrictTo('initiator_admin', 'super_admin'),
  addSavings
);

/**
 * VIEW CLIENT HISTORY (repayments grouped by loan)
 */
router.get(
  '/:id/history',
  protect,
  restrictTo('super_admin', 'initiator_admin', 'approver_admin', 'loan_officer'),
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
  restrictTo('super_admin', 'initiator_admin', 'approver_admin', 'loan_officer'),
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
  restrictTo('super_admin', 'initiator_admin', 'approver_admin', 'loan_officer'),
  updateClient
);

/**
 * ============================
 * APPROVE CLIENT
 * ============================
 */
router.put(
  '/:id/approve',
  protect,
  restrictTo('initiator_admin', 'approver_admin', 'super_admin'),
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
  restrictTo('initiator_admin', 'approver_admin', 'super_admin'),
  deactivateClient
);

export default router;
