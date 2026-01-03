import asyncHandler from 'express-async-handler';
import userModel from '../models/userModel.js';
import LoanOfficer from '../models/LoanOfficerModel.js';
import Loan from '../models/LoanModel.js';
import Group from '../models/GroupModel.js';
import Client from '../models/ClientModel.js';

// POST /api/loan-officers
// Body: { name, phone, email, nationalId }
// Access: super_admin only
const createLoanOfficer = asyncHandler(async (req, res) => {
  const { name, phone, email, nationalId } = req.body;

  if (!name || !phone || !email || !nationalId) {
    res.status(400);
    throw new Error('name, phone, email and nationalId are required');
  }

  // Prevent duplicates by nationalId or email/username
  const exists = await userModel.findOne({ $or: [{ nationalId: String(nationalId).trim() }, { username: String(nationalId).trim() }, { phone: String(phone).trim() }, { username: String(email).trim() }, { nationalId: String(email).trim() }] });
  if (exists) {
    res.status(409);
    throw new Error('User with provided identifier already exists');
  }

  // Create user account with default password
  const username = String(nationalId).trim();
  const defaultPassword = '12345678';

  const user = await userModel.create({
    username,
    password: defaultPassword,
    nationalId: String(nationalId).trim(),
    phone: String(phone).trim(),
    role: 'loan_officer',
    regions: [],
  });

  const profile = await LoanOfficer.create({
    userId: user._id,
    name: String(name).trim(),
    phone: String(phone).trim(),
    email: String(email).trim(),
    nationalId: String(nationalId).trim(),
    createdBy: req.user._id,
  });

  res.status(201).json({ message: 'Loan officer created', user: { _id: user._id, username: user.username, role: user.role }, profile });
});

// GET /api/loan-officers
// Access: super_admin only (list all officers)
const listLoanOfficers = asyncHandler(async (req, res) => {
  const officers = await LoanOfficer.find()
    .sort({ createdAt: -1 })
    .populate('userId', 'username role');

  res.json({ data: officers });
});

/**
 * ============================
 * LOAN OFFICER PERFORMANCE DASHBOARD
 * ============================
 * Returns 4 KPIs:
 * 1. Loans Initiated (pending assessment/approval)
 * 2. Loans Disbursed (total capital sent to groups)
 * 3. Loans in Arrears (missed payments)
 * 4. Loans Recovered (principal + interest paid back)
 * 
 * Access: loan_officer (own dashboard)
 */
const getPerformanceDashboard = asyncHandler(async (req, res) => {
  const loanOfficerId = req.user._id;

  // Get all groups managed by this loan officer
  const groups = await Group.find({ loanOfficer: loanOfficerId });
  const groupIds = groups.map(g => g._id);

  // Get all clients in these groups
  const clients = await Client.find({ groupId: { $in: groupIds } });
  const clientIds = clients.map(c => c._id);

  // Build loan filter: either initiated by this officer OR belongs to their clients
  const loanFilter = {
    $or: [
      { initiatedBy: loanOfficerId },
      { clientId: { $in: clientIds } }
    ]
  };

  // 1. Loans Initiated (pending assessment/approval)
  const loansInitiated = await Loan.countDocuments({
    ...loanFilter,
    status: { $in: ['initiated', 'approved', 'disbursement_pending'] }
  });

  // 2. Loans Disbursed (total capital sent)
  const disbursedLoans = await Loan.find({
    ...loanFilter,
    status: { $in: ['disbursed', 'repaid'] }
  });

  const totalDisbursed = disbursedLoans.reduce((sum, loan) => {
    return sum + (loan.principal_cents || 0);
  }, 0);

  // 3. Loans in Arrears (at-risk portfolio)
  const now = new Date();
  const loansInArrears = await Loan.find({
    ...loanFilter,
    status: 'disbursed',
    dueDate: { $lt: now },
    outstanding_cents: { $gt: 0 }
  }).populate('clientId', 'name nationalId phone')
    .select('clientId principal_cents outstanding_cents dueDate');

  // 4. Loans Recovered (principal + interest paid back)
  const recoveredLoans = await Loan.find({
    ...loanFilter,
    status: { $in: ['disbursed', 'repaid'] }
  });

  const totalRecovered = recoveredLoans.reduce((sum, loan) => {
    return sum + ((loan.total_paid_cents || 0));
  }, 0);

  const totalRepaidLoans = await Loan.countDocuments({
    ...loanFilter,
    status: 'repaid'
  });

  // Portfolio summary
  const portfolioSummary = {
    totalGroups: groups.length,
    activeGroups: groups.filter(g => g.status === 'active').length,
    totalClients: clients.length,
    activeClients: clients.filter(c => c.status === 'active').length,
  };

  res.json({
    message: 'Performance dashboard retrieved',
    kpis: {
      loansInitiated: {
        count: loansInitiated,
        description: 'Applications in pipeline (pending assessment/approval)'
      },
      loansDisbursed: {
        count: disbursedLoans.length,
        totalAmountCents: totalDisbursed,
        totalAmountKES: (totalDisbursed / 100).toFixed(2),
        description: 'Total capital successfully sent to groups'
      },
      loansInArrears: {
        count: loansInArrears.length,
        loans: loansInArrears,
        description: 'Clients who have missed payments (at-risk portfolio)'
      },
      loansRecovered: {
        totalPaidCents: totalRecovered,
        totalPaidKES: (totalRecovered / 100).toFixed(2),
        repaidLoansCount: totalRepaidLoans,
        description: 'Total principal and interest successfully paid back'
      }
    },
    portfolio: portfolioSummary
  });
});

export { createLoanOfficer, listLoanOfficers, getPerformanceDashboard };
