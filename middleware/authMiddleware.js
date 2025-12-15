// middleware/authMiddleware.js
import jwt from 'jsonwebtoken';
import userModel from '../models/userModel.js';
import asyncHandler from 'express-async-handler';

// Protect routes (all management + officers)
const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer ')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    res.status(401);
    throw new Error('Not authorized, no token');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // IMPORTANT: use `sub`, not `id`
    const user = await userModel
      .findById(decoded.sub)
      .select('-password');

    if (!user) {
      res.status(401);
      throw new Error('Not authorized, user not found');
    }

    // Attach user context
    req.user = user;
    req.userRole = decoded.role;      // optional convenience
    req.userRegions = decoded.regions || [];

    next();
  } catch (err) {
    res.status(401);
    throw new Error('Not authorized, token invalid');
  }
});

// Restrict by role (management + officers)
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401);
      throw new Error('Not authorized');
    }

    if (!roles.includes(req.user.role)) {
      res.status(403);
      throw new Error('Access denied: insufficient permissions');
    }

    next();
  };
};

export { protect, restrictTo };
