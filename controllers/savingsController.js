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

  if (!['initiator_admin', 'super_admin'].includes(req.user.role)) {
    res.status(403);
    throw new Error('Not allowed');
  }

  const cents = typeof amountCents !== 'undefined'
    ? Math.round(Number(amountCents))
    : (typeof amountKES !== 'undefined' ? Math.round(Number(amountKES) * 100) : undefined);

  if (typeof cents === 'undefined' || !Number.isFinite(cents) || cents <= 0) {
    res.status(400);
    throw new Error('Invalid amount');
  }

  // Update client savings
  client.savings_balance_cents = (client.savings_balance_cents || 0) + cents;
  if (!client.initialSavingsPaid) client.initialSavingsPaid = true;
  await client.save();

  // Record a transaction for audit
  try {
    await Transaction.create({
      type: 'manual',
      direction: 'IN',
      amount_cents: cents,
      status: 'success',
      clientId: client._id,
      createdBy: req.user._id,
      rawCallback: { notes: notes || null, source: 'savings' },
    });
  } catch (e) {
    // non-fatal
    console.error('Failed to create savings transaction:', e.message || e);
  }

  res.status(201).json({ message: 'Savings recorded', client });
});

export { createSavings };
