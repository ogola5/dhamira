import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Group from '../models/GroupModel.js';
import Branch from '../models/BranchModel.js';

// TEMPORARY mapping – adjust if needed
const DEFAULT_BRANCH_CODE = '002'; // Malindi

// Fix Excel-style time slots
function normalizeMeetingTime(time) {
  if (time === '14:00') return '13:00';
  return time;
}

async function migrateGroups() {
  await connectDB();
  console.log('Connected to MongoDB');

  const branch = await Branch.findOne({ code: DEFAULT_BRANCH_CODE });
  if (!branch) throw new Error('Default branch not found');

  const groups = await Group.find({});
  console.log(`Found ${groups.length} groups`);

  for (const group of groups) {
    let updated = false;

    // 1. Attach branch
    if (!group.branchId) {
      group.branchId = branch._id;
      updated = true;
    }

    // 2. Fix meetingTime
    const normalizedTime = normalizeMeetingTime(group.meetingTime);
    if (normalizedTime !== group.meetingTime) {
      group.meetingTime = normalizedTime;
      updated = true;
    }

    if (updated) {
      await group.save();
      console.log(`✔ Migrated group: ${group.name}`);
    }
  }

  console.log('✅ Group migration completed');
  await mongoose.disconnect();
}

migrateGroups().catch(err => {
  console.error('❌ Group migration failed:', err);
  process.exit(1);
});
