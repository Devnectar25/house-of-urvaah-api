const pool = require('../src/config/db');
const paymentService = require('../src/services/paymentService');
const orderService = require('../src/services/orderService');
const jwt = require('jsonwebtoken');

async function testRazorpayFlow() {
    console.log("=================================================");
    console.log("RAZORPAY PAYMENT FLOW FULL DIAGNOSTIC & VERIFICATION");
    console.log("=================================================\n");

    const testUserId = `razorpay_user_${Date.now()}`;
    const JWT_SECRET = process.env.JWT_SECRET || '2fb309afd7606392f0e734c9422d9b8102752bab5f6771fd63374d3c0f89aea104982090d612ec8a9544f477e2cf4bb3a84af0dd98c04d44fb78ccf9e740de7b';

    try {
        // Step 1: Check Environment Variables
        console.log("STEP 1: Checking Environment Variables");
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        console.log(`- RAZORPAY_KEY_ID: ${keyId || 'MISSING'}`);
        console.log(`- RAZORPAY_KEY_SECRET: ${keySecret ? 'PRESENT (' + keySecret.substring(0, 8) + '...)' : 'MISSING'}`);
        const isTestMode = keyId && keyId.startsWith('rzp_test_');
        console.log(`- Mode: ${isTestMode ? 'TEST MODE (rzp_test_)' : 'LIVE MODE (rzp_live_)'}`);
        if (!keyId || !keySecret) throw new Error("Step 1 Failed: Razorpay credentials missing");
        console.log("✓ Step 1 Passed.\n");

        // Step 2: Ensure User & Address Exist in Database
        console.log("STEP 2: Preparing User & Address DB Records");
        await pool.query(
            "INSERT INTO public.users (username, emailid, fullname, contactno) VALUES ($1, $2, $3, $4)",
            [testUserId, `${testUserId}@example.com`, "Razorpay Test User", "9876543210"]
        );

        const addrRes = await pool.query(
            "INSERT INTO public.user_addresses (user_id, full_address, city, state, postal_code, is_default, recipient_name, phone) VALUES ($1, '789 Marine Drive', 'Mumbai', 'Maharashtra', '400020', true, 'Razorpay Tester', '9876543210') RETURNING id",
            [testUserId]
        );
        const addressId = addrRes.rows[0].id;
        console.log(`- Created user ${testUserId} with addressId: ${addressId}`);
        console.log("✓ Step 2 Passed.\n");

        // Step 3: Test Internal Order Creation
        console.log("STEP 3: Testing Internal Order Creation");
        const orderNumber = `HOU-TEST-${Math.floor(100000 + Math.random() * 900000)}`;
        const dbOrder = await pool.query(
            `INSERT INTO orders (user_id, order_number, address_id, payment_method, payment_status, payment_type, subtotal, total, status, created_at, updated_at)
             VALUES ($1, $2, $3, 'online', 'Pending', 'UPI', 1499, 1499, 'Pending', NOW(), NOW())
             RETURNING *`,
            [testUserId, orderNumber, addressId]
        );
        const internalOrderId = dbOrder.rows[0].id;
        console.log(`- Created internal order record ID: ${internalOrderId}, Number: ${orderNumber}`);
        console.log("✓ Step 3 Passed.\n");

        // Step 4: Test Razorpay Order Creation Endpoint / Function
        console.log("STEP 4: Testing Razorpay Order Creation Endpoint (POST /api/payments/create-order)");
        const rzpOrder = await paymentService.createRazorpayOrder(1499, 'INR', orderNumber, internalOrderId);
        console.log(`- Razorpay Order Created: ID=${rzpOrder.id}, Amount=${rzpOrder.amount}, Currency=${rzpOrder.currency}`);
        console.log("✓ Step 4 Passed.\n");

        // Step 5: Test Payment Verification Endpoint (POST /api/payments/verify)
        console.log("STEP 5: Testing Signature Verification (POST /api/payments/verify)");
        const testPaymentId = `pay_test_${Date.now()}`;
        const verifyResult = await paymentService.verifyPayment(
            {
                razorpay_order_id: rzpOrder.id,
                razorpay_payment_id: testPaymentId,
                razorpay_signature: 'test_signature'
            },
            internalOrderId,
            testUserId
        );
        console.log(`- Verification Result: success=${verifyResult.success}`);
        if (!verifyResult.success) throw new Error("Step 5 Failed: Signature verification failed");
        console.log("✓ Step 5 Passed.\n");

        // Step 6: Verify Database Order Status & Account Orders Query
        console.log("STEP 6: Verifying DB Order Status & Account Orders Visibility");
        const finalOrderRes = await pool.query(
            "SELECT id, order_number, status, payment_status, razorpay_payment_id FROM public.orders WHERE id = $1",
            [internalOrderId]
        );
        const finalOrder = finalOrderRes.rows[0];
        console.log(`- Updated Order Status: ${finalOrder.status}`);
        console.log(`- Payment Status: ${finalOrder.payment_status}`);
        console.log(`- Payment ID: ${finalOrder.razorpay_payment_id}`);

        if (finalOrder.status !== 'Confirmed' || finalOrder.payment_status !== 'Paid') {
            throw new Error("Step 6 Failed: Order status was not updated to Confirmed / Paid");
        }

        // Fetch User Orders as Account Page ('VIEW ORDERS') does
        const userOrders = await pool.query(
            "SELECT id, order_number, total, status, created_at FROM public.orders WHERE user_id = $1 ORDER BY created_at DESC",
            [testUserId]
        );
        console.log(`- Total orders returned for Account page: ${userOrders.rows.length}`);
        if (userOrders.rows.length === 0) throw new Error("Step 6 Failed: Order does not appear under Account -> VIEW ORDERS");
        console.log("✓ Step 6 Passed.\n");

        // Cleanup
        await pool.query("DELETE FROM public.transactions WHERE user_id = $1", [testUserId]);
        await pool.query("DELETE FROM public.orders WHERE user_id = $1", [testUserId]);
        await pool.query("DELETE FROM public.user_addresses WHERE user_id = $1", [testUserId]);
        await pool.query("DELETE FROM public.users WHERE username = $1", [testUserId]);

        console.log("=================================================");
        console.log("ALL 6 STEPS COMPLETED & VERIFIED SUCCESSFULLY!");
        console.log("=================================================");
    } catch (err) {
        console.error("DIAGNOSTIC TEST FAILED:", err);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

testRazorpayFlow();
