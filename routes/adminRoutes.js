import express from 'express';
import {
  createAdmin,
  getAdmins,
  getAdminById,
  updateAdmin,
  deactivateAdmin,
} from '../controllers/adminController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication and super_admin role
router.use(protect);
router.use(restrictTo('super_admin'));

// POST /api/admins - Create new admin
router.post('/', createAdmin);

// GET /api/admins - Get all admins
router.get('/', getAdmins);

// GET /api/admins/:id - Get single admin
router.get('/:id', getAdminById);

// PUT /api/admins/:id - Update admin
router.put('/:id', updateAdmin);

// DELETE /api/admins/:id - Deactivate admin
router.delete('/:id', deactivateAdmin);

export default router;
