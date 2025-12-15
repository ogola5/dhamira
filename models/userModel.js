import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const { Schema } = mongoose;

function normalizeNationalId(v) {
  return typeof v === 'string' ? v.trim() : v;
}
function normalizePhone(v) {
  return typeof v === 'string' ? v.trim() : v;
}

const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, index: true },

    password: { type: String, required: true, minlength: 8 }, // bump to 8 for production

    nationalId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      set: normalizeNationalId,
      index: true,
    },

    phone: { type: String, required: true, trim: true, set: normalizePhone },

    role: {
      type: String,
      enum: ['super_admin', 'initiator_admin', 'approver_admin', 'loan_officer'],
      required: true,
      index: true,
    },

    regions: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model('User', userSchema);
