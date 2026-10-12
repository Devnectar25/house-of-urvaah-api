const nodemailer = require('nodemailer');
const https = require('https');

/**
 * Send Transactional Email via SMTP (if configured) or Brevo API v3
 */
const sendBrevoEmail = async ({ toEmail, toName, subject, htmlContent }) => {
  const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.SENDER_EMAIL || 'devnectar27@gmail.com';
  const senderName = process.env.BREVO_SENDER_NAME || process.env.SENDER_NAME || 'House of Urvaah';

  // 1. Try Nodemailer SMTP if SMTP credentials are provided in .env
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      console.log(`[SMTP Email Request] Sending email via Nodemailer SMTP to ${toEmail}...`);
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });

      const info = await transporter.sendMail({
        from: `"${senderName}" <${process.env.SMTP_USER}>`,
        to: toName ? `"${toName}" <${toEmail}>` : toEmail,
        subject: subject,
        html: htmlContent
      });

      console.log(`[SMTP Email Success] Dispatched to ${toEmail}, Message ID: ${info.messageId}`);
      return { success: true, statusCode: 200, data: info.messageId };
    } catch (smtpErr) {
      console.error(`[SMTP Email Error]:`, smtpErr.message);
      // Fallback to Brevo API if SMTP fails
    }
  }

  // 2. If Brevo key is an SMTP key (starts with 'xsmtpsib-'), send via Brevo SMTP relay
  if (process.env.BREVO_API_KEY && process.env.BREVO_API_KEY.startsWith('xsmtpsib-')) {
    try {
      console.log(`[Brevo SMTP Request] Sending email via Brevo SMTP relay to ${toEmail}...`);
      const smtpUser = process.env.BREVO_SMTP_LOGIN || process.env.BREVO_SMTP_USER || 'bd851d001@smtp-brevo.com';
      const transporter = nodemailer.createTransport({
        host: 'smtp-relay.brevo.com',
        port: 587,
        secure: false,
        auth: {
          user: smtpUser,
          pass: process.env.BREVO_API_KEY
        }
      });

      const effectiveSender = senderEmail || 'devnectar27@gmail.com';

      const info = await transporter.sendMail({
        from: `"${senderName}" <${effectiveSender}>`,
        replyTo: senderEmail || 'devnectar27@gmail.com',
        to: toName ? `"${toName}" <${toEmail}>` : toEmail,
        subject: subject,
        html: htmlContent
      });

      console.log(`[Brevo SMTP Success] Dispatched to ${toEmail}, Message ID: ${info.messageId}`);
      return { success: true, statusCode: 200, data: info.messageId };
    } catch (smtpErr) {
      console.error(`[Brevo SMTP Error]:`, smtpErr.message);
    }
  }

  // 3. Fallback / Default: Brevo REST API v3
  const apiKey = process.env.BREVO_API_KEY;

  console.log(`[Brevo Email Request] Initiating transactional email:`);
  console.log(`  To: ${toEmail}`);
  console.log(`  Sender: "${senderName}" <${senderEmail}>`);
  console.log(`  Subject: ${subject}`);
  console.log(`  API Key Present: ${!!apiKey}`);

  if (!apiKey) {
    console.warn('[Brevo Email Error] BREVO_API_KEY environment variable is NOT set. Email notification logged as mock:');
    console.log(`[Brevo Email Mock] To: ${toEmail}, Subject: ${subject}`);
    return { success: false, error: 'BREVO_API_KEY environment variable is missing' };
  }

  // If BREVO_SENDER_EMAIL is a @gmail.com address, use Brevo's verified relay subdomain to prevent DMARC bouncing
  const effectiveSenderEmail = (senderEmail && !senderEmail.endsWith('@gmail.com'))
    ? senderEmail
    : 'devnectar27@12038968.brevosend.com';

  const payload = JSON.stringify({
    sender: { name: senderName, email: effectiveSenderEmail },
    replyTo: { name: senderName, email: senderEmail || 'devnectar27@gmail.com' },
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
          'api-key': apiKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          console.log(`[Brevo API Response] HTTP Status: ${res.statusCode}`);
          console.log(`[Brevo API Response] Body: ${body}`);

          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`[Brevo Email Success] Successfully dispatched email to ${toEmail}`);
            resolve({ success: true, statusCode: res.statusCode, data: body });
          } else {
            console.error(`[Brevo Email Failed] Status ${res.statusCode}: ${body}`);
            resolve({ success: false, statusCode: res.statusCode, error: body });
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

/**
 * Branded OTP Email Template
 */
const sendOtpEmail = async (email, otp) => {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #FAF8F3; color: #111111; margin: 0; padding: 40px 20px; }
        .container { max-width: 500px; margin: 0 auto; background: #ffffff; border: 1px solid #E5E5E5; padding: 40px; text-align: center; }
        .logo { font-size: 22px; font-weight: 300; letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 25px; color: #111; }
        .title { font-size: 16px; font-weight: 500; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 15px; color: #111111; }
        .otp-box { font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #111111; background-color: #FAF8F3; padding: 18px 24px; border: 1px solid #E5E5E5; margin: 25px 0; display: inline-block; }
        .content { font-size: 13px; line-height: 1.8; color: #555555; margin-bottom: 25px; text-align: center; }
        .footer { margin-top: 30px; font-size: 10px; letter-spacing: 0.2em; color: #888888; text-transform: uppercase; border-top: 1px solid #EEEEEE; padding-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">HOUSE OF URVAAH</div>
        <div class="title">VERIFICATION CODE</div>
        <div class="content">
          Please use the following 6-digit verification code to complete your authentication:
        </div>
        <div class="otp-box">${otp}</div>
        <div class="content">
          This code is valid for <strong>10 minutes</strong>. For your security, do not share this code with anyone.
        </div>
        <div class="footer">
          HOUSE OF URVAAH CONCIERGE &bull; SECURE SINGLE SIGN-ON
        </div>
      </div>
    </body>
    </html>
  `;

  return sendBrevoEmail({
    toEmail: email,
    subject: `Your Verification Code: ${otp} - House of Urvaah`,
    htmlContent
  });
};

/**
 * Branded Back-in-Stock Restock Notification Email Template
 */
const sendStockAlertEmail = async ({
  toEmail,
  toName,
  productTitle,
  productImage,
  productUrl,
  size,
  color,
  price,
  unsubscribeUrl
}) => {
  const customerGreeting = toName ? `Dear ${toName.split(' ')[0]},` : 'Dear Valued Patron,';
  const sizeColorText = [size ? `Size: ${size}` : '', color ? `Color: ${color}` : ''].filter(Boolean).join(' &bull; ');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #FAF8F3; color: #111111; margin: 0; padding: 40px 15px; -webkit-font-smoothing: antialiased; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #EAE6DF; padding: 45px 35px; text-align: center; }
        .brand-header { font-size: 24px; font-weight: 300; letter-spacing: 0.25em; text-transform: uppercase; margin-bottom: 25px; color: #111111; }
        .status-badge { display: inline-block; background-color: #FAF8F3; border: 1px solid #D6D0C5; color: #111111; font-size: 10px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; padding: 6px 16px; margin-bottom: 20px; }
        .title { font-size: 20px; font-weight: 400; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 18px; color: #111111; line-height: 1.4; }
        .message { font-size: 14px; line-height: 1.8; color: #4A4A4A; margin-bottom: 30px; text-align: left; }
        .product-card { background-color: #FCFBF9; border: 1px solid #EAE6DF; padding: 25px; margin: 25px 0; text-align: center; }
        .product-img { max-width: 240px; width: 100%; height: auto; object-fit: cover; border: 1px solid #EAE6DF; margin-bottom: 15px; display: inline-block; }
        .product-name { font-size: 16px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px; color: #111111; }
        .product-variant { font-size: 12px; letter-spacing: 0.15em; text-transform: uppercase; color: #777777; margin-bottom: 12px; }
        .product-price { font-size: 15px; font-weight: 500; color: #111111; margin-bottom: 20px; }
        .btn-shop { display: inline-block; background-color: #111111; color: #ffffff !important; padding: 15px 36px; text-decoration: none; font-size: 12px; letter-spacing: 0.25em; text-transform: uppercase; font-weight: 600; transition: background 0.2s; }
        .urgency-note { font-size: 12px; color: #888888; font-style: italic; margin-top: 25px; line-height: 1.6; }
        .footer { margin-top: 40px; font-size: 10px; letter-spacing: 0.15em; color: #888888; text-transform: uppercase; border-top: 1px solid #EEEEEE; padding-top: 25px; line-height: 1.8; }
        .unsubscribe-link { color: #888888; text-decoration: underline; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="brand-header">HOUSE OF URVAAH</div>
        <div class="status-badge">BACK IN ATELIER</div>
        <div class="title">RESTOCKED BY POPULAR DEMAND</div>
        
        <div class="message">
          <p>${customerGreeting}</p>
          <p>We are delighted to inform you that your coveted silhouette is once again available in our atelier. As requested, you are among the first to receive this private notification.</p>
        </div>

        <div class="product-card">
          ${productImage ? `<img src="${productImage}" alt="${productTitle}" class="product-img" />` : ''}
          <div class="product-name">${productTitle}</div>
          ${sizeColorText ? `<div class="product-variant">${sizeColorText}</div>` : ''}
          ${price ? `<div class="product-price">&#8377;${Number(price).toLocaleString('en-IN')}</div>` : ''}
          <div>
            <a href="${productUrl}" class="btn-shop">SECURE YOUR PIECE</a>
          </div>
        </div>

        <div class="urgency-note">
          Please note: In keeping with our commitment to bespoke craftsmanship, inventory quantities remain strictly limited and may sell out swiftly.
        </div>

        <div class="footer">
          HOUSE OF URVAAH ATELIER CONCIERGE<br/>
          To manage notification preferences or opt-out, <a href="${unsubscribeUrl}" class="unsubscribe-link">click here to unsubscribe</a>.
        </div>
      </div>
    </body>
    </html>
  `;

  return sendBrevoEmail({
    toEmail,
    toName,
    subject: `Back in Stock: ${productTitle} | House of Urvaah`,
    htmlContent
  });
};

/**
 * Branded Subscription Confirmation Email Template
 */
const sendStockSubscriptionConfirmationEmail = async ({
  toEmail,
  toName,
  productTitle,
  size,
  color,
  unsubscribeUrl
}) => {
  const sizeColorText = [size ? `Size: ${size}` : '', color ? `Color: ${color}` : ''].filter(Boolean).join(' &bull; ');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #FAF8F3; color: #111111; margin: 0; padding: 40px 15px; }
        .container { max-width: 550px; margin: 0 auto; background: #ffffff; border: 1px solid #EAE6DF; padding: 40px 30px; text-align: center; }
        .brand-header { font-size: 22px; font-weight: 300; letter-spacing: 0.25em; text-transform: uppercase; margin-bottom: 25px; }
        .title { font-size: 17px; font-weight: 400; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 18px; color: #111111; }
        .content { font-size: 13px; line-height: 1.8; color: #444444; margin-bottom: 25px; text-align: left; }
        .item-box { background: #FAF8F3; border: 1px solid #EAE6DF; padding: 18px; margin: 20px 0; font-size: 13px; text-align: center; }
        .footer { margin-top: 30px; font-size: 10px; letter-spacing: 0.15em; color: #888888; text-transform: uppercase; border-top: 1px solid #EEEEEE; padding-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="brand-header">HOUSE OF URVAAH</div>
        <div class="title">STOCK ALERT CONFIRMED</div>
        <div class="content">
          <p>Thank you. Your back-in-stock alert has been registered successfully.</p>
          <div class="item-box">
            <strong>${productTitle}</strong><br/>
            ${sizeColorText ? `<span style="color:#666; font-size:12px;">${sizeColorText}</span>` : ''}
          </div>
          <p>The moment this item returns to our atelier inventory, you will receive priority notification directly in your inbox.</p>
        </div>
        <div class="footer">
          HOUSE OF URVAAH CONCIERGE<br/>
          <a href="${unsubscribeUrl}" style="color: #888888; text-decoration: underline;">Cancel Alert Request</a>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendBrevoEmail({
    toEmail,
    toName,
    subject: `Alert Registered: ${productTitle} - House of Urvaah`,
    htmlContent
  });
};

module.exports = {
  sendBrevoEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendOtpEmail,
  sendStockAlertEmail,
  sendStockSubscriptionConfirmationEmail
};

