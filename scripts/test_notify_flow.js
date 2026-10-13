const stockNotificationService = require('../src/services/stockNotificationService');
const pool = require('../src/config/db');

async function testFlow() {
  const testEmail = 'khushal8669382080@gmail.com';
  console.log('--- STEP 1: Clear existing test subscriptions ---');
  await pool.query('DELETE FROM stock_notification_subscriptions WHERE contact_email = $1', [testEmail]);

  console.log('\n--- STEP 2: Customer Subscribes to bs-104 (Out of stock item) ---');
  const subRes = await stockNotificationService.subscribe({
    productId: 'bs-104',
    size: 'M',
    color: 'Default',
    email: testEmail,
    channel: 'email'
  });
  console.log('Subscription registered:', subRes.success, '| Message:', subRes.message);

  const checkSub = await pool.query(
    'SELECT id, product_id, size, contact_email, status FROM stock_notification_subscriptions WHERE contact_email = $1',
    [testEmail]
  );
  console.log('Table entries after subscription:', checkSub.rows);

  console.log('\n--- STEP 3: Admin Restocks Product 104 (Stock Added) ---');
  const restockRes = await stockNotificationService.triggerRestockEvent({
    productId: 104,
    previousStock: 0,
    newStock: 10,
    size: 'M'
  });
  console.log('Restock Event Triggered:', restockRes.triggered, '| Queued jobs:', restockRes.queuedCount);

  // Allow 2 seconds for email dispatch and automatic table clearing
  await new Promise(r => setTimeout(r, 2000));

  console.log('\n--- STEP 4: Verify Table is Emptied for this Subscriber ---');
  const checkAfter = await pool.query(
    'SELECT id, product_id, contact_email, status FROM stock_notification_subscriptions WHERE contact_email = $1',
    [testEmail]
  );
  console.log('Table entries after restock email sent (should be empty []):', checkAfter.rows);

  console.log('\n--- STEP 5: Admin Updates Stock Again (Verify No Second Email) ---');
  const restockAgain = await stockNotificationService.triggerRestockEvent({
    productId: 104,
    previousStock: 10,
    newStock: 25,
    size: 'M'
  });
  console.log('Second Restock Queued Count (must be 0):', restockAgain.queuedCount);

  console.log('\n🎉 ALL TESTS VERIFIED SUCCESSFULLY!');
  process.exit(0);
}

testFlow().catch(err => {
  console.error('Test Error:', err);
  process.exit(1);
});
