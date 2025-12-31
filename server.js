// server.js
import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import connectDB from './config/db.js';
import { startCrons } from './cron.js';
import cors from 'cors';

startCrons();


// -------------------------
// Route Imports
// -------------------------
import authRoutes from './routes/authRoutes.js';
import groupRoutes from './routes/groupRoutes.js';
import clientRoutes from './routes/clientRoutes.js';
import loanRoutes from './routes/loanRoutes.js';
import repaymentRoutes from './routes/repaymentRoutes.js';
import guarantorRoutes from './routes/guarantorRoutes.js';
import creditAssessmentRoutes from './routes/creditAssessmentRoutes.js';
import analysisRoutes from './routes/analysisRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import logsRoutes from './routes/logsRoutes.js';

// 🔥 M-PESA ROUTES (CRITICAL)
import mpesaRoutes from './routes/mpesaRoutes.js';
import savingsRoutes from './routes/savingsRoutes.js';

dotenv.config();
connectDB();

const app = express();

// -------------------------
// Core Middleware
// -------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enable CORS for frontend origin (adjust as needed)
// Supports a single origin or a comma-separated list in `CORS_ORIGIN`.
const rawCors = process.env.CORS_ORIGIN || 'http://localhost:3000';
const allowedOrigins = rawCors.split(',').map((s) => s.trim()).filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., server-to-server, Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('CORS policy: origin not allowed'));
    },
    credentials: true,
  })
);

// -------------------------
// Static files (uploads)
// -------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// -------------------------
// API Routes
// -------------------------
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/repayments', repaymentRoutes);

app.use('/api/guarantors', guarantorRoutes);
app.use('/api/credit-assessments', creditAssessmentRoutes);

// 🔥 SAFARICOM CALLBACKS (NO AUTH)
app.use('/api/mpesa', mpesaRoutes);
app.use('/api/savings', savingsRoutes);

// Optional / analytics
app.use('/api/analysis', analysisRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/logs', logsRoutes);

// -------------------------
// Health Check
// -------------------------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Microfinance Core API',
    timestamp: new Date().toISOString(),
  });
});

// -------------------------
// Global Error Handler
// -------------------------
app.use((err, req, res, next) => {
  console.error(err);
  const statusCode =
    res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

  res.status(statusCode).json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });
});

// -------------------------
// Server Start
// -------------------------
const PORT = process.env.PORT || 5011;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
