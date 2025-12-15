// models/ClientModel.js
import mongoose from 'mongoose';

const clientSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Client name is required'],
    trim: true,
  },
  nationalId: {
    type: String,
    required: [true, 'National ID is required'],
    unique: true,
    trim: true,
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
  },
  photoUrl: {
    type: String, // Path to uploaded photo
    required: [true, 'Client photo is required'],
  },
  residence: {
    type: String,
    enum: ['owned', 'rented'],
    required: [true, 'Residence type is required'],
  },
  businessType: {
    type: String,
    required: [true, 'Business type is required'],
    trim: true,
  },
  businessLocation: {
    type: String,
    required: [true, 'Business location is required'],
    trim: true,
  },
  nextOfKin: {
    name: {
      type: String,
      required: [true, 'Next of kin name is required'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Next of kin phone is required'],
      trim: true,
    },
    relationship: {
      type: String,
      required: [true, 'Relationship with next of kin is required'],
      trim: true,
    },
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: [true, 'Client must belong to a group'],
  },
  savingsBalance: {
    type: Number,
    default: 0,
    min: [0, 'Savings balance cannot be negative'],
  },
  registrationFeePaid: {
    type: Boolean,
    default: false,
  },
  initialSavingsPaid: {
    type: Boolean,
    default: false,
  },
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

const ClientModel = mongoose.model('Client', clientSchema);

export default ClientModel;