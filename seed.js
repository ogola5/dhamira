// seed.js
import connectDB from './config/db.js';
import userModel from './models/userModel.js';

const seedSuperAdmin = async () => {
  await connectDB();
  const existing = await userModel.findOne({ role: 'super_admin' });
  if (!existing) {
    const superAdmin = new userModel({
      username: 'superadmin',
      password: '', // Change in production!
      nationalId: '34038490',
      phone: '254799457182',
      role: 'super_admin',
    });
    await superAdmin.save();
    console.log('Superadmin created');
  } else {
    console.log('Superadmin already exists');
  }
  process.exit();
};

seedSuperAdmin();