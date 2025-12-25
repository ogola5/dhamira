// models/BranchModel.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const branchSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, index: true }, // "001", "002"
    name: { type: String, required: true, unique: true },             // "Mariakani", "Malindi"
  },
  { timestamps: true }
);

export default mongoose.model('Branch', branchSchema);
