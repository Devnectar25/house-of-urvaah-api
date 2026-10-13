/**
 * Integration Test Suite: House of Urvaah Email Notification Workflows
 * 
 * Verifies:
 * 1. Concurrent Recipient Isolation (Customer A vs Customer B).
 * 2. Workflow 1: Order Confirmation Email dispatch & idempotency.
 * 3. Workflow 2: Payment Status transitions ('Paid', 'Failed', 'Refunded') & false-success prevention.
 * 4. Webhook duplicate handling & idempotency deduplication.
 * 5. Workflow 3: Invoice PDF attachment generation & payment-eligibility rules.
 * 6. Token security & cross-customer invoice isolation.
 * 7. Safe 1-click retry handling without duplicate sends.
 */

const pool = require('../src/config/db');
const orderEmailService = require('../src/services/orderEmailService');
const invoiceService = require('../src/services/invoiceService');

const runTests = async () => {
  console.log('================================================================');
  console.log('🏛️  HOUSE OF URVAAH — EMAIL NOTIFICATION SYSTEM INTEGRATION TESTS');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition, title) => {
    if (condition) {
      console.log(`  ✅ PASS: ${title}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${title}`);
      failed++;
    }
  };

  const client = await pool.connect();

  try {
    // -------------------------------------------------------------------------
    // SETUP: Provision isolated test patrons and orders
    // -------------------------------------------------------------------------
    console.log('📦 Setting up test fixtures...');

    const timestamp = Date.now();
    const userA_id = `test_patron_a_${timestamp}`;
    const userB_id = `test_patron_b_${timestamp}`;
    const emailA = `patron_a_${timestamp}@houseofurvaah-test.com`;
    const emailB = `patron_b_${timestamp}@houseofurvaah-test.com`;

    // Insert Test Users
    await client.query(`
      INSERT INTO public.users (username, emailid, fullname, contactno, password, active, createdate)
      VALUES 
        ($1, $2, 'Lady Catherine Ashton', '+919876543210', 'test_pw', true, NOW()),
        ($3, $4, 'Lord Julian Sterling', '+919876543211', 'test_pw', true, NOW())
      ON CONFLICT (username) DO NOTHING
    `, [userA_id, emailA, userB_id, emailB]);

    // Insert Test Addresses
    const addrARes = await client.query(`
      INSERT INTO public.user_addresses (user_id, address_label, recipient_name, full_address, city, state, postal_code, phone)
      VALUES ($1, 'Townhouse', 'Lady Catherine Ashton', '12 Kensington High Street', 'Mumbai', 'Maharashtra', '400001', '+919876543210')
      RETURNING id
    `, [userA_id]);
    const addrA_id = addrARes.rows[0].id;

    const addrBRes = await client.query(`
      INSERT INTO public.user_addresses (user_id, address_label, recipient_name, full_address, city, state, postal_code, phone)
      VALUES ($1, 'Estate', 'Lord Julian Sterling', '44 Mayfair Gardens', 'Bengaluru', 'Karnataka', '560001', '+919876543211')
      RETURNING id
    `, [userB_id]);
    const addrB_id = addrBRes.rows[0].id;

    // Insert Order A (Online Payment, Paid)
    const orderNumA = `URV-TEST-A-${timestamp}`;
    const orderARes = await client.query(`
      INSERT INTO public.orders (
        user_id, order_number, address_id, payment_method, payment_status, total, subtotal, shipping, status, razorpay_payment_id, created_at, updated_at
      ) VALUES ($1, $2, $3, 'card', 'Paid', 8500.00, 8500.00, 0, 'Confirmed', 'pay_test_txn_A_${timestamp}', NOW(), NOW())
      RETURNING *
    `, [userA_id, orderNumA, addrA_id]);
    const orderA = orderARes.rows[0];

    // Insert Order B (Online Payment, Failed / Pending)
    const orderNumB = `URV-TEST-B-${timestamp}`;
    const orderBRes = await client.query(`
      INSERT INTO public.orders (
        user_id, order_number, address_id, payment_method, payment_status, total, subtotal, shipping, status, razorpay_payment_id, created_at, updated_at
      ) VALUES ($1, $2, $3, 'upi', 'Failed', 12400.00, 12400.00, 0, 'Cancelled', 'pay_test_txn_B_${timestamp}', NOW(), NOW())
      RETURNING *
    `, [userB_id, orderNumB, addrB_id]);
    const orderB = orderBRes.rows[0];

    // Insert Order Items for Order A
    await client.query(`
      INSERT INTO public.order_items (order_id, product_id, name, price, quantity, created_at)
      VALUES 
        ($1, 106, 'Sage Bloom Embroidered Corset', 8500.00, 1, NOW())
    `, [orderA.id]);

    // Insert Order Items for Order B
    await client.query(`
      INSERT INTO public.order_items (order_id, product_id, name, price, quantity, created_at)
      VALUES 
        ($1, 102, 'Elysian Silk Evening Gown', 12400.00, 1, NOW())
    `, [orderB.id]);

    console.log('✅ Fixtures created successfully.\n');

    // -------------------------------------------------------------------------
    // TEST 1 & 2: Authoritative Recipient Isolation Under Concurrency
    // -------------------------------------------------------------------------
    console.log('--- TEST SUITE 1: Recipient Resolution & Strict Customer Isolation ---');

    const [recipientA, recipientB] = await Promise.all([
      orderEmailService.resolveAuthoritativeRecipient(orderA),
      orderEmailService.resolveAuthoritativeRecipient(orderB)
    ]);

    assert(recipientA.email === emailA, `Order A strictly resolves to Customer A email (${emailA})`);
    assert(recipientB.email === emailB, `Order B strictly resolves to Customer B email (${emailB})`);
    assert(recipientA.email !== recipientB.email, `Zero recipient crossover between concurrent customers`);
    assert(recipientA.name === 'Lady Catherine Ashton', `Customer A recipient name is resolved correctly`);
    assert(recipientB.name === 'Lord Julian Sterling', `Customer B recipient name is resolved correctly`);

    // -------------------------------------------------------------------------
    // TEST 3: Workflow 1 — Order Confirmation Email
    // -------------------------------------------------------------------------
    console.log('\n--- TEST SUITE 2: Workflow 1 — Order Confirmation Email ---');

    const orderConfRes = await orderEmailService.sendOrderConfirmationWorkflow(orderA.id);
    assert(orderConfRes.success === true, `Order confirmation workflow executed successfully`);

    const notifConfCheck = await client.query(`
      SELECT * FROM public.email_notifications 
      WHERE order_id = $1 AND workflow_type = 'ORDER_CONFIRMATION'
    `, [orderA.id]);
    assert(notifConfCheck.rows.length === 1, `Single notification record created for Order Confirmation`);
    assert(notifConfCheck.rows[0].recipient_email === emailA, `Order confirmation recipient is authoritatively Customer A`);
    assert(notifConfCheck.rows[0].subject.includes(orderNumA), `Subject line contains exact Order Number #${orderNumA}`);

    // Deduplication check: duplicate call must NOT insert a second row
    const orderConfDupRes = await orderEmailService.sendOrderConfirmationWorkflow(orderA.id);
    assert(orderConfDupRes.skipped === true, `Duplicate order confirmation call is safely skipped (Idempotent)`);
    const notifConfCountCheck = await client.query(`
      SELECT COUNT(*) as count FROM public.email_notifications 
      WHERE order_id = $1 AND workflow_type = 'ORDER_CONFIRMATION'
    `, [orderA.id]);
    assert(parseInt(notifConfCountCheck.rows[0].count) === 1, `Database idempotency constraint verified (1 record total)`);

    // -------------------------------------------------------------------------
    // TEST 4 & 5: Workflow 2 — Payment Status Transitions & False-Success Protection
    // -------------------------------------------------------------------------
    console.log('\n--- TEST SUITE 3: Workflow 2 — Payment Status Transitions ---');

    // Scenario A: Verified Paid payment on Order A
    const paySuccessRes = await orderEmailService.sendPaymentStatusWorkflow(orderA.id, 'Paid', {
      transactionId: `pay_test_txn_A_${timestamp}`,
      amount: 8500.00
    });
    assert(paySuccessRes.success === true, `Verified payment status 'Paid' workflow succeeded`);

    const notifPayCheck = await client.query(`
      SELECT * FROM public.email_notifications 
      WHERE order_id = $1 AND workflow_type = 'PAYMENT_STATUS' AND event_type = 'PAYMENT_SUCCESS'
    `, [orderA.id]);
    assert(notifPayCheck.rows.length === 1, `Payment success notification recorded in database`);
    assert(notifPayCheck.rows[0].subject.includes('Payment Received'), `Payment success subject is 'Payment Received'`);
    assert(notifPayCheck.rows[0].recipient_email === emailA, `Payment success sent strictly to Customer A`);

    // Duplicate Webhook Simulation: Repeated webhook for payment.captured
    const dupWebhookRes = await orderEmailService.sendPaymentStatusWorkflow(orderA.id, 'Paid', {
      transactionId: `pay_test_txn_A_${timestamp}`,
      amount: 8500.00
    });
    assert(dupWebhookRes.skipped === true, `Duplicate payment webhook correctly skipped without repeat email`);

    // Scenario B: Failed payment on Order B — MUST NEVER claim success!
    const payFailRes = await orderEmailService.sendPaymentStatusWorkflow(orderB.id, 'Failed', {
      transactionId: `pay_test_txn_B_${timestamp}`,
      amount: 12400.00
    });
    assert(payFailRes.success === true, `Payment status 'Failed' workflow processed`);

    const notifFailCheck = await client.query(`
      SELECT * FROM public.email_notifications 
      WHERE order_id = $1 AND workflow_type = 'PAYMENT_STATUS' AND event_type = 'PAYMENT_FAILED'
    `, [orderB.id]);
    assert(notifFailCheck.rows.length === 1, `Payment failed notification recorded in database`);
    assert(notifFailCheck.rows[0].subject.includes('Action Required') || notifFailCheck.rows[0].subject.includes('Payment Update'),
      `Payment failed subject communicates action required, never claiming payment success`);
    assert(notifFailCheck.rows[0].recipient_email === emailB, `Payment failure sent strictly to Customer B`);

    // -------------------------------------------------------------------------
    // TEST 6 & 7: Workflow 3 — Payment Invoice Email & Eligibility
    // -------------------------------------------------------------------------
    console.log('\n--- TEST SUITE 4: Workflow 3 — Payment Invoice Email & Eligibility ---');

    // Rule: Order B payment is Failed. Invoice must NOT be issued!
    const ineligibleInvoiceRes = await orderEmailService.sendInvoiceWorkflow(orderB.id);
    assert(ineligibleInvoiceRes.skipped === true && ineligibleInvoiceRes.reason.includes('Invoices are only issued for verified paid orders'),
      `Ineligible unpaid/failed order is strictly rejected from invoice issuance`);

    // Scenario: Order A is verified Paid. Invoice must be generated and attached.
    const eligibleInvoiceRes = await orderEmailService.sendInvoiceWorkflow(orderA.id);
    assert(eligibleInvoiceRes.success === true, `Invoice workflow executed successfully for verified paid order`);

    const invoiceNotifCheck = await client.query(`
      SELECT * FROM public.email_notifications 
      WHERE order_id = $1 AND workflow_type = 'INVOICE'
    `, [orderA.id]);
    assert(invoiceNotifCheck.rows.length === 1, `Single invoice notification record created in database`);
    const invRow = invoiceNotifCheck.rows[0];
    assert(invRow.has_attachment === true, `Invoice email flagged with has_attachment = true`);
    assert(invRow.attachment_name === `HOUSE_OF_URVAAH_INV_${orderNumA}.pdf`, `Invoice PDF attachment filename matches order number`);
    assert(invRow.recipient_email === emailA, `Invoice email recipient is strictly Customer A`);
    assert(invRow.secure_token && invRow.secure_token.length === 64, `Generated 64-char cryptographic secure token`);

    // -------------------------------------------------------------------------
    // TEST 8: Token Security & Cross-Customer Invoice Isolation
    // -------------------------------------------------------------------------
    console.log('\n--- TEST SUITE 5: Invoice Download Security & Authorization ---');

    // Valid Token Download
    const validDownload = await orderEmailService.downloadInvoiceByToken(invRow.secure_token);
    assert(validDownload.pdfBuffer && validDownload.pdfBuffer.length > 50000, `Authorized download returns valid PDF buffer (>50KB)`);
    assert(Buffer.from(validDownload.pdfBuffer).toString('utf-8', 0, 5) === '%PDF-', `Buffer starts with standard %PDF- header`);
    assert(validDownload.filename === `HOUSE_OF_URVAAH_INV_${orderNumA}.pdf`, `Authorized download has correct filename`);

    // Forged Token Attempt (Customer B trying to access Customer A's invoice)
    let forgedFailed = false;
    try {
      await orderEmailService.downloadInvoiceByToken('forged_invalid_token_xyz_123');
    } catch (e) {
      forgedFailed = true;
    }
    assert(forgedFailed === true, `Access with forged/invalid token is strictly blocked`);

    // -------------------------------------------------------------------------
    // TEST 9: Safe Retry without Duplication
    // -------------------------------------------------------------------------
    console.log('\n--- TEST SUITE 6: Safe Admin Panel Retry Audit ---');

    // Mark Order A's confirmation notification temporarily as 'failed' to test retry
    const confNotifId = notifConfCheck.rows[0].id;
    await client.query(`
      UPDATE public.email_notifications 
      SET status = 'failed', error_message = 'Simulated SMTP connection timeout' 
      WHERE id = $1
    `, [confNotifId]);

    const retryRes = await orderEmailService.retryNotification(confNotifId);
    assert(retryRes.success === true, `Admin retry dispatch executed successfully`);

    const retriedRow = (await client.query(`SELECT * FROM public.email_notifications WHERE id = $1`, [confNotifId])).rows[0];
    assert(retriedRow.status === 'sent', `Notification status updated back to 'sent' after retry`);
    assert(retriedRow.attempt_count >= 2, `Audit trail attempt_count incremented to ${retriedRow.attempt_count}`);

    // Verify stats endpoint aggregation
    const stats = await orderEmailService.getEmailNotificationStats();
    assert(parseInt(stats.total_notifications) >= 3, `Dashboard stats correctly aggregate total notifications (${stats.total_notifications})`);
    assert(parseInt(stats.order_confirmations) >= 1, `Dashboard stats include order confirmations (${stats.order_confirmations})`);
    assert(parseInt(stats.payment_updates) >= 2, `Dashboard stats include payment status updates (${stats.payment_updates})`);
    assert(parseInt(stats.invoice_emails) >= 1, `Dashboard stats include invoices issued (${stats.invoice_emails})`);

    // -------------------------------------------------------------------------
    // TEARDOWN: Clean up test rows
    // -------------------------------------------------------------------------
    console.log('\n🧹 Cleaning up test fixtures...');
    await client.query(`DELETE FROM public.email_notifications WHERE order_id IN ($1, $2)`, [orderA.id, orderB.id]);
    await client.query(`DELETE FROM public.order_items WHERE order_id IN ($1, $2)`, [orderA.id, orderB.id]);
    await client.query(`DELETE FROM public.orders WHERE id IN ($1, $2)`, [orderA.id, orderB.id]);
    await client.query(`DELETE FROM public.user_addresses WHERE id IN ($1, $2)`, [addrA_id, addrB_id]);
    await client.query(`DELETE FROM public.users WHERE username IN ($1, $2)`, [userA_id, userB_id]);
    console.log('✅ Cleanup completed.');

  } catch (err) {
    console.error('💥 Test suite unexpected error:', err);
    failed++;
  } finally {
    client.release();
    await pool.end();
  }

  console.log('\n================================================================');
  console.log(`📊 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
};

runTests();
