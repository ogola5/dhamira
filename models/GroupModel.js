// models/GroupModel.js
import mongoose from 'mongoose';

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Group name is required'],
    unique: true,
    trim: true,
  },
  meetingDay: {
    type: String,
    required: [true, 'Meeting day is required'], // e.g., 'Wednesday'
  },
  meetingTime: {
    type: String,
    required: [true, 'Meeting time is required'], // e.g., '14:00'
  },
  signatories: [{
    role: {
      type: String,
      enum: ['chairperson', 'secretary', 'treasurer'],
      required: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client', // Ref to ClientModel
      required: true,
    },
  }],
  loanOfficer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Ref to UserModel with role 'loan_officer'
    required: [true, 'Loan officer is required for the group'],
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Validate exactly one of each signatory role (only if signatories are provided)
groupSchema.pre('save', function (next) {
  if (this.signatories && this.signatories.length > 0) {
    const roles = this.signatories.map(sig => sig.role);
    const uniqueRoles = new Set(roles);
    if (uniqueRoles.size !== 3 || !roles.includes('chairperson') || !roles.includes('secretary') || !roles.includes('treasurer')) {
      return next(new Error('Group must have exactly one chairperson, one secretary, and one treasurer'));
    }
  }
  next();
});

const GroupModel = mongoose.model('Group', groupSchema);

export default GroupModel;