const pool = require('../src/config/db');
const stockNotificationService = require('../src/services/stockNotificationService');

async function runTest() {
    console.log('--- Testing Stock Notification System ---');

    // 1. Check existing product
    const prodRes = await pool.query('SELECT product_id, title, stock_quantity, stock FROM products LIMIT 1');
    if (prodRes.rows.length === 0) {
        throw new Error('No products in database to test with');
    }
    const testProduct = prodRes.rows[0];
    console.log(`Using product: ${testProduct.title} (ID: ${testProduct.product_id})`);

    const testEmail = `test_${Date.now()}@urvaah-test.com`;

    // 2. Test Subscription
    console.log('\n1. Testing customer subscription...');
    const subResult = await stockNotificationService.subscribe({
        productId: testProduct.product_id,
        size: 'M',
        color: 'Default',
        email: testEmail,
        phone: '9876543210',
        channel: 'email'
    });
    console.log('Subscription response:', subResult.message);
    if (!subResult.subscription || !subResult.subscription.id) {
        throw new Error('Failed to create subscription');
    }
    const subId = subResult.subscription.id;
    const unsubToken = subResult.subscription.unsubscribe_token;

    // 3. Test Duplicate Prevention
    console.log('\n2. Testing duplicate subscription prevention...');
    const dupResult = await stockNotificationService.subscribe({
        productId: testProduct.product_id,
        size: 'M',
        color: 'Default',
        email: testEmail,
        phone: '9876543210',
        channel: 'email'
    });
    console.log('Duplicate test result:', dupResult.alreadySubscribed, '-', dupResult.message);
    if (!dupResult.alreadySubscribed) {
        throw new Error('Duplicate prevention failed!');
    }

    // 4. Test Restock Event & Queue
    console.log('\n3. Testing restock trigger (0 -> 5 stock)...');
    const restockRes = await stockNotificationService.triggerRestockEvent({
        productId: testProduct.product_id,
        previousStock: 0,
        newStock: 5,
        size: 'M'
    });
    console.log('Restock trigger result:', restockRes);
    if (!restockRes.triggered || restockRes.queuedCount === 0) {
        throw new Error('Failed to trigger restock event or queue jobs');
    }

    // 5. Test Admin Metrics
    console.log('\n4. Testing admin metrics...');
    const metrics = await stockNotificationService.getAdminMetrics();
    console.log('Admin metrics:', {
        total: metrics.totalSubscriptions,
        active: metrics.activeSubscriptions,
        sent: metrics.jobsSent,
        failed: metrics.jobsFailed,
        topProducts: metrics.topDemandProducts.length
    });

    // 6. Test Unsubscribe
    console.log('\n5. Testing unsubscribe...');
    const unsubRes = await stockNotificationService.unsubscribe(unsubToken);
    console.log('Unsubscribe result:', unsubRes.message);

    // Clean up test data
    console.log('\nCleaning up test subscription...');
    await pool.query('DELETE FROM stock_notification_subscriptions WHERE contact_email = $1', [testEmail]);
    if (restockRes.eventId) {
        await pool.query('DELETE FROM stock_notification_events WHERE id = $1', [restockRes.eventId]);
    }

    console.log('\n>>> All Backend Stock Notification Tests Passed Successfully! <<<');
    process.exit(0);
}

runTest().catch(err => {
    console.error('Test failed with error:', err);
    process.exit(1);
});
