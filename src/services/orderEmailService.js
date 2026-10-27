const crypto = require('crypto');
const pool = require('../config/db');
const { sendBrevoEmail } = require('./brevoEmailService');
const invoiceService = require('./invoiceService');

const LIVE_VERCEL_FRONTEND_URL = 'https://house-of-urvaah-fe.vercel.app';

/**
 * Resolves the public frontend website URL for email links.
 * In production or for customer transactional emails (like Brevo delivery feedback),
 * ensures links always point to the live authoritative store deployment on Vercel
 * (https://house-of-urvaah-fe.vercel.app) rather than localhost:3000, which causes
 * ERR_CONNECTION_REFUSED on mobile devices.
 */
const getPublicFrontendUrl = () => {
  const explicitUrl = process.env.FRONTEND_URL || process.env.STORE_FRONT_URL || process.env.VERCEL_URL;
  if (explicitUrl && !explicitUrl.includes('localhost') && !explicitUrl.includes('127.0.0.1')) {
    let clean = explicitUrl.trim().replace(/\/+$/, '');
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `https://${clean}`;
    }
    return clean;
  }

  // If developer explicitly opted into local email links for desktop testing
  if (process.env.USE_LOCAL_EMAIL_LINKS === 'true') {
    return (process.env.CLIENT_URL || 'http://localhost:3000').trim().replace(/\/+$/, '');
  }

  // Default to live production Vercel domain so links open on phones & across all networks
  return LIVE_VERCEL_FRONTEND_URL;
};

const FRONTEND_URL = getPublicFrontendUrl();
const SUPPORT_EMAIL = 'houseofurvaah@gmail.com';

/**
 * Validates whether a string is a well-formed email address
 */
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
};

/**
 * Resolves the authoritative customer recipient details for an order.
 * Ensures the email belongs strictly to the order's owner or checkout record.
 */
const resolveAuthoritativeRecipient = async (order) => {
  if (!order) throw new Error('Order data is required to resolve recipient.');

  let recipientEmail = null;
  let recipientName = null;
  let recipientPhone = null;

  // 1. Check joined customer_email / u.emailid
  if (isValidEmail(order.customer_email)) {
    recipientEmail = order.customer_email.trim().toLowerCase();
  } else if (isValidEmail(order.user_id)) {
    recipientEmail = order.user_id.trim().toLowerCase();
  }

  // 2. Query users table directly by user_id to ensure absolute accuracy
  if (!recipientEmail && order.user_id) {
    try {
      const userRes = await pool.query(
        `SELECT username, emailid, contactno, fullname FROM public.users 
         WHERE username = $1 LIMIT 1`,
        [order.user_id]
      );
      if (userRes.rows.length > 0) {
        const u = userRes.rows[0];
        if (isValidEmail(u.emailid)) {
          recipientEmail = u.emailid.trim().toLowerCase();
        } else if (isValidEmail(u.username)) {
          recipientEmail = u.username.trim().toLowerCase();
        }
        recipientName = u.fullname || null;
        recipientPhone = u.contactno || null;
      }
    } catch (err) {
      console.warn('[OrderEmailService] User lookup error:', err.message);
    }
  }

  // 3. Resolve recipient name and phone from shipping address
  if (!recipientName || !recipientPhone) {
    if (order.address_id) {
      try {
        const addrRes = await pool.query(
          `SELECT recipient_name, phone FROM public.user_addresses WHERE id = $1 LIMIT 1`,
          [order.address_id]
        );
        if (addrRes.rows.length > 0) {
          recipientName = recipientName || addrRes.rows[0].recipient_name;
          recipientPhone = recipientPhone || addrRes.rows[0].phone;
        }
      } catch (err) {
        console.warn('[OrderEmailService] Address lookup error:', err.message);
      }
    }
  }

  if (order.shippingAddress) {
    recipientName = recipientName || order.shippingAddress.name || order.shippingAddress.recipient_name;
    recipientPhone = recipientPhone || order.shippingAddress.phone;
  }

  if (!recipientEmail) {
    throw new Error(`Authoritative recipient email could not be resolved for order #${order.order_number || order.id}`);
  }

  return {
    email: recipientEmail,
    name: recipientName || 'Valued Patron',
    phone: recipientPhone || 'N/A'
  };
};

/**
 * Formats Indian Currency (INR)
 */
const formatINR = (amount) => {
  const num = parseFloat(amount || 0);
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ============================================================================
// WORKFLOW 1: ORDER CONFIRMATION EMAIL
// ============================================================================

/**
 * Helper to fetch order details lazily to prevent circular dependencies
 */
const fetchOrderDetails = async (orderId) => {
  const orderService = require('./orderService');
  return await orderService.getOrderById(orderId);
};

/**
 * Triggers Order Confirmation Email
 * Idempotency: order_confirmation:${order.id}
 */
const sendOrderConfirmationWorkflow = async (orderId, options = {}) => {
  const { forceResend = false } = options;

  try {
    const order = await fetchOrderDetails(orderId);
    if (!order) {
      console.error(`[OrderConfirmationWorkflow] Order not found: ${orderId}`);
      return { success: false, error: 'Order not found' };
    }

    const { email: recipientEmail, name: recipientName } = await resolveAuthoritativeRecipient(order);
    const idempotencyKey = `order_confirmation:${order.id}`;

    // 1. Check idempotency record
    const existing = await pool.query(
      `SELECT * FROM public.email_notifications WHERE idempotency_key = $1`,
      [idempotencyKey]
    );

    if (existing.rows.length > 0 && !forceResend) {
      const record = existing.rows[0];
      if (record.status === 'sent') {
        console.log(`[OrderConfirmationWorkflow] Already sent for order #${order.order_number}. Skipping duplicate.`);
        return { success: true, skipped: true, notificationId: record.id, message: 'Already sent' };
      }
    }

    const subject = `House of Urvaah — Order Confirmation #${order.order_number}`;

    // 2. Insert or update notification record to 'pending'
    let notificationId;
    if (existing.rows.length > 0) {
      notificationId = existing.rows[0].id;
      await pool.query(
        `UPDATE public.email_notifications 
         SET status = 'pending', attempt_count = attempt_count + 1, updated_at = NOW() 
         WHERE id = $1`,
        [notificationId]
      );
    } else {
      const insertRes = await pool.query(
        `INSERT INTO public.email_notifications (
          workflow_type, order_id, order_number, customer_id, recipient_email, recipient_name,
          subject, event_type, status, idempotency_key, metadata, created_at, updated_at
        ) VALUES (
          'ORDER_CONFIRMATION', $1, $2, $3, $4, $5,
          $6, 'ORDER_CREATED', 'pending', $7, $8, NOW(), NOW()
        ) RETURNING id`,
        [
          order.id,
          order.order_number,
          order.user_id,
          recipientEmail,
          recipientName,
          subject,
          idempotencyKey,
          JSON.stringify({ paymentMethod: order.payment_method, total: order.total })
        ]
      );
      notificationId = insertRes.rows[0].id;
    }

    // 3. Compile Branded Order Confirmation HTML
    const orderDate = new Date(order.created_at || Date.now()).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const isCod = String(order.payment_method || '').toLowerCase() === 'cod';
    const paymentStatusBadge = isCod 
      ? 'PENDING (CASH ON DELIVERY)' 
      : (order.payment_status === 'Paid' ? 'PAID &bull; VERIFIED' : 'AWAITING PAYMENT');

    const itemsHtml = (order.items || []).map((item) => {
      const itemPrice = parseFloat(item.price || 0);
      const itemQty = parseInt(item.quantity || 1, 10);
      const itemTotal = itemPrice * itemQty;
      const variantText = item.size ? `Size: ${item.size}` : '';

      return `
        <tr>
          <td style="padding: 14px 0; border-bottom: 1px solid #ECE7E1; font-family: 'Helvetica Neue', Arial, sans-serif;">
            <div style="font-weight: 600; color: #111111; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">
              ${item.name || item.title || 'Store Garment'}
            </div>
            ${variantText ? `<div style="font-size: 11px; color: #777777; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.1em;">${variantText}</div>` : ''}
          </td>
          <td style="padding: 14px 0; border-bottom: 1px solid #ECE7E1; text-align: center; font-size: 13px; color: #555555; font-family: 'Helvetica Neue', Arial, sans-serif;">
            ${itemQty}
          </td>
          <td style="padding: 14px 0; border-bottom: 1px solid #ECE7E1; text-align: right; font-size: 13px; font-weight: 500; color: #111111; font-family: 'Helvetica Neue', Arial, sans-serif;">
            ${formatINR(itemTotal)}
          </td>
        </tr>
      `;
    }).join('');

    const shippingAddressText = order.full_address || 
      `${order.city || ''}, ${order.state || ''} ${order.postal_code || ''}`.trim() || 
      'Address provided at checkout';

    const orderUrl = `${FRONTEND_URL}/account`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          @media only screen and (max-width: 600px) {
            .email-wrapper { padding: 12px 6px !important; }
            .email-container { padding: 25px 16px !important; width: 100% !important; max-width: 100% !important; }
            .mobile-btn { display: block !important; width: 100% !important; padding: 14px 10px !important; box-sizing: border-box !important; text-align: center !important; }
            .mobile-break { word-break: break-all !important; overflow-wrap: anywhere !important; }
          }
        </style>
      </head>
      <body class="email-wrapper" style="margin: 0; padding: 30px 15px; background-color: #FAF8F5; font-family: 'Georgia', serif; color: #111111;">
        <div class="email-container" style="max-width: 620px; width: 100%; margin: 0 auto; background-color: #ffffff; border: 1px solid #EAE6DF; padding: 45px 35px; box-sizing: border-box;">
          
          <!-- Header -->
          <div style="text-align: center; border-bottom: 1px solid #EAE6DF; padding-bottom: 25px; margin-bottom: 30px;">
            <div style="font-size: 24px; letter-spacing: 0.25em; text-transform: uppercase; font-weight: 400; color: #111111;">
              HOUSE OF URVAAH
            </div>
            <div style="font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase; color: #777777; margin-top: 8px;">
              OFFICIAL STORE ORDER CONFIRMATION
            </div>
          </div>

          <!-- Greeting & Headline -->
          <div style="margin-bottom: 25px;">
            <div style="font-size: 16px; font-weight: 400; margin-bottom: 10px; color: #111111;">
              Dear ${recipientName},
            </div>
            <p style="font-size: 13px; line-height: 1.8; color: #4A4A4A; font-family: 'Helvetica Neue', Arial, sans-serif; margin: 0;">
              Thank you for choosing House of Urvaah. Your bespoke store order has been received and registered with Order Number 
              <strong style="color: #111111; letter-spacing: 0.05em;">#${order.order_number}</strong>.
            </p>
          </div>

          <!-- Order Summary Card -->
          <div style="background-color: #FAF8F5; border: 1px solid #EAE6DF; padding: 18px 20px; margin-bottom: 30px; box-sizing: border-box;">
            <table style="width: 100%; border-collapse: collapse; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; line-height: 1.6;">
              <tr>
                <td style="padding: 5px 0; color: #777777; text-transform: uppercase; letter-spacing: 0.1em; font-size: 10px; width: 42%; vertical-align: top;">
                  Order Date:
                </td>
                <td style="padding: 5px 0; color: #111111; font-weight: 500; text-align: right; vertical-align: top; width: 58%;">
                  ${orderDate}
                </td>
              </tr>
              <tr>
                <td style="padding: 5px 0; color: #777777; text-transform: uppercase; letter-spacing: 0.1em; font-size: 10px; width: 42%; vertical-align: top;">
                  Payment Method:
                </td>
                <td style="padding: 5px 0; color: #111111; font-weight: 500; text-align: right; vertical-align: top; text-transform: uppercase; width: 58%;">
                  ${order.payment_method || 'Online'}
                </td>
              </tr>
              <tr>
                <td style="padding: 5px 0; color: #777777; text-transform: uppercase; letter-spacing: 0.1em; font-size: 10px; width: 42%; vertical-align: top;">
                  Payment Status:
                </td>
                <td style="padding: 5px 0; color: #111111; font-weight: 600; text-align: right; vertical-align: top; text-transform: uppercase; letter-spacing: 0.05em; width: 58%;">
                  ${paymentStatusBadge}
                </td>
              </tr>
            </table>
          </div>

          <!-- Items Table -->
          <div style="margin-bottom: 30px;">
            <div style="font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; color: #111111; font-weight: 600; border-bottom: 1px solid #111111; padding-bottom: 8px; margin-bottom: 5px;">
              YOUR CURATED SILHOUETTES
            </div>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="font-size: 10px; color: #888888; text-transform: uppercase; letter-spacing: 0.15em; font-family: 'Helvetica Neue', Arial, sans-serif; text-align: left;">
                  <th style="padding: 10px 0; border-bottom: 1px solid #EAE6DF; font-weight: 500;">Item</th>
                  <th style="padding: 10px 0; border-bottom: 1px solid #EAE6DF; font-weight: 500; text-align: center; width: 45px;">Qty</th>
                  <th style="padding: 10px 0; border-bottom: 1px solid #EAE6DF; font-weight: 500; text-align: right; width: 90px;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>
          </div>

          <!-- Totals Breakdown -->
          <div style="border-top: 1px solid #EAE6DF; padding-top: 15px; margin-bottom: 30px; box-sizing: border-box;">
            <table style="width: 100%; border-collapse: collapse; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; line-height: 1.8;">
              <tr>
                <td style="padding: 4px 0; color: #555555; vertical-align: top;">Subtotal:</td>
                <td style="padding: 4px 0; color: #111111; text-align: right; vertical-align: top; font-weight: 500;">${formatINR(order.subtotal || order.total)}</td>
              </tr>
              ${parseFloat(order.discount_amount || 0) > 0 ? `
              <tr>
                <td style="padding: 4px 0; color: #2E7D32; vertical-align: top;">Discount Applied:</td>
                <td style="padding: 4px 0; color: #2E7D32; text-align: right; vertical-align: top; font-weight: 500;">-${formatINR(order.discount_amount)}</td>
              </tr>
              ` : ''}
              <tr>
                <td style="padding: 4px 0; color: #555555; vertical-align: top;">Shipping &amp; Delivery:</td>
                <td style="padding: 4px 0; color: #111111; text-align: right; vertical-align: top; font-weight: 500;">${parseFloat(order.shipping || 0) > 0 ? formatINR(order.shipping) : 'COMPLIMENTARY'}</td>
              </tr>
              <tr>
                <td style="padding: 12px 0 4px 0; font-size: 15px; font-weight: 700; color: #111111; border-top: 1px solid #111111; vertical-align: top;">Final Total:</td>
                <td style="padding: 12px 0 4px 0; font-size: 15px; font-weight: 700; color: #111111; border-top: 1px solid #111111; text-align: right; vertical-align: top;">${formatINR(order.total)}</td>
              </tr>
            </table>
          </div>

          <!-- Delivery Address Summary -->
          <div style="background-color: #FAF8F5; border: 1px solid #EAE6DF; padding: 20px; margin-bottom: 30px; box-sizing: border-box;">
            <div style="font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: #111111; font-weight: 600; margin-bottom: 8px;">
              DELIVERY DESTINATION
            </div>
            <div style="font-size: 12px; color: #4A4A4A; font-family: 'Helvetica Neue', Arial, sans-serif; line-height: 1.6;">
              <strong>${recipientName}</strong><br/>
              ${shippingAddressText}
            </div>
          </div>

          <!-- Action Button -->
          <div style="text-align: center; margin: 35px 0 25px 0;">
            <a href="${orderUrl}" class="mobile-btn" style="background-color: #111111; color: #ffffff !important; padding: 14px 34px; text-decoration: none; font-size: 11px; letter-spacing: 0.25em; text-transform: uppercase; font-family: 'Helvetica Neue', Arial, sans-serif; font-weight: 600; display: inline-block; box-sizing: border-box; max-width: 100%;">
              VIEW ORDER IN ACCOUNT
            </a>
          </div>

          <!-- Footer -->
          <div style="border-top: 1px solid #EAE6DF; padding-top: 25px; margin-top: 35px; text-align: center; font-size: 10px; color: #888888; font-family: 'Helvetica Neue', Arial, sans-serif; line-height: 1.8; letter-spacing: 0.1em; text-transform: uppercase;">
            HOUSE OF URVAAH CUSTOMER CARE<br/>
            EASTERN WINDS, 1402, E WING &bull; KURLA EAST, MUMBAI 400070<br/>
            For inquiries, reply to this email or contact <a href="mailto:${SUPPORT_EMAIL}" style="color: #111111; text-decoration: underline;">${SUPPORT_EMAIL}</a>
          </div>

        </div>
      </body>
      </html>
    `;

    // 4. Dispatch Email
    const dispatchRes = await sendBrevoEmail({
      toEmail: recipientEmail,
      toName: recipientName,
      subject,
      htmlContent
    });

    if (dispatchRes.success) {
      await pool.query(
        `UPDATE public.email_notifications 
         SET status = 'sent', provider_message_id = $1, sent_at = NOW(), updated_at = NOW() 
         WHERE id = $2`,
        [dispatchRes.data || null, notificationId]
      );
      console.log(`[OrderConfirmationWorkflow] Dispatched successfully to ${recipientEmail} for order #${order.order_number}`);
      return { success: true, notificationId, recipient: recipientEmail };
    } else {
      await pool.query(
        `UPDATE public.email_notifications 
         SET status = 'failed', error_message = $1, updated_at = NOW() 
         WHERE id = $2`,
        [String(dispatchRes.error || 'Provider dispatch failed'), notificationId]
      );
      return { success: false, error: dispatchRes.error, notificationId };
    }

  } catch (err) {
    console.error(`[OrderConfirmationWorkflow Error]:`, err.message);
    return { success: false, error: err.message };
  }
};

// ============================================================================
// WORKFLOW 2: PAYMENT STATUS EMAIL (STRICTLY SEPARATED)
// ============================================================================

/**
 * Triggers Payment Status Notification Email
 * Statuses: 'Paid' (Successful), 'Pending', 'Failed', 'Refunded'
 * Idempotency: payment_status:${order.id}:${status}:${transactionId}
 */
const sendPaymentStatusWorkflow = async (orderId, paymentStatus, paymentDetails = {}, options = {}) => {
  const { forceResend = false } = options;
  const normalizedStatus = (paymentStatus || 'Pending').trim();

  try {
    const order = await fetchOrderDetails(orderId);
    if (!order) {
      console.error(`[PaymentStatusWorkflow] Order not found: ${orderId}`);
      return { success: false, error: 'Order not found' };
    }

    const { email: recipientEmail, name: recipientName } = await resolveAuthoritativeRecipient(order);
    const txnId = paymentDetails.transactionId || order.razorpay_payment_id || paymentDetails.razorpay_payment_id || 'N/A';
    const amount = paymentDetails.amount || order.total || 0;

    const idempotencyKey = `payment_status:${order.id}:${normalizedStatus}:${txnId !== 'N/A' ? txnId : 'status'}`;

    // 1. Check idempotency record
    const existing = await pool.query(
      `SELECT * FROM public.email_notifications WHERE idempotency_key = $1`,
      [idempotencyKey]
    );

    if (existing.rows.length > 0 && !forceResend) {
      const record = existing.rows[0];
      if (record.status === 'sent') {
        console.log(`[PaymentStatusWorkflow] Status '${normalizedStatus}' already sent for order #${order.order_number}. Skipping.`);
        return { success: true, skipped: true, notificationId: record.id, message: 'Already sent' };
      }
    }

    // Policy: Customers should ONLY receive emails for:
    // 1. Login to the website
    // 2. Order confirmation
    // 3. Successful delivered (with invoice attached)
    // 4. Refund amount (ONLY upon completion: 'Refunded' or 'Completed')
    // 5. Notify me when stock is available
    //
    // All in-process statuses ('Processing', 'In-Review', 'Pending', 'Refund Initiated') and other payment statuses are suppressed.
    const isRefund = normalizedStatus.toLowerCase() === 'refunded' || normalizedStatus.toLowerCase() === 'completed';

    if (!isRefund && !forceResend) {
      console.log(`[PaymentStatusWorkflow] Payment status '${normalizedStatus}' email suppressed. Customer emails are strictly restricted to Order Confirmation, Successful Delivery, Completed Refund Amount, Login, and Stock Restock alerts.`);
      return {
        success: true,
        skipped: true,
        reason: `Customer email for status '${normalizedStatus}' suppressed per notification policy.`
      };
    }

    // 2. Select Status-Specific Subject and Badge
    let subject = '';
    let statusBadgeText = '';
    let statusHeadline = '';
    let statusMessage = '';
    let statusActionBtn = '';
    let eventType = 'PAYMENT_STATUS_UPDATE';

    if (isRefund) {
      const refundAmount = paymentDetails.amount || order.refund_amount || amount;
      subject = `Refund Completed: ${formatINR(refundAmount)} — House of Urvaah Order #${order.order_number}`;
      eventType = 'PAYMENT_REFUNDED';
      statusBadgeText = 'REFUND COMPLETED';
      statusHeadline = 'REFUND COMPLETED';
      statusMessage = `A refund of <strong>${formatINR(refundAmount)}</strong> for Order #${order.order_number} has been completed successfully. Funds will reflect in your account within 5-7 business days depending on your banking provider.`;
      statusActionBtn = `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${FRONTEND_URL}/account" class="mobile-btn" style="background-color: #111111; color: #ffffff !important; padding: 14px 34px; text-decoration: none; font-size: 11px; letter-spacing: 0.25em; text-transform: uppercase; font-family: 'Helvetica Neue', Arial, sans-serif; font-weight: 600; display: inline-block; box-sizing: border-box; max-width: 100%;">
            VIEW STORE ACCOUNT
          </a>
        </div>
      `;
    } else if (normalizedStatus === 'Paid' || normalizedStatus === 'Successful') {
      subject = `Payment Received — House of Urvaah Order #${order.order_number}`;
      eventType = 'PAYMENT_SUCCESS';
      statusBadgeText = 'PAYMENT VERIFIED &bull; SUCCESSFUL';
      statusHeadline = 'PAYMENT CONFIRMATION';
      statusMessage = `We have successfully received your payment of <strong>${formatINR(amount)}</strong> for Order #${order.order_number}. Your piece has moved directly into our tailoring and store preparation workflow.`;
      statusActionBtn = `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${FRONTEND_URL}/account" class="mobile-btn" style="background-color: #111111; color: #ffffff !important; padding: 14px 34px; text-decoration: none; font-size: 11px; letter-spacing: 0.25em; text-transform: uppercase; font-family: 'Helvetica Neue', Arial, sans-serif; font-weight: 600; display: inline-block; box-sizing: border-box; max-width: 100%;">
            TRACK ORDER STATUS
          </a>
        </div>
      `;
    } else if (normalizedStatus === 'Failed') {
      subject = `Payment Update — Action Required for Order #${order.order_number}`;
      eventType = 'PAYMENT_FAILED';
      statusBadgeText = 'TRANSACTION DECLINED';
      statusHeadline = 'PAYMENT UNSUCCESSFUL';
      statusMessage = `We were unable to process your payment for Order #${order.order_number}. Your selected garments are securely reserved in your private session. Please complete payment within 24 hours to secure your order.`;
      statusActionBtn = `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${FRONTEND_URL}/checkout" class="mobile-btn" style="background-color: #111111; color: #ffffff !important; padding: 14px 34px; text-decoration: none; font-size: 11px; letter-spacing: 0.25em; text-transform: uppercase; font-family: 'Helvetica Neue', Arial, sans-serif; font-weight: 600; display: inline-block; box-sizing: border-box; max-width: 100%;">
            RETRY SECURE CHECKOUT
          </a>
        </div>
      `;
    } else {
      // Pending
      subject = `Payment Pending — House of Urvaah Order #${order.order_number}`;
      eventType = 'PAYMENT_PENDING';
      statusBadgeText = 'PAYMENT PENDING';
      statusHeadline = 'PAYMENT STATUS';
      const isCod = String(order.payment_method || '').toLowerCase() === 'cod';
      statusMessage = isCod 
        ? `Your order #${order.order_number} is scheduled for Cash on Delivery. Please have <strong>${formatINR(amount)}</strong> ready upon doorstep delivery.`
        : `Your payment transaction for Order #${order.order_number} is currently awaiting confirmation from your payment provider.`;
      statusActionBtn = `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${FRONTEND_URL}/account" class="mobile-btn" style="background-color: #111111; color: #ffffff !important; padding: 14px 34px; text-decoration: none; font-size: 11px; letter-spacing: 0.25em; text-transform: uppercase; font-family: 'Helvetica Neue', Arial, sans-serif; font-weight: 600; display: inline-block; box-sizing: border-box; max-width: 100%;">
            VIEW ORDER DETAILS
          </a>
        </div>
      `;
    }

    // 3. Insert or update notification record
    let notificationId;
    if (existing.rows.length > 0) {
      notificationId = existing.rows[0].id;
      await pool.query(
        `UPDATE public.email_notifications 
         SET status = 'pending', attempt_count = attempt_count + 1, updated_at = NOW() 
         WHERE id = $1`,
        [notificationId]
      );
    } else {
      const insertRes = await pool.query(
        `INSERT INTO public.email_notifications (
          workflow_type, order_id, order_number, payment_id, customer_id, recipient_email, recipient_name,
          subject, event_type, status, idempotency_key, metadata, created_at, updated_at
        ) VALUES (
          'PAYMENT_STATUS', $1, $2, $3, $4, $5, $6,
          $7, $8, 'pending', $9, $10, NOW(), NOW()
        ) RETURNING id`,
        [
          order.id,
          order.order_number,
          txnId,
          order.user_id,
          recipientEmail,
          recipientName,
          subject,
          eventType,
          idempotencyKey,
          JSON.stringify({ status: normalizedStatus, amount, paymentMethod: order.payment_method })
        ]
      );
      notificationId = insertRes.rows[0].id;
    }

    // 4. Compile HTML Template
    const paymentDate = new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          @media only screen and (max-width: 600px) {
            .email-wrapper { padding: 12px 6px !important; }
            .email-container { padding: 25px 16px !important; width: 100% !important; max-width: 100% !important; }
            .mobile-btn { display: block !important; width: 100% !important; padding: 14px 10px !important; box-sizing: border-box !important; text-align: center !important; }
            .mobile-break { word-break: break-all !important; overflow-wrap: anywhere !important; }
          }
        </style>
      </head>
      <body class="email-wrapper" style="margin: 0; padding: 30px 15px; background-color: #FAF8F5; font-family: 'Georgia', serif; color: #111111;">
        <div class="email-container" style="max-width: 580px; width: 100%; margin: 0 auto; background-color: #ffffff; border: 1px solid #EAE6DF; padding: 45px 35px; box-sizing: border-box;">
          
          <!-- Header -->
          <div style="text-align: center; border-bottom: 1px solid #EAE6DF; padding-bottom: 25px; margin-bottom: 30px;">
            <div style="font-size: 24px; letter-spacing: 0.25em; text-transform: uppercase; font-weight: 400; color: #111111;">
              HOUSE OF URVAAH
            </div>
            <div style="font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase; color: #777777; margin-top: 8px;">
              FINANCIAL SERVICES & STORE ACCOUNTS
            </div>
          </div>

          <!-- Status Pill -->
          <div style="text-align: center; margin-bottom: 20px;">
            <span style="display: inline-block; background-color: #FAF8F5; border: 1px solid #D6D0C5; color: #111111; font-size: 10px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; padding: 6px 18px; font-family: 'Helvetica Neue', Arial, sans-serif;">
              ${statusBadgeText}
            </span>
          </div>

          <!-- Title -->
          <div style="text-align: center; font-size: 20px; font-weight: 400; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 20px; color: #111111;">
            ${statusHeadline}
          </div>

          <!-- Message -->
          <div style="font-size: 14px; line-height: 1.8; color: #4A4A4A; font-family: 'Helvetica Neue', Arial, sans-serif; margin-bottom: 30px; text-align: left;">
            <p>Dear ${recipientName},</p>
            <p>${statusMessage}</p>
          </div>

          <!-- Transaction Card -->
          <div style="background-color: #FAF8F5; border: 1px solid #EAE6DF; padding: 18px 16px; margin-bottom: 30px; box-sizing: border-box;">
            <table style="width: 100%; border-collapse: collapse; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; line-height: 1.6;">
              <tr>
                <td style="padding: 6px 0; color: #777777; text-transform: uppercase; letter-spacing: 0.1em; font-size: 10px; width: 38%; vertical-align: top;">
                  Order Number:
                </td>
                <td style="padding: 6px 0; color: #111111; text-align: right; vertical-align: top; font-weight: 700; width: 62%;">
                  #${order.order_number}
                </td>
              </tr>
              ${txnId && txnId !== 'N/A' ? `
              <tr>
                <td style="padding: 6px 0; color: #777777; text-transform: uppercase; letter-spacing: 0.1em; font-size: 10px; width: 38%; vertical-align: top;">
                  Transaction Ref:
                </td>
                <td style="padding: 6px 0; color: #111111; text-align: right; vertical-align: top; font-family: monospace; font-size: 11px; width: 62%; word-break: break-all; overflow-wrap: anywhere;">
                  ${txnId}
                </td>
              </tr>
              ` : ''}
              <tr>
                <td style="padding: 6px 0; color: #777777; text-transform: uppercase; letter-spacing: 0.1em; font-size: 10px; width: 38%; vertical-align: top;">
                  Amount:
                </td>
                <td style="padding: 6px 0; color: #111111; text-align: right; vertical-align: top; font-weight: 700; font-size: 14px; width: 62%;">
                  ${formatINR(amount)}
                </td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #777777; text-transform: uppercase; letter-spacing: 0.1em; font-size: 10px; width: 38%; vertical-align: top;">
                  Payment Method:
                </td>
                <td style="padding: 6px 0; color: #111111; text-align: right; vertical-align: top; text-transform: uppercase; width: 62%;">
                  ${order.payment_method || 'Online'}
                </td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #777777; text-transform: uppercase; letter-spacing: 0.1em; font-size: 10px; width: 38%; vertical-align: top;">
                  Timestamp:
                </td>
                <td style="padding: 6px 0; color: #111111; text-align: right; vertical-align: top; width: 62%;">
                  ${paymentDate}
                </td>
              </tr>
            </table>
          </div>

          <!-- Action Button -->
          ${statusActionBtn}

          <!-- Footer -->
          <div style="border-top: 1px solid #EAE6DF; padding-top: 25px; margin-top: 35px; text-align: center; font-size: 10px; color: #888888; font-family: 'Helvetica Neue', Arial, sans-serif; line-height: 1.8; letter-spacing: 0.1em; text-transform: uppercase;">
            HOUSE OF URVAAH TREASURY & BILLING<br/>
            EASTERN WINDS, 1402, E WING &bull; KURLA EAST, MUMBAI 400070<br/>
            For inquiries, contact <a href="mailto:${SUPPORT_EMAIL}" style="color: #111111; text-decoration: underline;">${SUPPORT_EMAIL}</a>
          </div>

        </div>
      </body>
      </html>
    `;

    // 5. Dispatch Email
    const dispatchRes = await sendBrevoEmail({
      toEmail: recipientEmail,
      toName: recipientName,
      subject,
      htmlContent
    });

    if (dispatchRes.success) {
      await pool.query(
        `UPDATE public.email_notifications 
         SET status = 'sent', provider_message_id = $1, sent_at = NOW(), updated_at = NOW() 
         WHERE id = $2`,
        [dispatchRes.data || null, notificationId]
      );
      console.log(`[PaymentStatusWorkflow] Dispatched successfully (${normalizedStatus}) to ${recipientEmail} for order #${order.order_number}`);
      return { success: true, notificationId, recipient: recipientEmail };
    } else {
      await pool.query(
        `UPDATE public.email_notifications 
         SET status = 'failed', error_message = $1, updated_at = NOW() 
         WHERE id = $2`,
        [String(dispatchRes.error || 'Provider dispatch failed'), notificationId]
      );
      return { success: false, error: dispatchRes.error, notificationId };
    }

  } catch (err) {
    console.error(`[PaymentStatusWorkflow Error]:`, err.message);
    return { success: false, error: err.message };
  }
};

// ============================================================================
// WORKFLOW 3: PAYMENT INVOICE EMAIL (STRICTLY SEPARATED)
// ============================================================================

/**
 * Triggers Invoice Delivery Email with Attached PDF
 * Eligible: Order must be verified 'Paid' (or confirmed COD by policy).
 * Idempotency: invoice:${order.id}:INV-${order.order_number}
 */
const sendInvoiceWorkflow = async (orderId, options = {}) => {
  const { forceResend = false } = options;

  try {
    const order = await fetchOrderDetails(orderId);
    if (!order) {
      console.error(`[InvoiceWorkflow] Order not found: ${orderId}`);
      return { success: false, error: 'Order not found' };
    }

    const isCod = String(order.payment_method || '').toLowerCase() === 'cod';
    const isPaid = order.payment_status === 'Paid';

    // Business Rule Check: Do not issue a paid invoice for a payment that is still pending or failed!
    if (!isPaid && !isCod) {
      console.warn(`[InvoiceWorkflow] Order #${order.order_number} payment is '${order.payment_status}'. Invoice cannot be issued.`);
      return {
        success: false,
        skipped: true,
        reason: `Order payment status is '${order.payment_status}'. Invoices are only issued for verified paid orders.`
      };
    }

    // Policy Check: The official tax invoice is automatically attached and delivered within sendDeliveryConfirmationWorkflow ('Successful delivered').
    // Standalone invoice email is suppressed for customers to adhere to the strict 5-email notification policy (unless forceResend by admin).
    if (!forceResend) {
      console.log(`[InvoiceWorkflow] Standalone invoice email skipped for Order #${order.order_number}. Official invoice is delivered with Successful Delivery confirmation.`);
      return {
        success: true,
        skipped: true,
        reason: `Standalone invoice email suppressed per notification policy. Tax invoice is attached to Successful Delivery confirmation email.`
      };
    }

    const { email: recipientEmail, name: recipientName } = await resolveAuthoritativeRecipient(order);
    const orderCreatedAt = new Date(order.created_at || Date.now());
    const invYr = orderCreatedAt.getFullYear();
    const invMoNum = orderCreatedAt.getMonth() + 1;
    const invSYr = invMoNum >= 4 ? invYr : invYr - 1;
    const invEYr = invMoNum >= 4 ? invYr + 1 : invYr;
    const invSYr2 = String(invSYr % 100).padStart(2, '0');
    const invEYr2 = String(invEYr % 100).padStart(2, '0');
    const invFY = `${invSYr2}${invEYr2}`;
    const invMo = String(invMoNum).padStart(2, '0');
    let invoiceNumber = order.invoice_number;
    if (invoiceNumber) {
      const stripped = invoiceNumber.replace(/^HOU-/, '');
      const fyMatch = stripped.match(/^(\d{2})?(\d{2})-(\d{2})(\d{2})(\d+)$/);
      if (fyMatch) {
        invoiceNumber = `${fyMatch[2]}${fyMatch[3]}${fyMatch[4]}${fyMatch[5].length === 1 ? '0' + fyMatch[5] : fyMatch[5]}`;
      } else {
        const match = stripped.match(/^(\d{4})(\d{2})(\d+)$/);
        if (match) {
          const rawYr = parseInt(match[1], 10);
          const rawMo = parseInt(match[2], 10);
          const rawSeq = parseInt(match[3], 10);
          const rawSYr = rawMo >= 4 ? rawYr : rawYr - 1;
          const rawEYr = rawMo >= 4 ? rawYr + 1 : rawYr;
          const s2 = String(rawSYr % 100).padStart(2, '0');
          const e2 = String(rawEYr % 100).padStart(2, '0');
          invoiceNumber = `${s2}${e2}${String(rawMo).padStart(2, '0')}${String(rawSeq).padStart(2, '0')}`;
        } else if (/^\d{8,}$/.test(stripped)) {
          invoiceNumber = stripped;
        }
      }
    }
    if (!invoiceNumber || !/^\d{8,}$/.test(invoiceNumber)) {
      invoiceNumber = `${invFY}${invMo}01`;
    }
    const idempotencyKey = `invoice:${order.id}:${invoiceNumber}`;

    // 1. Check idempotency record
    const existing = await pool.query(
      `SELECT * FROM public.email_notifications WHERE idempotency_key = $1`,
      [idempotencyKey]
    );

    if (existing.rows.length > 0 && !forceResend) {
      const record = existing.rows[0];
      if (record.status === 'sent') {
        console.log(`[InvoiceWorkflow] Invoice email already sent for invoice ${invoiceNumber} (order #${order.order_number}). Skipping duplicate.`);
        return { success: true, skipped: true, notificationId: record.id, message: 'Already sent' };
      }
    }

    const subject = `Your House of Urvaah Invoice — ${invoiceNumber}`;
    const secureToken = crypto.randomBytes(32).toString('hex');
    const attachmentFilename = `HOUSE_OF_URVAAH_INVOICE_${invoiceNumber}.pdf`;

    // 2. Insert or update notification record to 'pending'
    let notificationId;
    if (existing.rows.length > 0) {
      notificationId = existing.rows[0].id;
      await pool.query(
        `UPDATE public.email_notifications 
         SET status = 'pending', attempt_count = attempt_count + 1, updated_at = NOW() 
         WHERE id = $1`,
        [notificationId]
      );
    } else {
      const insertRes = await pool.query(
        `INSERT INTO public.email_notifications (
          workflow_type, order_id, order_number, invoice_number, payment_id, customer_id, recipient_email, recipient_name,
          subject, event_type, status, has_attachment, attachment_name, secure_token, idempotency_key, metadata, created_at, updated_at
        ) VALUES (
          'INVOICE', $1, $2, $3, $4, $5, $6, $7,
          $8, 'INVOICE_ISSUED', 'pending', true, $9, $10, $11, $12, NOW(), NOW()
        ) RETURNING id`,
        [
          order.id,
          order.order_number,
          invoiceNumber,
          order.razorpay_payment_id || null,
          order.user_id,
          recipientEmail,
          recipientName,
          subject,
          attachmentFilename,
          secureToken,
          idempotencyKey,
          JSON.stringify({ total: order.total, invoiceNumber })
        ]
      );
      notificationId = insertRes.rows[0].id;
    }

    // 3. Generate authoritative PDF Invoice Buffer via invoiceService
    let pdfBuffer;
    try {
      console.log(`[InvoiceWorkflow] Generating PDF invoice for Order ID ${order.id}...`);
      pdfBuffer = await invoiceService.generateInvoicePDF(order.id, { customerView: true });
      console.log(`[InvoiceWorkflow] PDF invoice generated successfully (${pdfBuffer.length} bytes).`);
    } catch (pdfErr) {
      console.error(`[InvoiceWorkflow] PDF generation failed:`, pdfErr.message);
      await pool.query(
        `UPDATE public.email_notifications 
         SET status = 'failed', error_message = $1, updated_at = NOW() 
         WHERE id = $2`,
        [`PDF generation failed: ${pdfErr.message}`, notificationId]
      );
      return { success: false, error: `PDF generation failed: ${pdfErr.message}`, notificationId };
    }

    // 4. Compile Branded Invoice Email HTML
    const invoiceDate = new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const downloadLink = `${FRONTEND_URL}/account`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          @media only screen and (max-width: 600px) {
            .email-wrapper { padding: 12px 6px !important; }
            .email-container { padding: 25px 16px !important; width: 100% !important; max-width: 100% !important; }
            .mobile-btn { display: block !important; width: 100% !important; padding: 14px 10px !important; box-sizing: border-box !important; text-align: center !important; }
            .mobile-break { word-break: break-all !important; overflow-wrap: anywhere !important; }
          }
        </style>
      </head>
      <body class="email-wrapper" style="margin: 0; padding: 30px 15px; background-color: #FAF8F5; font-family: 'Georgia', serif; color: #111111;">
        <div class="email-container" style="max-width: 600px; width: 100%; margin: 0 auto; background-color: #ffffff; border: 1px solid #EAE6DF; padding: 45px 35px; box-sizing: border-box;">
          
          <!-- Header -->
          <div style="text-align: center; border-bottom: 1px solid #EAE6DF; padding-bottom: 25px; margin-bottom: 30px;">
            <div style="font-size: 24px; letter-spacing: 0.25em; text-transform: uppercase; font-weight: 400; color: #111111;">
              HOUSE OF URVAAH
            </div>
            <div style="font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase; color: #777777; margin-top: 8px;">
              OFFICIAL STORE TAX INVOICE
            </div>
          </div>

          <!-- Status Badge -->
          <div style="text-align: center; margin-bottom: 20px;">
            <span style="display: inline-block; background-color: #FAF8F5; border: 1px solid #D6D0C5; color: #111111; font-size: 10px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; padding: 6px 18px; font-family: 'Helvetica Neue', Arial, sans-serif;">
              TAX INVOICE ISSUED &bull; PDF ATTACHED
            </span>
          </div>

          <!-- Greeting -->
          <div style="margin-bottom: 25px;">
            <div style="font-size: 16px; font-weight: 400; margin-bottom: 10px; color: #111111;">
              Dear ${recipientName},
            </div>
            <p style="font-size: 13px; line-height: 1.8; color: #4A4A4A; font-family: 'Helvetica Neue', Arial, sans-serif; margin: 0;">
              Please find attached your official tax invoice <strong>#${invoiceNumber}</strong> for House of Urvaah Order 
              <strong>#${order.order_number}</strong>.
            </p>
          </div>

          <!-- Invoice Details Card -->
          <div style="background-color: #FAF8F5; border: 1px solid #EAE6DF; padding: 18px 16px; margin-bottom: 30px; box-sizing: border-box;">
            <table style="width: 100%; border-collapse: collapse; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; line-height: 1.6;">
              <tr>
                <td style="padding: 6px 0; color: #777777; text-transform: uppercase; letter-spacing: 0.1em; font-size: 10px; width: 40%; vertical-align: top;">
                  Invoice Number:
                </td>
                <td style="padding: 6px 0; color: #111111; text-align: right; vertical-align: top; font-weight: 700; width: 60%; word-break: break-all; overflow-wrap: anywhere;">
                  ${invoiceNumber}
                </td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #777777; text-transform: uppercase; letter-spacing: 0.1em; font-size: 10px; width: 40%; vertical-align: top;">
                  Order Number:
                </td>
                <td style="padding: 6px 0; color: #111111; text-align: right; vertical-align: top; width: 60%;">
                  #${order.order_number}
                </td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #777777; text-transform: uppercase; letter-spacing: 0.1em; font-size: 10px; width: 40%; vertical-align: top;">
                  Issue Date:
                </td>
                <td style="padding: 6px 0; color: #111111; text-align: right; vertical-align: top; width: 60%;">
                  ${invoiceDate}
                </td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #777777; text-transform: uppercase; letter-spacing: 0.1em; font-size: 10px; width: 40%; vertical-align: top;">
                  Total Amount:
                </td>
                <td style="padding: 6px 0; color: #111111; text-align: right; vertical-align: top; font-weight: 700; font-size: 14px; width: 60%;">
                  ${formatINR(order.total)}
                </td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #777777; text-transform: uppercase; letter-spacing: 0.1em; font-size: 10px; width: 40%; vertical-align: top;">
                  Payment Status:
                </td>
                <td style="padding: 6px 0; color: #2E7D32; text-align: right; vertical-align: top; font-weight: 700; text-transform: uppercase; width: 60%;">
                  ${isPaid ? 'PAID IN FULL' : 'COD (PAYABLE ON DELIVERY)'}
                </td>
              </tr>
            </table>
          </div>

          <!-- Attachment Notice -->
          <div style="border: 1px dashed #D6D0C5; padding: 15px; margin-bottom: 30px; text-align: center; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #555555; word-break: break-all; overflow-wrap: anywhere;">
            📄 <strong>${attachmentFilename}</strong> has been attached to this email for your accounting records.
          </div>

          <!-- Action Button -->
          <div style="text-align: center; margin: 30px 0 20px 0;">
            <a href="${downloadLink}" class="mobile-btn" style="background-color: #111111; color: #ffffff !important; padding: 14px 34px; text-decoration: none; font-size: 11px; letter-spacing: 0.25em; text-transform: uppercase; font-family: 'Helvetica Neue', Arial, sans-serif; font-weight: 600; display: inline-block; box-sizing: border-box; max-width: 100%;">
              ACCESS INVOICE IN HOUSE OF URVAAH ACCOUNT
            </a>
          </div>

          <!-- Footer -->
          <div style="border-top: 1px solid #EAE6DF; padding-top: 25px; margin-top: 35px; text-align: center; font-size: 10px; color: #888888; font-family: 'Helvetica Neue', Arial, sans-serif; line-height: 1.8; letter-spacing: 0.1em; text-transform: uppercase;">
            HOUSE OF URVAAH &bull; OFFICIAL TAX INVOICE<br/>
            GSTIN &bull; REGISTERED LUXURY HOUSE<br/>
            For questions regarding this invoice, email <a href="mailto:${SUPPORT_EMAIL}" style="color: #111111; text-decoration: underline;">${SUPPORT_EMAIL}</a>
          </div>

        </div>
      </body>
      </html>
    `;

    // 5. Dispatch with PDF attachment
    const dispatchRes = await sendBrevoEmail({
      toEmail: recipientEmail,
      toName: recipientName,
      subject,
      htmlContent,
      attachments: [
        {
          filename: attachmentFilename,
          name: attachmentFilename,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    });

    if (dispatchRes.success) {
      await pool.query(
        `UPDATE public.email_notifications 
         SET status = 'sent', provider_message_id = $1, sent_at = NOW(), updated_at = NOW() 
         WHERE id = $2`,
        [dispatchRes.data || null, notificationId]
      );
      console.log(`[InvoiceWorkflow] Dispatched successfully with PDF to ${recipientEmail} for invoice #${invoiceNumber}`);
      return { success: true, notificationId, recipient: recipientEmail, invoiceNumber };
    } else {
      await pool.query(
        `UPDATE public.email_notifications 
         SET status = 'failed', error_message = $1, updated_at = NOW() 
         WHERE id = $2`,
        [String(dispatchRes.error || 'Provider dispatch failed'), notificationId]
      );
      return { success: false, error: dispatchRes.error, notificationId };
    }

  } catch (err) {
    console.error(`[InvoiceWorkflow Error]:`, err.message);
    return { success: false, error: err.message };
  }
};

// ============================================================================
// WORKFLOW 4: DELIVERY CONFIRMATION & INVOICE & FEEDBACK EMAIL
// ============================================================================

/**
 * Triggers Order Delivery Confirmation Email with Attached PDF Invoice & Product Feedback Links
 * Eligible: Order or item status is 'Delivered'
 * Idempotency: order_delivered:${order.id}
 */
const sendDeliveryConfirmationWorkflow = async (orderId, options = {}) => {
  const { forceResend = false } = options;

  try {
    const order = await fetchOrderDetails(orderId);
    if (!order) {
      console.error(`[DeliveryConfirmationWorkflow] Order not found: ${orderId}`);
      return { success: false, error: 'Order not found' };
    }

    const { email: recipientEmail, name: recipientName } = await resolveAuthoritativeRecipient(order);
    const idempotencyKey = `order_delivered:${order.id}`;

    // 1. Check idempotency record
    const existing = await pool.query(
      `SELECT * FROM public.email_notifications WHERE idempotency_key = $1`,
      [idempotencyKey]
    );

    if (existing.rows.length > 0 && !forceResend) {
      const record = existing.rows[0];
      if (record.status === 'sent') {
        console.log(`[DeliveryConfirmationWorkflow] Delivery confirmation email already sent for order #${order.order_number}. Skipping duplicate.`);
        return { success: true, skipped: true, notificationId: record.id, message: 'Already sent' };
      }
    }

    const orderCreatedAt = new Date(order.created_at || Date.now());
    const invYr = orderCreatedAt.getFullYear();
    const invMoNum = orderCreatedAt.getMonth() + 1;
    const invSYr = invMoNum >= 4 ? invYr : invYr - 1;
    const invEYr = invMoNum >= 4 ? invYr + 1 : invYr;
    const invSYr2 = String(invSYr % 100).padStart(2, '0');
    const invEYr2 = String(invEYr % 100).padStart(2, '0');
    const invFY = `${invSYr2}${invEYr2}`;
    const invMo = String(invMoNum).padStart(2, '0');
    let invoiceNumber = order.invoice_number;
    if (invoiceNumber) {
      const stripped = invoiceNumber.replace(/^HOU-/, '');
      const fyMatch = stripped.match(/^(\d{2})?(\d{2})-(\d{2})(\d{2})(\d+)$/);
      if (fyMatch) {
        invoiceNumber = `${fyMatch[2]}${fyMatch[3]}${fyMatch[4]}${fyMatch[5].length === 1 ? '0' + fyMatch[5] : fyMatch[5]}`;
      } else {
        const match = stripped.match(/^(\d{4})(\d{2})(\d+)$/);
        if (match) {
          const rawYr = parseInt(match[1], 10);
          const rawMo = parseInt(match[2], 10);
          const rawSeq = parseInt(match[3], 10);
          const rawSYr = rawMo >= 4 ? rawYr : rawYr - 1;
          const rawEYr = rawMo >= 4 ? rawYr + 1 : rawYr;
          const s2 = String(rawSYr % 100).padStart(2, '0');
          const e2 = String(rawEYr % 100).padStart(2, '0');
          invoiceNumber = `${s2}${e2}${String(rawMo).padStart(2, '0')}${String(rawSeq).padStart(2, '0')}`;
        } else if (/^\d{8,}$/.test(stripped)) {
          invoiceNumber = stripped;
        }
      }
    }
    if (!invoiceNumber || !/^\d{8,}$/.test(invoiceNumber)) {
      invoiceNumber = `${invFY}${invMo}01`;
    }
    const attachmentFilename = `HOUSE_OF_URVAAH_INVOICE_${invoiceNumber}.pdf`;
    const subject = `Delivered: Your House of Urvaah Order #${order.order_number} has arrived`;

    // 2. Generate PDF Invoice Buffer via invoiceService
    let pdfBuffer = null;
    try {
      console.log(`[DeliveryConfirmationWorkflow] Generating PDF invoice for Order #${order.order_number}...`);
      pdfBuffer = await invoiceService.generateInvoicePDF(order.id, { customerView: true });
      console.log(`[DeliveryConfirmationWorkflow] PDF invoice generated successfully (${pdfBuffer.length} bytes).`);
    } catch (pdfErr) {
      console.warn(`[DeliveryConfirmationWorkflow] PDF generation warning: ${pdfErr.message}. Email dispatch will proceed.`);
    }

    // 3. Insert or update notification record to 'pending'
    let notificationId;
    if (existing.rows.length > 0) {
      notificationId = existing.rows[0].id;
      await pool.query(
        `UPDATE public.email_notifications 
         SET status = 'pending', attempt_count = attempt_count + 1, updated_at = NOW() 
         WHERE id = $1`,
        [notificationId]
      );
    } else {
      const insertRes = await pool.query(
        `INSERT INTO public.email_notifications (
          workflow_type, order_id, order_number, invoice_number, customer_id, recipient_email, recipient_name,
          subject, event_type, status, has_attachment, attachment_name, idempotency_key, metadata, created_at, updated_at
        ) VALUES (
          'DELIVERY_CONFIRMATION', $1, $2, $3, $4, $5, $6,
          $7, 'ORDER_DELIVERED', 'pending', $8, $9, $10, $11, NOW(), NOW()
        ) RETURNING id`,
        [
          order.id,
          order.order_number,
          invoiceNumber,
          order.user_id,
          recipientEmail,
          recipientName,
          subject,
          Boolean(pdfBuffer),
          attachmentFilename,
          idempotencyKey,
          JSON.stringify({ total: order.total, itemCount: (order.items || []).length })
        ]
      );
      notificationId = insertRes.rows[0].id;
    }

    // 4. Compile Product Feedback Cards and Links
    const items = order.items || [];
    const publicUrl = getPublicFrontendUrl();
    const itemsHtml = items.map((item) => {
      const prodId = item.product_id || item.productId || (item.product && (item.product.id || item.product.product_id)) || item.id;
      const feedbackUrl = `${publicUrl}/product/${prodId}?openReview=true#customer-reviews`;
      const itemPrice = parseFloat(item.price || 0);
      const itemQty = parseInt(item.quantity || 1, 10);
      const variantText = item.size ? `Size: ${item.size}` : '';

      return `
        <div style="background-color: #FAF8F5; border: 1px solid #EAE6DF; padding: 18px 16px; margin-bottom: 14px; font-family: 'Helvetica Neue', Arial, sans-serif; box-sizing: border-box;">
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
            <tr>
              <td style="vertical-align: top;">
                <div style="font-weight: 600; color: #111111; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; line-height: 1.4;">
                  ${item.name || item.title || 'Store Creation'}
                </div>
                ${variantText ? `<div style="font-size: 11px; color: #777777; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.08em;">${variantText} &bull; Qty: ${itemQty}</div>` : `<div style="font-size: 11px; color: #777777; margin-top: 4px;">Qty: ${itemQty}</div>`}
              </td>
              <td style="vertical-align: top; text-align: right; white-space: nowrap; padding-left: 12px;">
                <div style="font-size: 13px; font-weight: 700; color: #111111;">
                  ${formatINR(itemPrice * itemQty)}
                </div>
              </td>
            </tr>
          </table>
          <div style="border-top: 1px dashed #EAE6DF; padding-top: 12px; text-align: center;">
            <a href="${feedbackUrl}" class="mobile-btn" style="background-color: #111111; color: #ffffff !important; padding: 11px 18px; text-decoration: none; font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; font-family: 'Helvetica Neue', Arial, sans-serif; font-weight: 700; display: block; text-align: center; box-sizing: border-box; width: 100%;">
              ★ RATE &amp; SHARE FEEDBACK
            </a>
          </div>
        </div>
      `;
    }).join('');

    const deliveryDate = new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const accountUrl = `${publicUrl}/account`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          @media only screen and (max-width: 600px) {
            .email-wrapper { padding: 12px 6px !important; }
            .email-container { padding: 25px 16px !important; width: 100% !important; max-width: 100% !important; }
            .mobile-btn { display: block !important; width: 100% !important; padding: 13px 10px !important; box-sizing: border-box !important; text-align: center !important; }
            .mobile-break { word-break: break-all !important; overflow-wrap: anywhere !important; }
          }
        </style>
      </head>
      <body class="email-wrapper" style="margin: 0; padding: 30px 15px; background-color: #FAF8F5; font-family: 'Georgia', serif; color: #111111;">
        <div class="email-container" style="max-width: 620px; width: 100%; margin: 0 auto; background-color: #ffffff; border: 1px solid #EAE6DF; padding: 45px 35px; box-sizing: border-box;">
          
          <!-- Header -->
          <div style="text-align: center; border-bottom: 1px solid #EAE6DF; padding-bottom: 25px; margin-bottom: 30px;">
            <div style="font-size: 24px; letter-spacing: 0.25em; text-transform: uppercase; font-weight: 400; color: #111111;">
              HOUSE OF URVAAH
            </div>
            <div style="font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase; color: #777777; margin-top: 8px;">
              DELIVERY CONFIRMATION &bull; CUSTOMER CARE DESK
            </div>
          </div>

          <!-- Status Badge -->
          <div style="text-align: center; margin-bottom: 20px;">
            <span style="display: inline-block; background-color: #ECFDF5; border: 1px solid #A7F3D0; color: #065F46; font-size: 10px; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; padding: 7px 20px; font-family: 'Helvetica Neue', Arial, sans-serif;">
              ✓ DELIVERED SUCCESSFULLY
            </span>
          </div>

          <!-- Greeting -->
          <div style="margin-bottom: 25px;">
            <div style="font-size: 17px; font-weight: 400; margin-bottom: 10px; color: #111111;">
              Dear ${recipientName},
            </div>
            <p style="font-size: 13px; line-height: 1.8; color: #4A4A4A; font-family: 'Helvetica Neue', Arial, sans-serif; margin: 0;">
              We are delighted to confirm that your House of Urvaah order <strong>#${order.order_number}</strong> has been successfully delivered on <strong>${deliveryDate}</strong>.
            </p>
            <p style="font-size: 13px; line-height: 1.8; color: #4A4A4A; font-family: 'Helvetica Neue', Arial, sans-serif; margin-top: 10px;">
              We hope your store creation brings you timeless confidence and elegance.
            </p>
          </div>

          <!-- Share Your Feedback Section -->
          <div style="margin: 30px 0 25px 0;">
            <div style="font-size: 12px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #111111; margin-bottom: 8px; font-family: 'Helvetica Neue', Arial, sans-serif;">
              HOW WAS YOUR EXPERIENCE?
            </div>
            <p style="font-size: 12px; color: #666666; font-family: 'Helvetica Neue', Arial, sans-serif; margin: 0 0 16px 0; line-height: 1.6;">
              Your thoughts inspire our craftsmanship. Please take a moment to rate your delivered piece and share your fit impressions.
            </p>
            ${itemsHtml}
          </div>

          <!-- Invoice Attachment Notice Card -->
          <div style="background-color: #FAF8F5; border: 1px solid #EAE6DF; padding: 20px; margin: 25px 0; font-family: 'Helvetica Neue', Arial, sans-serif; box-sizing: border-box;">
            <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: #111111; margin-bottom: 8px;">
              OFFICIAL TAX INVOICE ATTACHED
            </div>
            <p style="font-size: 12px; color: #555555; line-height: 1.6; margin: 0 0 12px 0;">
              Your official Tax Invoice <strong>#${invoiceNumber}</strong> is attached to this email as a PDF document (<code class="mobile-break" style="word-break: break-all; overflow-wrap: anywhere; font-family: monospace; font-size: 11px; background-color: #F0EDE8; padding: 2px 4px;">${attachmentFilename}</code>) for your records.
            </p>
            <div style="font-size: 11px; color: #777777;">
              Order Total: <strong style="color: #111111;">${formatINR(order.total)}</strong> &bull; Date: ${deliveryDate}
            </div>
          </div>

          <!-- Account Access CTA -->
          <div style="text-align: center; margin: 30px 0 15px 0;">
            <a href="${accountUrl}" class="mobile-btn" style="background-color: #111111; color: #ffffff !important; padding: 14px 34px; text-decoration: none; font-size: 11px; letter-spacing: 0.25em; text-transform: uppercase; font-family: 'Helvetica Neue', Arial, sans-serif; font-weight: 600; display: inline-block; box-sizing: border-box; max-width: 100%;">
              MANAGE ORDER IN HOUSE OF URVAAH ACCOUNT
            </a>
          </div>

          <!-- Footer -->
          <div style="border-top: 1px solid #EAE6DF; padding-top: 25px; margin-top: 35px; text-align: center; font-size: 10px; color: #888888; font-family: 'Helvetica Neue', Arial, sans-serif; line-height: 1.8; letter-spacing: 0.1em; text-transform: uppercase;">
            HOUSE OF URVAAH &bull; BESPOKE LUXURY HOUSE<br/>
            EASTERN WINDS, 1402, E WING &bull; KURLA EAST, MUMBAI 400070<br/>
            For customer care assistance, reach us at <a href="mailto:${SUPPORT_EMAIL}" style="color: #111111; text-decoration: underline;">${SUPPORT_EMAIL}</a>
          </div>

        </div>
      </body>
      </html>
    `;

    // 5. Dispatch Email with PDF attachment (if generated)
    const emailAttachments = [];
    if (pdfBuffer) {
      emailAttachments.push({
        filename: attachmentFilename,
        name: attachmentFilename,
        content: pdfBuffer,
        contentType: 'application/pdf'
      });
    }

    const dispatchRes = await sendBrevoEmail({
      toEmail: recipientEmail,
      toName: recipientName,
      subject,
      htmlContent,
      attachments: emailAttachments
    });

    if (dispatchRes.success) {
      await pool.query(
        `UPDATE public.email_notifications 
         SET status = 'sent', provider_message_id = $1, sent_at = NOW(), updated_at = NOW() 
         WHERE id = $2`,
        [dispatchRes.data || null, notificationId]
      );
      console.log(`[DeliveryConfirmationWorkflow] Dispatched successfully to ${recipientEmail} for order #${order.order_number}`);
      return { success: true, notificationId, recipient: recipientEmail, invoiceNumber };
    } else {
      await pool.query(
        `UPDATE public.email_notifications 
         SET status = 'failed', error_message = $1, updated_at = NOW() 
         WHERE id = $2`,
        [String(dispatchRes.error || 'Provider dispatch failed'), notificationId]
      );
      return { success: false, error: dispatchRes.error, notificationId };
    }

  } catch (err) {
    console.error(`[DeliveryConfirmationWorkflow Error]:`, err.message);
    return { success: false, error: err.message };
  }
};

// ============================================================================
// ADMIN ACTIONS & QUERY UTILITIES
// ============================================================================

/**
 * Retries a failed or pending email notification safely
 */
const retryNotification = async (notificationId) => {
  const result = await pool.query(
    `SELECT * FROM public.email_notifications WHERE id = $1`,
    [notificationId]
  );
  if (result.rows.length === 0) throw new Error('Notification record not found');
  const record = result.rows[0];

  if (record.status === 'sent') {
    return { success: true, message: 'Email has already been sent successfully', record };
  }

  // Increment attempt count for audit trail on manual retry
  await pool.query(
    `UPDATE public.email_notifications 
     SET attempt_count = attempt_count + 1, status = 'pending', updated_at = NOW() 
     WHERE id = $1`,
    [notificationId]
  );

  if (record.workflow_type === 'ORDER_CONFIRMATION') {
    return await sendOrderConfirmationWorkflow(record.order_id, { forceResend: true });
  } else if (record.workflow_type === 'PAYMENT_STATUS') {
    const meta = record.metadata || {};
    return await sendPaymentStatusWorkflow(
      record.order_id, 
      meta.status || 'Paid', 
      { transactionId: record.payment_id, amount: meta.amount }, 
      { forceResend: true }
    );
  } else if (record.workflow_type === 'INVOICE') {
    return await sendInvoiceWorkflow(record.order_id, { forceResend: true });
  } else if (record.workflow_type === 'DELIVERY_CONFIRMATION') {
    return await sendDeliveryConfirmationWorkflow(record.order_id, { forceResend: true });
  } else {
    throw new Error(`Unknown workflow type: ${record.workflow_type}`);
  }
};

/**
 * Fetches filtered email notification records for Admin Panel
 */
const getEmailNotifications = async (options = {}) => {
  const {
    workflowType,
    status,
    search,
    limit = 20,
    offset = 0,
    startDate,
    endDate
  } = options;

  let query = `FROM public.email_notifications WHERE 1=1`;
  const params = [];
  let pIdx = 1;

  if (workflowType && workflowType !== 'all') {
    query += ` AND workflow_type = $${pIdx++}`;
    params.push(workflowType);
  }

  if (status && status !== 'all') {
    query += ` AND status = $${pIdx++}`;
    params.push(status);
  }

  if (search && search.trim()) {
    query += ` AND (order_number ILIKE $${pIdx} OR recipient_email ILIKE $${pIdx} OR invoice_number ILIKE $${pIdx} OR recipient_name ILIKE $${pIdx})`;
    params.push(`%${search.trim()}%`);
    pIdx++;
  }

  if (startDate) {
    query += ` AND created_at >= $${pIdx++}`;
    params.push(startDate);
  }

  if (endDate) {
    query += ` AND created_at <= $${pIdx++}`;
    params.push(endDate);
  }

  const countRes = await pool.query(`SELECT COUNT(*) ${query}`, params);
  const total = parseInt(countRes.rows[0].count, 10);

  const selectQuery = `
    SELECT id, workflow_type, order_id, order_number, payment_id, invoice_number,
           customer_id, recipient_email, recipient_name, subject, event_type,
           status, provider, provider_message_id, attempt_count, error_message,
           has_attachment, attachment_name, metadata, sent_at, created_at, updated_at
    ${query}
    ORDER BY created_at DESC
    LIMIT $${pIdx++} OFFSET $${pIdx++}
  `;
  params.push(limit, offset);

  const rowsRes = await pool.query(selectQuery, params);

  return {
    notifications: rowsRes.rows,
    total,
    limit,
    offset
  };
};

/**
 * Fetches high-level stats for the Email Notifications dashboard
 */
const getEmailNotificationStats = async () => {
  const res = await pool.query(`
    SELECT
      COUNT(*) as total_notifications,
      COUNT(*) FILTER (WHERE workflow_type = 'ORDER_CONFIRMATION') as order_confirmations,
      COUNT(*) FILTER (WHERE workflow_type = 'PAYMENT_STATUS') as payment_updates,
      COUNT(*) FILTER (WHERE workflow_type = 'INVOICE') as invoice_emails,
      COUNT(*) FILTER (WHERE workflow_type = 'DELIVERY_CONFIRMATION') as delivery_confirmations,
      COUNT(*) FILTER (WHERE status = 'sent') as sent_count,
      COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
      COUNT(*) FILTER (WHERE status = 'pending') as pending_count
    FROM public.email_notifications
  `);

  return res.rows[0];
};

/**
 * Safely downloads an invoice PDF using a one-time/expiring secure token
 */
const downloadInvoiceByToken = async (token) => {
  if (!token || typeof token !== 'string') {
    throw new Error('Valid security token is required');
  }

  const res = await pool.query(
    `SELECT * FROM public.email_notifications 
     WHERE secure_token = $1 AND workflow_type = 'INVOICE' 
     LIMIT 1`,
    [token.trim()]
  );

  if (res.rows.length === 0) {
    throw new Error('Invalid or expired invoice token');
  }

  const notification = res.rows[0];
  // Emailed links are customer-facing: same delivered-items-only rule as the in-app download
  const pdfBuffer = await invoiceService.generateInvoicePDF(notification.order_id, { customerView: true });
  const filename = notification.attachment_name || `HOUSE_OF_URVAAH_INV_${notification.order_number}.pdf`;

  return { pdfBuffer, filename, notification };
};

module.exports = {
  getPublicFrontendUrl,
  resolveAuthoritativeRecipient,
  sendOrderConfirmationWorkflow,
  sendPaymentStatusWorkflow,
  sendInvoiceWorkflow,
  sendDeliveryConfirmationWorkflow,
  retryNotification,
  getEmailNotifications,
  getEmailNotificationStats,
  downloadInvoiceByToken
};
