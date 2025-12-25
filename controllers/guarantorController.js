import asyncHandler from 'express-async-handler';

import Guarantor from '../models/GuarantorModel.js';
import Loan from '../models/LoanModel.js';
import Client from '../models/ClientModel.js';

import LoanModel from '../models/LoanModel.js'; // same as Loan, kept explicit to avoid confusion

async function hasRepaidFafa(clientId) {
  return LoanModel.exists({ clientId, product: 'fafa', status: 'repaid' });
}

// POST /api/guarantors
// loan_officer or initiator_admin (per your flow)
const addGuarantor = asyncHandler(async (req, res) => {
  const { loanId, guarantorClientNationalId, relationship, idCopyUrl, photoUrl } = req.body;

  if (!loanId || !guarantorClientNationalId || !relationship || !idCopyUrl || !photoUrl) {
    res.status(400);
    throw new Error('loanId, guarantorClientNationalId, relationship, idCopyUrl, photoUrl are required');
  }

  const loan = await Loan.findById(loanId);
  if (!loan) {
    res.status(404);
    throw new Error('Loan not found');
  }
  if (loan.status !== 'initiated') {
    res.status(400);
    throw new Error('Guarantors can only be added to initiated loans');
  }

  const guarantorClient = await Client.findOne({ nationalId: String(guarantorClientNationalId).trim() });
  if (!guarantorClient) {
    res.status(404);
    throw new Error('Guarantor client not found in system');
  }

  // Prevent applicant guaranteeing own loan
  if (String(guarantorClient._id) === String(loan.clientId)) {
    res.status(400);
    throw new Error('Applicant cannot be guarantor for own loan');
  }

  // Eligibility snapshot
  const repaidFafa = await hasRepaidFafa(guarantorClient._id);

  const guarantor = await Guarantor.create({
    loanId,
    clientId: guarantorClient._id,
    relationship: String(relationship).trim(),
    external: true,
    idCopyUrl: String(idCopyUrl).trim(),
    photoUrl: String(photoUrl).trim(),
    eligibility: {
      hasRepaidFafaBefore: Boolean(repaidFafa),
      checkedAt: new Date(),
      notes: repaidFafa ? 'Eligible: repaid FAFA previously' : 'Ineligible: no repaid FAFA history',
    },
    accepted: false,
  });

  res.status(201).json({ message: 'Guarantor added', guarantor });
});

// PUT /api/guarantors/:id/accept
// loan_officer OR approver_admin OR super_admin (depending on your UX)
// Acceptance means guarantor has agreed (in reality you’d do OTP/USSD; MVP = internal)
const acceptGuarantor = asyncHandler(async (req, res) => {
  const guarantor = await Guarantor.findById(req.params.id);
  if (!guarantor) {
    res.status(404);
    throw new Error('Guarantor not found');
  }

  if (guarantor.accepted) {
    res.status(400);
    throw new Error('Guarantor already accepted');
  }

  guarantor.accepted = true;
  guarantor.acceptedAt = new Date();
  guarantor.acceptedBy = req.user._id;

  await guarantor.save();

  res.json({ message: 'Guarantor accepted', guarantor });
});

export { addGuarantor, acceptGuarantor };
