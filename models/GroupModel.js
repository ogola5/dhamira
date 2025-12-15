import mongoose from 'mongoose';

const { Schema } = mongoose;

const allowedDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday'];
const allowedTimes = ['09:00', '10:00', '11:00', '12:00'];

const groupSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, index: true },

    meetingDay: { type: String, required: true },
    meetingTime: { type: String, required: true },

    signatories: [
      {
        role: {
          type: String,
          enum: ['chairperson', 'secretary', 'treasurer'],
          required: true,
        },
        clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
      },
    ],

    loanOfficer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    members: [{ type: Schema.Types.ObjectId, ref: 'Client' }],

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Validate meeting windows
groupSchema.pre('validate', function (next) {
  if (this.meetingDay && !allowedDays.includes(this.meetingDay)) {
    return next(new Error('Group meetings must be Monday–Thursday'));
  }
  if (this.meetingTime && !allowedTimes.includes(this.meetingTime)) {
    return next(new Error('Group meeting time must be one of: 09:00, 10:00, 11:00, 12:00'));
  }
  next();
});

// Validate exactly one of each signatory role if provided (and no duplicates)
groupSchema.pre('save', function (next) {
  if (Array.isArray(this.signatories) && this.signatories.length > 0) {
    if (this.signatories.length !== 3) {
      return next(new Error('Group must have exactly 3 signatories'));
    }
    const roles = this.signatories.map((s) => s.role);
    const uniqueRoles = new Set(roles);
    const required = ['chairperson', 'secretary', 'treasurer'];

    if (uniqueRoles.size !== 3 || !required.every((r) => uniqueRoles.has(r))) {
      return next(new Error('Group must have exactly one chairperson, one secretary, and one treasurer'));
    }

    // Prevent same client being assigned to multiple roles
    const clientIds = this.signatories.map((s) => String(s.clientId));
    if (new Set(clientIds).size !== clientIds.length) {
      return next(new Error('A client cannot hold multiple signatory roles'));
    }
  }
  next();
});

groupSchema.index({ loanOfficer: 1, meetingDay: 1, meetingTime: 1 });

export default mongoose.model('Group', groupSchema);
