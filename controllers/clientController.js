// controllers/clientController.js
import ClientModel from '../models/ClientModel.js';
import GroupModel from '../models/GroupModel.js';
import asyncHandler from 'express-async-handler';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// @desc    Onboard a new client
// @route   POST /api/clients/onboard
// @access  Private (admins or loan officers)
const onboardClient = asyncHandler(async (req, res) => {
  const {
    name,
    nationalId,
    phone,
    residence,
    businessType,
    businessLocation,
    nextOfKinName,
    nextOfKinPhone,
    nextOfKinRelationship,
    groupId,
  } = req.body;

  if (
    !name ||
    !nationalId ||
    !phone ||
    !residence ||
    !businessType ||
    !businessLocation ||
    !nextOfKinName ||
    !nextOfKinPhone ||
    !nextOfKinRelationship ||
    !groupId ||
    !req.file
  ) {
    res.status(400);
    throw new Error('Please provide all required fields including photo');
  }

  // Check if client exists
  const clientExists = await ClientModel.findOne({ nationalId });
  if (clientExists) {
    res.status(400);
    throw new Error('Client with this national ID already exists');
  }

  // Verify group exists
  const group = await GroupModel.findById(groupId);
  if (!group) {
    res.status(400);
    throw new Error('Group not found');
  }

  // Photo path (assuming multer saves to uploads folder)
  const photoUrl = `/uploads/${req.file.filename}`;

  const client = await ClientModel.create({
    name,
    nationalId,
    phone,
    photoUrl,
    residence,
    businessType,
    businessLocation,
    nextOfKin: {
      name: nextOfKinName,
      phone: nextOfKinPhone,
      relationship: nextOfKinRelationship,
    },
    groupId,
    createdBy: req.user._id,
    // Fees/savings: For now, set to false; update after M-Pesa payment
  });

  // Add client to group members
  group.members.push(client._id);
  await group.save();

  res.status(201).json(client);
});

// @desc    Get all clients
// @route   GET /api/clients
// @access  Private
const getClients = asyncHandler(async (req, res) => {
  const clients = await ClientModel.find({}).populate('groupId', 'name');
  res.json(clients);
});

export { onboardClient, getClients };