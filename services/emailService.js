const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const sendWelcomeEmail = async (user) => {
  const { name, email, password, role } = user;

  try {
    const { data, error } = await resend.emails.send({
      from: 'HelpHub AI <onboarding@resend.dev>',
      to: email,
      subject: 'Welcome to HelpHub AI - Your Account Details',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Welcome to HelpHub AI!</h2>
          <p>Dear ${name},</p>
          <p>Your account has been created successfully. Here are your login credentials:</p>
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Password:</strong> ${password}</p>
            <p><strong>Role:</strong> ${role.charAt(0).toUpperCase() + role.slice(1)}</p>
          </div>
          <p>For security reasons, we recommend changing your password after your first login.</p>
          <p>You can access the system by visiting: HELPHUB AI</p>
          <p>If you have any questions or need assistance, please don't hesitate to contact the support team.</p>
          <br>
          <p>Best regards,</p>
          <p>The HelpHub AI Team</p>
        </div>
      `
    });

    if (error) {
      console.error('Error sending welcome email:', error);
      return false;
    }

    console.log(`Welcome email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return false;
  }
};

module.exports = {
  sendWelcomeEmail
}; 