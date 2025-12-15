// controllers/clientController.js
import ClientModel from '../models/ClientModel.js';
import GroupModel from '../models/GroupModel.js';
import asyncHandler from 'express-async-handler';

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
    throw new Error('All fields are required, including client photo');
  }

  // Normalize identifiers
  const nationalIdClean = nationalId.trim();
  const phoneClean = phone.trim();
  const kinPhoneClean = nextOfKinPhone.trim();

  // Ensure client does not already exist
  const clientExists = await ClientModel.findOne({ nationalId: nationalIdClean });
  if (clientExists) {
    res.status(409);
    throw new Error('Client with this National ID already exists');
  }

  // Verify group exists
  const group = await GroupModel.findById(groupId);
  if (!group) {
    res.status(400);
    throw new Error('Group not found');
  }

  // Prevent duplicate membership (defensive)
  if (group.members && group.members.length > 0) {
    const alreadyMember = await ClientModel.exists({
      _id: { $in: group.members },
      nationalId: nationalIdClean,
    });
    if (alreadyMember) {
      res.status(409);
      throw new Error('Client already exists in this group');
    }
  }

  // Store relative photo path (served statically)
  const photoUrl = `/uploads/${req.file.filename}`;

  const client = await ClientModel.create({
    name: name.trim(),
    nationalId: nationalIdClean,
    phone: phoneClean,
    photoUrl,
    residence,
    businessType: businessType.trim(),
    businessLocation: businessLocation.trim(),
    nextOfKin: {
      name: nextOfKinName.trim(),
      phone: kinPhoneClean,
      relationship: nextOfKinRelationship.trim(),
    },
    groupId,
    savings_balance_cents: 0, // funded later via M-Pesa / cash
    registrationFeePaid: false,
    initialSavingsPaid: false,
    createdBy: req.user._id,
  });

  // Attach client to group
  group.members.push(client._id);
  await group.save();

  res.status(201).json({
    message: 'Client onboarded successfully',
    client,
  });
});

// @desc    Get all clients
// @route   GET /api/clients
// @access  Private
const getClients = asyncHandler(async (req, res) => {
  const clients = await ClientModel.find({})
    .populate('groupId', 'name meetingDay meetingTime');

  res.json(clients);
});

export { onboardClient, getClients };
