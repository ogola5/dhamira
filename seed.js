// seed.js
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import userModel from './models/userModel.js';

dotenv.config();

const seedSuperAdmin = async () => {
  try {
    await connectDB();

    const existing = await userModel.findOne({ role: 'super_admin' });
    if (existing) {
      console.log('✅ Super admin already exists');
      process.exit(0);
    }

    const superAdmin = await userModel.create({
      username: process.env.SEED_SUPERADMIN_USERNAME,
      password: process.env.SEED_SUPERADMIN_PASSWORD,
      nationalId: process.env.SEED_SUPERADMIN_NATIONAL_ID,
      phone: process.env.SEED_SUPERADMIN_PHONE,
      role: 'super_admin',
      regions: [],
    });

    console.log('🚀 Super admin created successfully');
    console.log(`👉 Username: ${process.env.SEED_SUPERADMIN_USERNAME}`);
    console.log(`👉 Password: ${process.env.SEED_SUPERADMIN_PASSWORD}`);
    console.log('⚠️  CHANGE PASSWORD AFTER FIRST LOGIN');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  }
};

seedSuperAdmin();
