// middleware/authMiddleware.js
import jwt from 'jsonwebtoken';
import userModel from '../models/userModel.js';
import asyncHandler from 'express-async-handler';

/**
 * Role groups (single source of truth)
 * Maker-Checker Model:
 * - Loan Officer (Maker): Initiates groups, clients, loans
 * - Admin (Checker): Approves groups, clients, loans, disbursements
 * - Super Admin (System): User/branch management only
 */
export const ROLE_GROUPS = {
  SUPER_ADMIN: ['super_admin'],
  ADMINS: ['admin'],
  LOAN_OFFICERS: ['loan_officer'],
  MAKERS: ['loan_officer'],
  CHECKERS: ['admin'],
  ALL_INTERNAL: ['super_admin', 'admin', 'loan_officer'],
};

// Protect routes (attach user context)
const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer ')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  // If no Authorization header, try to read token from cookies.
  // We don't require `cookie-parser`; parse `req.headers.cookie` manually.
  if (!token && req.headers && req.headers.cookie) {
    const raw = req.headers.cookie.split(';').map(c => c.trim());
    for (const part of raw) {
      if (part.startsWith('token=')) {
        token = part.slice('token='.length);
        break;
      }
      // also support cookie named 'jwt'
      if (part.startsWith('jwt=')) {
        token = part.slice('jwt='.length);
        break;
      }
    }
  }

  if (!token) {
    res.status(401);
    throw new Error('Not authorized, no token');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await userModel
      .findById(decoded.sub)
      .select('-password');

    if (!user) {
      res.status(401);
      throw new Error('Not authorized, user not found');
    }

    // Attach canonical user context
    req.user = user;
    req.userRole = user.role;
    req.userRegions = decoded.regions || [];

    next();
  } catch (error) {
    // Handle specific JWT errors
    if (error.name === 'TokenExpiredError') {
      res.status(401);
      const err = new Error('Token expired, please login again');
      err.code = 'TOKEN_EXPIRED';
      throw err;
    } else if (error.name === 'JsonWebTokenError') {
      res.status(401);
      const err = new Error('Invalid token, please login again');
      err.code = 'TOKEN_INVALID';
      throw err;
    } else if (error.name === 'NotBeforeError') {
      res.status(401);
      const err = new Error('Token not active yet');
      err.code = 'TOKEN_NOT_ACTIVE';
      throw err;
    } else {
      res.status(401);
      throw new Error('Not authorized, token invalid');
    }
  }
});

// Restrict by role
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401);
      throw new Error('Not authorized');
    }

    if (!roles.includes(req.user.role)) {
      res.status(403);
      throw new Error('Access denied');
    }

    next();
  };
};

// Enforce branch-level data isolation for loan officers
const enforceBranchAccess = async (req, res, next) => {
  if (!req.user) {
    res.status(401);
    throw new Error('Not authorized');
  }

  // Super admins can access all branches
  if (req.user.role === 'super_admin') {
    return next();
  }

  // Loan officers and admins must have branchId
  if (!req.user.branchId) {
    res.status(403);
    throw new Error('User not assigned to any branch');
  }

  // Attach branchId to request for filtering
  req.userBranchId = req.user.branchId;
  next();
};

export { protect, restrictTo, enforceBranchAccess };
