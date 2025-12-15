// controllers/analysisController.js (For AI endpoints)
import { analyzeDefaultRisk, analyzeSentiment } from '../services/geminiService.js';
import asyncHandler from 'express-async-handler';

// @desc    Analyze loan for default risk
// @route   GET /api/analysis/loan/:loanId/default-risk
// @access  Private (admins)
const getDefaultRisk = asyncHandler(async (req, res) => {
  const analysis = await analyzeDefaultRisk(req.params.loanId);
  res.json(analysis);
});

// @desc    Analyze repayment notes for sentiment
// @route   POST /api/analysis/sentiment
// @access  Private (admins)
const getSentimentAnalysis = asyncHandler(async (req, res) => {
  const { notes } = req.body;
  if (!notes) {
    res.status(400);
    throw new Error('Notes are required for sentiment analysis');
  }
  const analysis = await analyzeSentiment(notes);
  res.json(analysis);
});

export { getDefaultRisk, getSentimentAnalysis };