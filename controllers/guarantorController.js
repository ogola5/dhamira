import GuarantorModel from '../models/GuarantorModel.js';
import LoanModel from '../models/LoanModel.js';
import asyncHandler from 'express-async-handler';

// @desc    Add guarantor to a loan
// @route   POST /api/guarantors
// @access  Private (loan_officer)
const addGuarantor = asyncHandler(async (req, res) => {
  const { loanId, clientId, relationship, idCopyUrl, photoUrl } = req.body;

  if (!loanId || !clientId || !relationship || !idCopyUrl || !photoUrl) {
    res.status(400);
    throw new Error('All guarantor fields are required');
  }

  const loan = await LoanModel.findById(loanId);
  if (!loan || loan.status !== 'initiated') {
    res.status(400);
    throw new Error('Guarantors can only be added to initiated loans');
  }

  const guarantor = await GuarantorModel.create({
    loanId,
    clientId,
    relationship,
    external: true,
    idCopyUrl,
    photoUrl,
    accepted: false,
  });

  res.status(201).json({ message: 'Guarantor added', guarantor });
});

// @desc    Accept guarantor responsibility
// @route   PUT /api/guarantors/:id/accept
// @access  Private (loan_officer or admin)
const acceptGuarantor = asyncHandler(async (req, res) => {
  const guarantor = await GuarantorModel.findById(req.params.id);
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
  await guarantor.save();

  res.json({ message: 'Guarantor accepted', guarantor });
});

export { addGuarantor, acceptGuarantor };
