const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const resetSuperAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/helphub-ai', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    // Find the super admin user
    const superAdmin = await User.findOne({ email: 'superadmin@helphub.ai' });
    
    if (!superAdmin) {
      console.log('Super admin not found. Creating new super admin...');
      const newSuperAdmin = new User({
        name: 'Super Admin',
        email: 'superadmin@helphub.ai',
        password: 'SuperAdmin@123',
        role: 'super-admin',
        department: 'Administration',
        isActive: true
      });
      await newSuperAdmin.save();
      console.log('Super admin created successfully');
    } else {
      console.log('Super admin found. Resetting password...');
      superAdmin.password = 'SuperAdmin@123';
      superAdmin.isActive = true;
      await superAdmin.save();
      console.log('Password reset successfully');
    }

    console.log('Super admin credentials:');
    console.log('Email: superadmin@helphub.ai');
    console.log('Password: SuperAdmin@123');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

resetSuperAdmin(); 