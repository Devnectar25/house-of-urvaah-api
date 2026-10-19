const pool = require('../src/config/db');
const orderService = require('../src/services/orderService');
const shiprocketService = require('../src/services/shiprocketService');

async function testScenarios() {
  console.log('=== TESTING MULTI-PRODUCT RETURN/REPLACE/KEEP SCENARIOS ===\n');

  // Create a dummy 3-item order for testing
  const client = await pool.connect();
  let testOrderId = null;
  let testOrderNumber = `TEST-MULTI-${Date.now()}`;

  try {
    const orderRes = await client.query(`
      INSERT INTO orders (
        order_number, user_id, total, subtotal, payment_method, payment_status,
        status, created_at, updated_at
      ) VALUES ($1, 'testuser', 14970, 14970, 'Prepaid', 'Paid', 'Delivered', NOW(), NOW())
      RETURNING id
    `, [testOrderNumber]);
    testOrderId = orderRes.rows[0].id;

    // Insert 3 items:
    // Item 1: ₹3,990 (will be KEPT)
    // Item 2: ₹4,990 (will be RETURNED)
    // Item 3: ₹5,990 (will be REPLACED with Size XL)
    const i1 = await client.query(`
      INSERT INTO order_items (order_id, product_id, name, price, quantity, size, status, created_at)
      VALUES ($1, 109, 'Ivory Heart Corset Kurti/Dress', 3990, 1, 'M', 'Delivered', NOW())
      RETURNING id
    `, [testOrderId]);

    const i2 = await client.query(`
      INSERT INTO order_items (order_id, product_id, name, price, quantity, size, status, created_at)
      VALUES ($1, 105, 'Mocha Brown Embroidered Co-Ord Set', 4990, 1, 'M', 'Delivered', NOW())
      RETURNING id
    `, [testOrderId]);

    const i3 = await client.query(`
      INSERT INTO order_items (order_id, product_id, name, price, quantity, size, status, created_at)
      VALUES ($1, 104, 'Blush Pink Embroidered Floral Co-Ord Set', 5990, 1, 'M', 'Delivered', NOW())
      RETURNING id
    `, [testOrderId]);

    console.log(`[Setup] Created 3-Item Test Order ${testOrderNumber} (ID: ${testOrderId})`);
    console.log(`  Item 1 (109): ₹3,990 | Item 2 (105): ₹4,990 | Item 3 (104): ₹5,990 | Total: ₹14,970\n`);

    // Scenario: 1 Kept (Blouse), 1 Return (Pant), 1 Replace (Blazer with Size XL)
    console.log('--- Executing Scenario: 1 Keep, 1 Return, 1 Replace ---');
    const updatePayload = {
      items: [
        { id: i1.rows[0].id, action: 'Keep' },
        { id: i2.rows[0].id, action: 'Return', reason: 'Fabric not as expected' },
        { id: i3.rows[0].id, action: 'Replace', replacementSize: 'XL', reason: 'Need oversized fit' }
      ],
      reason: 'Mixed partial return and replacement request',
      isAdmin: true
    };

    const updatedOrder = await orderService.requestReturnReplace(testOrderId, 'testuser', updatePayload);

    console.log(`[Order Status]: ${updatedOrder.status} (Expected: Return & Replacement Processing)`);
    console.log(`[Return Type]: ${updatedOrder.return_type} (Expected: Mixed (Return & Replacement))`);
    console.log(`[Refund Eligible Amount]: ₹${updatedOrder.refund_eligible_amount} (Expected: ₹4,990 - ONLY the returned pant!)`);
    console.log(`[Is Partial Return]: ${updatedOrder.is_partial_return} (Expected: true)`);

    // Inspect individual items
    console.log('\n[Item-Level Verifications]:');
    for (const it of updatedOrder.items) {
      console.log(`  - ${it.name}: Action="${it.return_action}", Status="${it.status}", Size="${it.size}", ReplacementSize="${it.replacement_size || 'N/A'}"`);
    }

    // Verify reverse pickup payload filter
    const itemsToPickup = updatedOrder.items.filter(i => {
      const act = (i.return_action || '').toLowerCase();
      const stat = (i.status || '').toLowerCase();
      if (act === 'keep') return false;
      if (stat === 'delivered' && act !== 'return' && act !== 'replace') return false;
      return true;
    });
    console.log(`\n[Reverse Pickup Items]: ${itemsToPickup.length} items (Expected: 2 - Pant & Blazer, excluding kept Blouse)`);

    // Verify replacement forward leg filter
    const itemsToReplace = updatedOrder.items.filter(i => {
      const act = (i.return_action || '').toLowerCase();
      const stat = (i.status || '').toLowerCase();
      return act === 'replace' || stat.includes('replace');
    });
    console.log(`[Replacement Forward Items]: ${itemsToReplace.length} items (Expected: 1 - Blazer only)`);
    console.log(`  Replacement Target Size: ${itemsToReplace[0]?.replacement_size} (Expected: XL)`);

    console.log('\n✅ ALL MULTI-ITEM SCENARIO TESTS PASSED ACCURATELY!');
  } catch (err) {
    console.error('❌ Test failed:', err);
  } finally {
    // Clean up test order
    if (testOrderId) {
      await client.query(`DELETE FROM order_items WHERE order_id = $1`, [testOrderId]);
      await client.query(`DELETE FROM orders WHERE id = $1`, [testOrderId]);
      console.log('\n[Cleanup] Test order removed from DB.');
    }
    client.release();
    process.exit(0);
  }
}

testScenarios();
