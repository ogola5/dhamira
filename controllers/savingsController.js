import asyncHandler from 'express-async-handler';
import Client from '../models/ClientModel.js';
import Transaction from '../models/TransactionModel.js';

// POST /api/savings
const createSavings = asyncHandler(async (req, res) => {
  const { clientId, amountKES, amountCents, notes } = req.body;

  if (!clientId) {
    res.status(400);
    throw new Error('clientId is required');
  }

  const client = await Client.findById(clientId);
  if (!client) {
    res.status(404);
    throw new Error('Client not found');
  }

  // Authorization: admins can manage any client, loan officers only their own
  if (!['approver_admin', 'super_admin', 'loan_officer'].includes(req.user.role)) {
    res.status(403);
    throw new Error('Not allowed');
  }

  // Loan officers can only manage savings for their assigned clients
  if (req.user.role === 'loan_officer' && String(client.loanOfficer) !== String(req.user._id)) {
    res.status(403);
    throw new Error('Access denied: not your client');
  }

  const cents = typeof amountCents !== 'undefined'
    ? Math.round(Number(amountCents))
    : (typeof amountKES !== 'undefined' ? Math.round(Number(amountKES) * 100) : undefined);

  if (typeof cents === 'undefined' || !Number.isFinite(cents) || cents === 0) {
    res.status(400);
    throw new Error('Invalid amount');
  }

  // Prevent negative balance (no overdraft) when deduction
  const newBalance = (client.savings_balance_cents || 0) + cents;
  if (newBalance < 0) {
    res.status(400);
    throw new Error('Insufficient savings for this deduction');
  }

  // Update client atomically to avoid running full-document validators
  const update = { savings_balance_cents: newBalance };
  if (!client.initialSavingsPaid && cents > 0) update.initialSavingsPaid = true;

  const updatedClient = await Client.findByIdAndUpdate(
    clientId,
    { $set: update },
    { new: true }
  );

  // Record a transaction for audit
  try {
    await Transaction.create({
      type: 'manual',
      direction: cents > 0 ? 'IN' : 'OUT',
      amount_cents: Math.abs(cents),
      status: 'success',
      initiatedBy: req.user._id,
      rawCallback: { notes: notes || null, source: 'savings', clientId: String(client._id) },
    });
  } catch (e) {
    // non-fatal
    console.error('Failed to create savings transaction:', e.message || e);
  }

  res.status(201).json({ message: 'Savings recorded', client: updatedClient || client });
});

const listSavings = asyncHandler(async (req, res) => {
  // Authorization: admins see all, loan officers see only their clients
  if (!['approver_admin', 'super_admin', 'loan_officer'].includes(req.user.role)) {
    res.status(403);
    throw new Error('Not allowed');
  }

  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 100, 1000);
  const skip = (page - 1) * limit;

  const q = { 'rawCallback.source': 'savings' };

  // If loan officer, only show savings for their assigned clients
  if (req.user.role === 'loan_officer') {
    const assignedClients = await Client.find({ loanOfficer: req.user._id }).select('_id');
    const clientIds = assignedClients.map(c => String(c._id));
    q['rawCallback.clientId'] = { $in: clientIds };
  }

  const [total, txs] = await Promise.all([
    Transaction.countDocuments(q),
    Transaction.find(q)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
  ]);

  const data = txs.map((t) => ({
    clientId: t.rawCallback?.clientId || null,
    amountKES: (t.direction === 'IN' ? 1 : -1) * (t.amount_cents / 100),
    description: t.rawCallback?.notes || null,
    createdAt: t.createdAt,
    transactionId: t._id,
  }));

  res.json({ page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), data });
});

export { createSavings, listSavings };
