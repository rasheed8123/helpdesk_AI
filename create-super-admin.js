const fetch = require('node-fetch');

const createSuperAdmin = async () => {
  try {
    console.log('Making request to create super admin...');
    const response = await fetch('http://localhost:5000/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: "Super Admin",
        email: "superadmin@helphub.ai",
        password: "SuperAdmin@123",
        role: "super-admin",
        department: "Administration"
      })
    });

    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('Response data:', data);
  } catch (error) {
    console.error('Error details:', error.message);
    if (error.response) {
      console.error('Response error:', await error.response.text());
    }
  }
};

createSuperAdmin(); 