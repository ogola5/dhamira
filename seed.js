// seed.js
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import userModel from './models/userModel.js';
import Branch from './models/BranchModel.js';

dotenv.config();

const generatePassword = (len = 12) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
};

const generateNumeric = (len = 9) => {
  let out = '';
  for (let i = 0; i < len; i++) out += String(Math.floor(Math.random() * 10));
  return out;
};

const rolesToSeed = [
  { role: 'super_admin', prefix: 'SEED_SUPERADMIN' },
  { role: 'initiator_admin', prefix: 'SEED_INITIATOR_ADMIN' },
  { role: 'approver_admin', prefix: 'SEED_APPROVER_ADMIN' },
  { role: 'loan_officer', prefix: 'SEED_LOAN_OFFICER' },
  { role: 'accountant', prefix: 'SEED_ACCOUNTANT', fixedId: '388626', fixedPassword: 'accountant1' },
];

const seedRoles = async () => {
  try {
    await connectDB();

    const created = [];
    
    // Get or create a default branch for roles that require it
    let defaultBranch = await Branch.findOne({});
    if (!defaultBranch) {
      console.log('📍 Creating default branch...');
      defaultBranch = await Branch.create({
        code: '001',
        name: 'Head Office'
      });
      console.log('✅ Default branch created');
    }

    for (const r of rolesToSeed) {
      const existing = await userModel.findOne({ role: r.role });
      if (existing) {
        console.log(`✅ ${r.role} already exists`);
        continue;
      }

      const username = process.env[`${r.prefix}_USERNAME`] || `${r.role.replace(/_/g, '.')}`;
      const password = r.fixedPassword || process.env[`${r.prefix}_PASSWORD`] || generatePassword();
      const nationalId = r.fixedId || process.env[`${r.prefix}_NATIONAL_ID`] || `NID${generateNumeric(8)}`;
      const phone = process.env[`${r.prefix}_PHONE`] || `+2547${generateNumeric(8)}`;

      const userData = {
        username,
        password,
        nationalId,
        phone,
        role: r.role,
        regions: [],
      };
      
      // Add branchId for roles that require it
      if (['admin', 'loan_officer', 'accountant'].includes(r.role)) {
        userData.branchId = defaultBranch._id;
      }

      const user = await userModel.create(userData);

      created.push({ role: r.role, username, password });
      console.log(`🚀 Created ${r.role}`);
    }

    if (created.length) {
      console.log('\n-- Credentials for created users --');
      created.forEach((u) => {
        console.log(`Role: ${u.role}`);
        console.log(`  Username: ${u.username}`);
        console.log(`  Password: ${u.password}`);
        console.log('  ⚠️  CHANGE PASSWORD AFTER FIRST LOGIN');
      });
    } else {
      console.log('\nNo new users were created.');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  }
};

seedRoles();
