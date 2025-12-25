import mongoose from 'mongoose';

const { Schema } = mongoose;

const allowedDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday'];
const allowedTimes = ['09:00', '10:00', '11:00', '12:00', '13:00'];

const groupSchema = new Schema(
  {
    /* =========================
       IDENTITY
    ========================= */
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    branchId: {
      type: Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },

    /* =========================
       OWNERSHIP & WORKFLOW
    ========================= */

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true, // loan officer or admin
      index: true,
    },

    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    loanOfficer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    /* =========================
       MEETINGS
    ========================= */

    meetingDay: {
      type: String,
      enum: allowedDays,
      default: null,
    },

    meetingTime: {
      type: String,
      enum: allowedTimes,
      default: null,
    },

    /* =========================
       GOVERNANCE
    ========================= */

    signatories: [
      {
        role: {
          type: String,
          enum: ['chairperson', 'secretary', 'treasurer'],
          required: true,
        },
        clientId: {
          type: Schema.Types.ObjectId,
          ref: 'Client',
          required: true,
        },
      },
    ],

    members: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Client',
      },
    ],

    /* =========================
       STATE
    ========================= */

    status: {
      type: String,
      enum: ['legacy', 'pending', 'active', 'suspended'],
      default: 'pending',
      index: true,
    },

    source: {
      type: String,
      enum: ['legacy_excel', 'system'],
      default: 'system',
      index: true,
    },

    legacyImportedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

/* =========================
   SIGNATORY RULES (ACTIVE ONLY)
========================= */
groupSchema.pre('save', function (next) {
  if (this.status !== 'active') return next();

  if (!this.signatories || this.signatories.length !== 3) {
    return next(new Error('Active group must have exactly 3 signatories'));
  }

  const roles = this.signatories.map(s => s.role);
  const uniqueRoles = new Set(roles);

  if (uniqueRoles.size !== 3) {
    return next(new Error('Duplicate signatory roles not allowed'));
  }

  const clientIds = this.signatories.map(s => String(s.clientId));
  if (new Set(clientIds).size !== clientIds.length) {
    return next(new Error('One client cannot hold multiple signatory roles'));
  }

  next();
});

/* =========================
   INDEXES
========================= */
groupSchema.index({ branchId: 1, status: 1 });
groupSchema.index({ loanOfficer: 1, status: 1 });

export default mongoose.model('Group', groupSchema);
