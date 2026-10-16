/**
 * Automated Test Runner for all 15 Shiprocket Mock APIs (+ Webhook)
 * House of Urvaah - Shipping Test Suite
 * Run with: node test_all_shiprocket_apis.js
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000/api/shipping';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

async function testEndpoint(testNum, title, method, path, body = null) {
  const url = `${BASE_URL}${path}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const start = Date.now();
  try {
    const res = await fetch(url, options);
    const duration = Date.now() - start;
    const json = await res.json().catch(() => ({}));

    if (res.ok && json.success !== false) {
      console.log(
        `  ${colors.green}✔ [API ${testNum.toString().padStart(2, '0')}]${colors.reset} ` +
        `${colors.bright}${title}${colors.reset} ` +
        `${colors.gray}(${method} ${path} • ${res.status} • ${duration}ms)${colors.reset}`
      );
      return { success: true, data: json };
    } else {
      console.log(
        `  ${colors.red}✖ [API ${testNum.toString().padStart(2, '0')}]${colors.reset} ` +
        `${colors.bright}${title}${colors.reset} ` +
        `${colors.red}FAILED (${res.status}): ${json.message || 'Unknown error'}${colors.reset}`
      );
      return { success: false, error: json };
    }
  } catch (err) {
    console.log(
      `  ${colors.red}✖ [API ${testNum.toString().padStart(2, '0')}]${colors.reset} ` +
      `${colors.bright}${title}${colors.reset} ` +
      `${colors.red}NETWORK ERROR: ${err.message}${colors.reset}`
    );
    return { success: false, error: err.message };
  }
}

async function runTestSuite() {
  console.log('\n===============================================================');
  console.log(`${colors.cyan}${colors.bright}   HOUSE OF URVAAH - SHIPROCKET 15 MOCK APIs TEST SUITE${colors.reset}`);
  console.log(`${colors.gray}   Target: ${BASE_URL}${colors.reset}`);
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  // Track shared variables across tests
  let currentShipmentId = 'SR-MOCK-SHP-884912';
  let currentAwb = 'URV773819201IN';
  let returnShipmentId = 'SR-MOCK-REV-918231';
  let returnAwb = 'REV819203918IN';

  console.log(`${colors.bright}--- [PHASE 1] FORWARD FULFILLMENT & COURIER LIFECYCLE ---${colors.reset}`);

  // 1. Serviceability Check
  total++;
  const t1 = await testEndpoint(1, 'Serviceability & EDD Check', 'GET', '/serviceability?pincode=110001&cod=1');
  if (t1.success) passed++;

  // 2. Create Forward Shipment
  total++;
  const t2 = await testEndpoint(2, 'Create Forward Shipment', 'POST', '/order/create', {
    order_id: 'TEST-ORD-1001',
    order_date: '2026-10-14 12:00',
    shippingAddress: {
      firstName: 'Aarav',
      lastName: 'Sharma',
      address: '402 Atelier St',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      phone: '9876543210',
      email: 'customer@urvaah.com'
    },
    items: [
      { product_id: 105, name: 'Mocha Brown Co-Ord Set', quantity: 1, price: 8990 }
    ],
    subtotal: 8990,
    payment_method: 'Prepaid'
  });
  if (t2.success) {
    passed++;
    if (t2.data.shipment_id) currentShipmentId = t2.data.shipment_id;
  }

  // 3. Assign Courier Partner & AWB
  total++;
  const t3 = await testEndpoint(3, 'Assign Courier Partner & AWB', 'POST', '/courier/assign-awb', {
    shipment_id: currentShipmentId,
    courier_id: 10
  });
  if (t3.success) {
    passed++;
    if (t3.data.response?.data?.awb_code) currentAwb = t3.data.response.data.awb_code;
  }

  // 4. Schedule Courier Pickup
  total++;
  const t4 = await testEndpoint(4, 'Schedule Atelier Courier Pickup', 'POST', '/courier/pickup', {
    shipment_ids: [currentShipmentId]
  });
  if (t4.success) passed++;

  // 5. Track Forward Shipment
  total++;
  const t5 = await testEndpoint(5, 'Live Shipment Tracking Updates', 'GET', `/track/${currentAwb}`);
  if (t5.success) passed++;

  // 6. Milestone: Out for Delivery Simulator
  total++;
  const t6 = await testEndpoint(6, 'Simulate Out for Delivery Event', 'POST', '/simulate/out-for-delivery', {
    awb: currentAwb
  });
  if (t6.success) passed++;

  // 7. Milestone: Delivered Simulator
  total++;
  const t7 = await testEndpoint(7, 'Simulate Delivered Event & POD', 'POST', '/simulate/delivered', {
    awb: currentAwb,
    recipient_name: 'Aarav Sharma'
  });
  if (t7.success) passed++;

  // 8A. Generate Shipping Label PDF
  total++;
  const t8a = await testEndpoint(8, 'Generate Shipping Label (PDF)', 'POST', '/label', {
    shipment_ids: [currentShipmentId]
  });
  if (t8a.success) passed++;

  // 8B. Generate Courier Manifest PDF
  total++;
  const t8b = await testEndpoint(8, 'Generate Handover Manifest (PDF)', 'POST', '/manifest', {
    shipment_ids: [currentShipmentId]
  });
  if (t8b.success) passed++;

  // 9. Pre-Dispatch Cancellation (Void Shipment)
  total++;
  const t9 = await testEndpoint(9, 'Pre-Dispatch Cancellation / Void', 'POST', '/order/cancel', {
    order_ids: ['TEST-ORD-1001']
  });
  if (t9.success) passed++;

  // 10. Customer Alert Dispatch (WhatsApp & Email)
  total++;
  const t10 = await testEndpoint(10, 'Customer Alert Dispatch (WhatsApp/Email)', 'POST', '/notify', {
    order: { order_number: 'TEST-ORD-1001', id: 'uuid-1001' },
    status: 'Shipped',
    tracking_info: { awb_code: currentAwb }
  });
  if (t10.success) passed++;

  console.log(`\n${colors.bright}--- [PHASE 2] REVERSE LOGISTICS, RETURNS & EXCHANGES ---${colors.reset}`);

  // 11. Create Return / Reverse Order
  total++;
  const t11 = await testEndpoint(11, 'Create Reverse Pickup Order', 'POST', '/return/create', {
    order: {
      order_number: 'TEST-ORD-1001',
      shippingAddress: {
        firstName: 'Aarav',
        lastName: 'Sharma',
        address: '402 Atelier St',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        phone: '9876543210'
      }
    },
    items_to_return: [
      { product_id: 105, name: 'Mocha Brown Co-Ord Set', quantity: 1, price: 8990 }
    ],
    reason: 'Size exchange request'
  });
  if (t11.success) {
    passed++;
    if (t11.data.shipment_id) returnShipmentId = t11.data.shipment_id;
  }

  // 12. Assign Return AWB
  total++;
  const t12 = await testEndpoint(12, 'Assign Reverse Courier Partner & AWB', 'POST', '/return/assign-awb', {
    shipment_id: returnShipmentId
  });
  if (t12.success) {
    passed++;
    if (t12.data.response?.data?.awb_code) returnAwb = t12.data.response.data.awb_code;
  }

  // 13. Schedule Reverse Doorstep Pickup
  total++;
  const t13 = await testEndpoint(13, 'Schedule Reverse Doorstep Pickup', 'POST', '/return/pickup', {
    shipment_ids: [returnShipmentId]
  });
  if (t13.success) passed++;

  // 14. Track Return Parcel
  total++;
  const t14 = await testEndpoint(14, 'Track Return Parcel to Warehouse', 'GET', `/return/track/${returnAwb}`);
  if (t14.success) passed++;

  console.log(`\n${colors.bright}--- [PHASE 3] REPLACEMENT & LIVE WEBHOOK ---${colors.reset}`);

  // 15. Dispatch Replacement
  total++;
  const t15 = await testEndpoint(15, 'Dispatch Replacement Item (Zero Value)', 'POST', '/replacement/dispatch', {
    original_order: {
      order_number: 'TEST-ORD-1001',
      shippingAddress: {
        firstName: 'Aarav',
        lastName: 'Sharma',
        address: '402 Atelier St',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        phone: '9876543210'
      }
    },
    replacement_items: [
      { product_id: 105, name: 'Mocha Brown Co-Ord Set - Size L', quantity: 1, price: 0 }
    ]
  });
  if (t15.success) passed++;

  // 16. Webhook Receiver
  total++;
  const t16 = await testEndpoint(16, 'Live Tracking Webhook Receiver', 'POST', '/webhook', {
    awb: currentAwb,
    current_status: 'IN TRANSIT'
  });
  if (t16.success) passed++;

  console.log('\n===============================================================');
  if (passed === total) {
    console.log(`${colors.green}${colors.bright}   🎉 ALL ${total} SHIPROCKET MOCK TESTS PASSED SUCCESSFULLY! (100%)${colors.reset}`);
  } else {
    console.log(`${colors.yellow}${colors.bright}   RESULT: ${passed} / ${total} TESTS PASSED${colors.reset}`);
  }
  console.log('===============================================================\n');
}

runTestSuite();
