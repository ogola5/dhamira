import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Excel-driven constraints (future system)
 * Legacy data may temporarily bypass these
 */
const allowedDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday'];
const allowedTimes = ['09:00', '10:00', '11:00', '12:00', '13:00'];

const groupSchema = new Schema(
  {
    // Excel-visible group name
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    // Branch ownership (MANDATORY even for legacy)
    branchId: {
      type: Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },

    // =========================
    // OPERATIONAL FIELDS (OPTIONAL FOR LEGACY)
    // =========================

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

    loanOfficer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    // Governance (may be empty for legacy)
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

    // Cached membership (safe for legacy)
    members: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Client',
      },
    ],

    // =========================
    // LEGACY / LIFECYCLE METADATA
    // =========================

    source: {
      type: String,
      enum: ['legacy_excel', 'system'],
      default: 'system',
      index: true,
    },

    status: {
      type: String,
      enum: ['legacy', 'provisional', 'active'],
      default: 'legacy',
      index: true,
    },

    legacyImportedAt: {
      type: Date,
      default: null,
    },

    // Audit
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

/**
 * FUTURE validation only
 * (legacy groups can exist without signatories)
 */
groupSchema.pre('save', function (next) {
  if (
    Array.isArray(this.signatories) &&
    this.signatories.length > 0
  ) {
    if (this.signatories.length !== 3) {
      return next(new Error('Group must have exactly 3 signatories'));
    }

    const roles = this.signatories.map((s) => s.role);
    const uniqueRoles = new Set(roles);
    const requiredRoles = ['chairperson', 'secretary', 'treasurer'];

    if (
      uniqueRoles.size !== 3 ||
      !requiredRoles.every((r) => uniqueRoles.has(r))
    ) {
      return next(
        new Error(
          'Group must have exactly one chairperson, one secretary, and one treasurer'
        )
      );
    }

    const clientIds = this.signatories.map((s) => String(s.clientId));
    if (new Set(clientIds).size !== clientIds.length) {
      return next(
        new Error('A client cannot hold multiple signatory roles')
      );
    }
  }

  next();
});

/**
 * Indexes for operational queries
 */
groupSchema.index({
  branchId: 1,
  meetingDay: 1,
  meetingTime: 1,
});

groupSchema.index({
  branchId: 1,
  status: 1,
});

export default mongoose.model('Group', groupSchema);
