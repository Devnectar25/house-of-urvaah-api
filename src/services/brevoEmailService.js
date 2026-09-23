const https = require('https');

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'concierge@houseofurvaah.com';
const SENDER_NAME = process.env.BREVO_SENDER_NAME || 'House of Urvaah Atelier';

/**
 * Send Transactional Email via Brevo API v3
 */
const sendBrevoEmail = async ({ toEmail, toName, subject, htmlContent }) => {
  if (!BREVO_API_KEY) {
    console.warn('[Brevo Email] BREVO_API_KEY is not set. Email notification logged to console:');
    console.log(`[Brevo Email Mock] To: ${toEmail}, Subject: ${subject}`);
    return { success: true, mock: true };
  }

  const payload = JSON.stringify({
    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
    to: [{ email: toEmail, name: toName || toEmail }],
    subject: subject,
    htmlContent: htmlContent
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      'https://api.brevo.com/v3/smtp/email',
      {
        method: 'POST',
        headers: {
          'api-key': BREVO_API_KEY,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`[Brevo Email] Successfully sent email to ${toEmail}`);
            resolve({ success: true, data: body });
          } else {
            console.error(`[Brevo Email Error] Status ${res.statusCode}:`, body);
            resolve({ success: false, error: body });
          }
        });
      }
    );

    req.on('error', (err) => {
      console.error('[Brevo Email Request Error]:', err.message);
      reject(err);
    });

    req.write(payload);
    req.end();
  });
};

/**
 * Branded Welcome Email Template
 */
const sendWelcomeEmail = async (email, name) => {
  const firstName = name ? name.split(' ')[0] : 'Valued Member';
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #FAF8F3; color: #111111; margin: 0; padding: 40px 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #E5E5E5; padding: 40px; text-align: center; }
        .logo { font-size: 24px; font-weight: 300; letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 30px; }
        .title { font-size: 20px; font-weight: 400; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 20px; color: #111111; }
        .content { font-size: 14px; line-height: 1.8; color: #444444; margin-bottom: 30px; text-align: left; }
        .btn { display: inline-block; background-color: #111111; color: #ffffff !important; padding: 14px 28px; text-decoration: none; font-size: 12px; letter-spacing: 0.25em; text-transform: uppercase; font-weight: 600; }
        .footer { margin-top: 40px; font-size: 10px; letter-spacing: 0.2em; color: #888888; text-transform: uppercase; border-t: 1px solid #EEEEEE; padding-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">HOUSE OF URVAAH</div>
        <div class="title">WELCOME TO THE ATELIER</div>
        <div class="content">
          <p>Dear ${firstName},</p>
          <p>Thank you for creating your private account with House of Urvaah Atelier. You now hold exclusive access to our seasonal capsule releases, bespoke tailoring services, and priority concierge.</p>
          <p>Explore our curated collections or visit your personal member sanctuary anytime.</p>
        </div>
        <a href="http://localhost:5173" class="btn">DISCOVER THE COLLECTION</a>
        <div class="footer">
          HOUSE OF URVAAH CONCIERGE &bull; 256-BIT ENCRYPTED ATELIER PRIVILÈGE
        </div>
      </div>
    </body>
    </html>
  `;

  return sendBrevoEmail({
    toEmail: email,
    toName: name,
    subject: 'Welcome to House of Urvaah Atelier',
    htmlContent
  });
};

/**
 * Branded Password Reset Email Template
 */
const sendPasswordResetEmail = async (email, resetUrl) => {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #FAF8F3; color: #111111; margin: 0; padding: 40px 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #E5E5E5; padding: 40px; text-align: center; }
        .logo { font-size: 24px; font-weight: 300; letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 30px; }
        .title { font-size: 18px; font-weight: 400; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 20px; color: #111111; }
        .content { font-size: 14px; line-height: 1.8; color: #444444; margin-bottom: 30px; text-align: left; }
        .btn { display: inline-block; background-color: #111111; color: #ffffff !important; padding: 14px 28px; text-decoration: none; font-size: 12px; letter-spacing: 0.25em; text-transform: uppercase; font-weight: 600; }
        .footer { margin-top: 40px; font-size: 10px; letter-spacing: 0.2em; color: #888888; text-transform: uppercase; border-t: 1px solid #EEEEEE; padding-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">HOUSE OF URVAAH</div>
        <div class="title">RESET YOUR ATELIER PASSWORD</div>
        <div class="content">
          <p>We received a request to reset the password associated with your House of Urvaah Atelier account.</p>
          <p>Please click the link below to establish a new password. If you did not make this request, you may safely ignore this email.</p>
        </div>
        <a href="${resetUrl}" class="btn">RESET PASSWORD</a>
        <div class="footer">
          THIS LINK IS VALID FOR 24 HOURS &bull; HOUSE OF URVAAH SECURITY
        </div>
      </div>
    </body>
    </html>
  `;

  return sendBrevoEmail({
    toEmail: email,
    subject: 'House of Urvaah Password Reset Request',
    htmlContent
  });
};

module.exports = {
  sendBrevoEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail
};
