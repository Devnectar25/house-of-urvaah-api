const nodemailer = require('nodemailer');
const https = require('https');

/**
 * Send Transactional Email via SMTP (if configured) or Brevo API v3
 */
const sendBrevoEmail = async ({ toEmail, toName, subject, htmlContent, attachments }) => {
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

      const mailOptions = {
        from: `"${senderName}" <${process.env.SMTP_USER}>`,
        to: toName ? `"${toName}" <${toEmail}>` : toEmail,
        subject: subject,
        html: htmlContent
      };
      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        mailOptions.attachments = attachments;
      }

      const info = await transporter.sendMail(mailOptions);

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

      const effectiveSender = (senderEmail && !senderEmail.endsWith('@gmail.com'))
        ? senderEmail
        : 'devnectar27@12038968.brevosend.com';

      const mailOptions = {
        from: `"${senderName}" <${effectiveSender}>`,
        replyTo: senderEmail || 'devnectar27@gmail.com',
        to: toName ? `"${toName}" <${toEmail}>` : toEmail,
        subject: subject,
        html: htmlContent
      };
      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        mailOptions.attachments = attachments;
      }

      const info = await transporter.sendMail(mailOptions);

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

  const payloadData = {
    sender: { name: senderName, email: effectiveSenderEmail },
    replyTo: { name: senderName, email: senderEmail || 'devnectar27@gmail.com' },
    to: [{ email: toEmail, name: toName || toEmail }],
    subject: subject,
    htmlContent: htmlContent
  };

  if (attachments && Array.isArray(attachments) && attachments.length > 0) {
    payloadData.attachment = attachments.map((att) => ({
      name: att.filename || att.name || 'document.pdf',
      content: Buffer.isBuffer(att.content) ? att.content.toString('base64') : att.content
    }));
  }

  const payload = JSON.stringify(payloadData);

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

const sendWelcomeEmail = async (email, name) => {
  // Policy: Customer emails are strictly restricted to:
  // 1. Login to the website
  // 2. Order confirmation
  // 3. Successful delivered
  // 4. Refund amount
  // 5. Notify me when stock is available
  console.log(`[Brevo Email] Welcome email for ${email} suppressed per notification policy.`);
  return { success: true, skipped: true, reason: 'Welcome email suppressed per notification policy' };
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
 * Branded OTP Email Template - Login to the website
 */
const sendOtpEmail = async (email, otp) => {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #FAF8F3; color: #111111; margin: 0; padding: 40px 20px; }
        .container { max-width: 500px; width: 100%; margin: 0 auto; background: #ffffff; border: 1px solid #E5E5E5; padding: 40px; text-align: center; box-sizing: border-box; }
        .logo { font-size: 22px; font-weight: 300; letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 25px; color: #111; }
        .title { font-size: 16px; font-weight: 500; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 15px; color: #111111; }
        .otp-box { font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #111111; background-color: #FAF8F3; padding: 18px 24px; border: 1px solid #E5E5E5; margin: 25px 0; display: inline-block; }
        .content { font-size: 13px; line-height: 1.8; color: #555555; margin-bottom: 25px; text-align: center; }
        .footer { margin-top: 30px; font-size: 10px; letter-spacing: 0.2em; color: #888888; text-transform: uppercase; border-top: 1px solid #EEEEEE; padding-top: 20px; }
        @media only screen and (max-width: 600px) {
          body { padding: 20px 10px !important; }
          .container { padding: 25px 16px !important; width: 100% !important; }
          .otp-box { font-size: 26px !important; letter-spacing: 5px !important; padding: 14px 16px !important; width: 85% !important; box-sizing: border-box !important; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">HOUSE OF URVAAH</div>
        <div class="title">LOGIN TO WEBSITE</div>
        <div class="content">
          Please use the following 6-digit verification code to complete your login to House of Urvaah:
        </div>
        <div class="otp-box">${otp}</div>
        <div class="content">
          This code is valid for <strong>10 minutes</strong>. For your security, do not share this code with anyone.
        </div>
        <div class="footer">
          HOUSE OF URVAAH CONCIERGE &bull; SECURE LOGIN VERIFICATION
        </div>
      </div>
    </body>
    </html>
  `;

  return sendBrevoEmail({
    toEmail: email,
    subject: `Login Verification Code: ${otp} — House of Urvaah`,
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
  clientUrl,
  size,
  color,
  price,
  unsubscribeUrl
}) => {
  const customerGreeting = toName ? `Dear ${toName.split(' ')[0]},` : 'Dear Valued Patron,';
  const sizeColorText = [size ? `Size: ${size}` : '', color ? `Color: ${color}` : ''].filter(Boolean).join(' &bull; ');
  const websiteUrl = clientUrl || 
    (process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes('localhost') ? process.env.FRONTEND_URL : null) || 
    (process.env.CLIENT_URL && !process.env.CLIENT_URL.includes('localhost') ? process.env.CLIENT_URL : null) || 
    'https://house-of-urvaah-fe.vercel.app';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #FAF8F3; color: #111111; margin: 0; padding: 40px 15px; -webkit-font-smoothing: antialiased; }
        .container { max-width: 600px; width: 100%; margin: 0 auto; background: #ffffff; border: 1px solid #EAE6DF; padding: 45px 35px; text-align: center; box-sizing: border-box; }
        .brand-header { font-size: 24px; font-weight: 300; letter-spacing: 0.25em; text-transform: uppercase; margin-bottom: 25px; color: #111111; }
        .status-badge { display: inline-block; background-color: #FAF8F3; border: 1px solid #D6D0C5; color: #111111; font-size: 10px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; padding: 6px 16px; margin-bottom: 20px; }
        .title { font-size: 20px; font-weight: 400; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 18px; color: #111111; line-height: 1.4; }
        .message { font-size: 14px; line-height: 1.8; color: #4A4A4A; margin-bottom: 25px; text-align: left; }
        .product-card { background-color: #FCFBF9; border: 1px solid #EAE6DF; padding: 25px; margin: 25px 0; text-align: center; }
        .product-img { max-width: 240px; width: 100%; height: auto; object-fit: cover; border: 1px solid #EAE6DF; margin-bottom: 15px; display: inline-block; }
        .product-name { font-size: 16px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px; color: #111111; }
        .product-variant { font-size: 12px; letter-spacing: 0.15em; text-transform: uppercase; color: #777777; margin-bottom: 12px; }
        .product-price { font-size: 15px; font-weight: 500; color: #111111; margin-bottom: 20px; }
        .btn-shop { display: inline-block; background-color: #111111; color: #ffffff !important; padding: 15px 36px; text-decoration: none; font-size: 12px; letter-spacing: 0.25em; text-transform: uppercase; font-weight: 600; transition: background 0.2s; }
        .urgency-note { font-size: 12px; color: #888888; font-style: italic; margin-top: 25px; line-height: 1.6; }
        .footer { margin-top: 40px; font-size: 10px; letter-spacing: 0.15em; color: #888888; text-transform: uppercase; border-top: 1px solid #EEEEEE; padding-top: 25px; line-height: 1.8; }
        .unsubscribe-link { color: #888888; text-decoration: underline; }
        @media only screen and (max-width: 600px) {
          body { padding: 20px 10px !important; }
          .container { padding: 25px 16px !important; width: 100% !important; }
          .product-card { padding: 18px 12px !important; }
          .btn-shop { width: 100% !important; padding: 14px 10px !important; box-sizing: border-box !important; display: block !important; text-align: center !important; }
          .mobile-break { word-break: break-all !important; overflow-wrap: anywhere !important; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="brand-header">HOUSE OF URVAAH</div>
        <div class="status-badge">BACK IN ATELIER</div>
        <div class="title">RESTOCKED BY POPULAR DEMAND</div>
        
        <div class="message">
          <p>${customerGreeting}</p>
          <p>We are delighted to inform you that your coveted silhouette is once again available in our atelier. As requested, you are among the first to receive this priority notification.</p>
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

        <!-- Explicit Website & Product URL Mention -->
        <div style="background-color: #FAF8F3; border: 1px solid #EAE6DF; padding: 14px 18px; margin: 25px 0; text-align: left; font-size: 13px; line-height: 1.8; box-sizing: border-box;">
          <div style="margin-bottom: 6px; word-break: break-all; overflow-wrap: anywhere;">
            <strong style="text-transform: uppercase; letter-spacing: 0.1em; font-size: 11px; color: #111111;">Website:</strong> 
            <a href="${websiteUrl}" class="mobile-break" style="color: #111111; font-weight: 600; text-decoration: underline; word-break: break-all; overflow-wrap: anywhere;">${websiteUrl}</a>
          </div>
          <div style="word-break: break-all; overflow-wrap: anywhere;">
            <strong style="text-transform: uppercase; letter-spacing: 0.1em; font-size: 11px; color: #111111;">Product Link:</strong> 
            <a href="${productUrl}" class="mobile-break" style="color: #111111; font-weight: 600; text-decoration: underline; word-break: break-all; overflow-wrap: anywhere;">${productUrl}</a>
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
 * Stock Subscription Confirmation Email
 * Sent immediately to customer upon submitting the "Notify Me" request.
 */
const sendStockSubscriptionConfirmationEmail = async ({
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
  const sizeColorText = [size ? `Requested Size: ${size}` : '', color ? `Color: ${color}` : ''].filter(Boolean).join(' &bull; ');
  const websiteUrl = 'https://house-of-urvaah-fe.vercel.app';
  const finalProductUrl = productUrl || websiteUrl;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #FAF8F3; color: #111111; margin: 0; padding: 40px 15px; -webkit-font-smoothing: antialiased; }
        .container { max-width: 600px; width: 100%; margin: 0 auto; background: #ffffff; border: 1px solid #EAE6DF; padding: 45px 35px; text-align: center; box-sizing: border-box; }
        .brand-header { font-size: 24px; font-weight: 300; letter-spacing: 0.25em; text-transform: uppercase; margin-bottom: 25px; color: #111111; }
        .status-badge { display: inline-block; background-color: #FAF8F3; border: 1px solid #D6D0C5; color: #111111; font-size: 10px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; padding: 6px 16px; margin-bottom: 20px; }
        .title { font-size: 20px; font-weight: 400; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 18px; color: #111111; line-height: 1.4; }
        .message { font-size: 14px; line-height: 1.8; color: #4A4A4A; margin-bottom: 25px; text-align: left; }
        .product-card { background-color: #FCFBF9; border: 1px solid #EAE6DF; padding: 25px; margin: 25px 0; text-align: center; }
        .product-img { max-width: 240px; width: 100%; height: auto; object-fit: cover; border: 1px solid #EAE6DF; margin-bottom: 15px; display: inline-block; }
        .product-name { font-size: 16px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px; color: #111111; }
        .product-variant { font-size: 12px; letter-spacing: 0.15em; text-transform: uppercase; color: #777777; margin-bottom: 12px; }
        .product-price { font-size: 15px; font-weight: 500; color: #111111; margin-bottom: 20px; }
        .btn-shop { display: inline-block; background-color: #111111; color: #ffffff !important; padding: 15px 36px; text-decoration: none; font-size: 12px; letter-spacing: 0.25em; text-transform: uppercase; font-weight: 600; }
        .footer { margin-top: 40px; font-size: 10px; letter-spacing: 0.15em; color: #888888; text-transform: uppercase; border-top: 1px solid #EEEEEE; padding-top: 25px; line-height: 1.8; }
        .unsubscribe-link { color: #888888; text-decoration: underline; }
        @media only screen and (max-width: 600px) {
          body { padding: 20px 10px !important; }
          .container { padding: 25px 16px !important; width: 100% !important; }
          .product-card { padding: 18px 12px !important; }
          .btn-shop { width: 100% !important; padding: 14px 10px !important; box-sizing: border-box !important; display: block !important; text-align: center !important; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="brand-header">HOUSE OF URVAAH</div>
        <div class="status-badge">WAITLIST CONFIRMED</div>
        <div class="title">YOU'RE ON THE LIST</div>
        
        <div class="message">
          <p>${customerGreeting}</p>
          <p>Thank you for your interest in House of Urvaah. We have recorded your notification request for <strong>${productTitle}</strong>${size ? ` (Size: <strong>${size}</strong>)` : ''}.</p>
          <p>The moment our atelier restocks this coveted silhouette, you will be the very first to receive an exclusive notification to secure your piece before it sells out.</p>
        </div>

        <div class="product-card">
          ${productImage ? `<img src="${productImage}" alt="${productTitle}" class="product-img" />` : ''}
          <div class="product-name">${productTitle}</div>
          ${sizeColorText ? `<div class="product-variant">${sizeColorText}</div>` : ''}
          ${price ? `<div class="product-price">&#8377;${Number(price).toLocaleString('en-IN')}</div>` : ''}
          <div>
            <a href="${finalProductUrl}" class="btn-shop">VIEW CREATION</a>
          </div>
        </div>

        <div class="footer">
          HOUSE OF URVAAH ATELIER CONCIERGE<br/>
          EASTERN WINDS, 1402, E WING &bull; KURLA EAST, MUMBAI 400070<br/>
          ${unsubscribeUrl ? `To manage preferences or opt-out, <a href="${unsubscribeUrl}" class="unsubscribe-link">click here to unsubscribe</a>.` : ''}
        </div>
      </div>
    </body>
    </html>
  `;

  return sendBrevoEmail({
    toEmail,
    toName,
    subject: `Waitlist Confirmed: ${productTitle} | House of Urvaah`,
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

