
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('../models/User');
const Ticket = require('../models/Ticket');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/helphub-ai', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const seedUsers = async () => {
  try {
    // Clear existing users
    await User.deleteMany({});
    console.log('Cleared existing users');

    const users = [
      {
        name: 'Super Admin',
        email: 'admin@helphub.com',
        password: 'admin123',
        role: 'super-admin',
        department: 'Management'
      },
      {
        name: 'HR Manager',
        email: 'hr@helphub.com',
        password: 'hr123',
        role: 'hr',
        department: 'Human Resources'
      },
      {
        name: 'IT Support',
        email: 'it@helphub.com',
        password: 'it123',
        role: 'it',
        department: 'Information Technology'
      },
      {
        name: 'Admin User',
        email: 'admin-user@helphub.com',
        password: 'admin123',
        role: 'admin',
        department: 'Administration'
      },
      {
        name: 'John Doe',
        email: 'employee@helphub.com',
        password: 'emp123',
        role: 'employee',
        department: 'Engineering'
      },
      {
        name: 'Jane Smith',
        email: 'jane@helphub.com',
        password: 'jane123',
        role: 'employee',
        department: 'Marketing'
      }
    ];

    const createdUsers = await User.insertMany(users);
    console.log('✅ Users seeded successfully');
    
    return createdUsers;
  } catch (error) {
    console.error('❌ Error seeding users:', error);
    throw error;
  }
};

const seedTickets = async (users) => {
  try {
    // Clear existing tickets
    await Ticket.deleteMany({});
    console.log('Cleared existing tickets');

    const employee = users.find(u => u.role === 'employee');
    const itUser = users.find(u => u.role === 'it');
    const hrUser = users.find(u => u.role === 'hr');
    const adminUser = users.find(u => u.role === 'admin');

    const tickets = [
      {
        title: 'Computer running slowly',
        description: 'My computer has been running very slowly for the past week. It takes forever to boot up and applications are freezing frequently.',
        category: 'IT',
        priority: 'Medium',
        status: 'Open',
        requester: employee._id,
        assignedTo: itUser._id
      },
      {
        title: 'Request for vacation days',
        description: 'I would like to request 5 vacation days for next month. Please let me know the approval process.',
        category: 'HR',
        priority: 'Low',
        status: 'In Progress',
        requester: employee._id,
        assignedTo: hrUser._id
      },
      {
        title: 'Office key card not working',
        description: 'My office key card stopped working yesterday. I cannot access the building or my office.',
        category: 'Admin',
        priority: 'High',
        status: 'Resolved',
        requester: employee._id,
        assignedTo: adminUser._id,
        resolvedAt: new Date()
      },
      {
        title: 'Password reset needed',
        description: 'I forgot my email password and need it reset. I have tried the self-service portal but it is not working.',
        category: 'IT',
        priority: 'Medium',
        status: 'Open',
        requester: users.find(u => u.email === 'jane@helphub.com')._id,
        assignedTo: itUser._id
      }
    ];

    await Ticket.insertMany(tickets);
    console.log('✅ Tickets seeded successfully');
  } catch (error) {
    console.error('❌ Error seeding tickets:', error);
    throw error;
  }
};

const seedDatabase = async () => {
  try {
    console.log('🌱 Starting database seeding...');
    
    const users = await seedUsers();
    await seedTickets(users);
    
    console.log('🎉 Database seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    process.exit(1);
  }
};

// Run the seeding
seedDatabase();
