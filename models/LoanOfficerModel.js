import mongoose from 'mongoose';

const { Schema } = mongoose;

const loanOfficerSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, index: true },
    nationalId: { type: String, required: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

loanOfficerSchema.index({ nationalId: 1 }, { unique: true, sparse: true });

export default mongoose.model('LoanOfficer', loanOfficerSchema);
