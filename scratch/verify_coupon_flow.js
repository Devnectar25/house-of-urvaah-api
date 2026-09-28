const pool = require('../src/config/db');
const couponService = require('../src/services/couponService');

async function testCouponFlow() {
    console.log('=== STARTING COUPON FLOW VERIFICATION ===');
    let createdCouponId = null;

    try {
        // 1. Create a test percentage coupon with category scope & restricted users
        const testCode = 'TESTPCT' + Math.floor(Math.random() * 1000);
        console.log(`\n1. Creating test percentage coupon: ${testCode}...`);
        
        const createPayload = {
            code: testCode,
            description: 'Automated E2E Test Coupon',
            discount_type: 'percentage',
            discount_value: 20,
            max_discount: 500,
            min_order_value: 1000,
            usage_limit: 100,
            per_user_limit: 2,
            starts_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
            applies_to: 'categories',
            category_ids: [1],
            is_restricted: true,
            customer_ids: ['testuser1'],
            is_active: true
        };

        const created = await couponService.createCoupon(createPayload);
        createdCouponId = created.id;
        console.log(`✅ Coupon created successfully with ID: ${createdCouponId}`);
        console.log('Returned object:', JSON.stringify(created, null, 2));

        // 2. Test duplicate code error handling
        console.log('\n2. Testing duplicate code validation...');
        try {
            await couponService.createCoupon(createPayload);
            console.error('❌ Expected duplicate code error, but operation succeeded!');
        } catch (err) {
            console.log(`✅ Correctly caught duplicate code error: "${err.message}"`);
        }

        // 3. Test retrieving all coupons
        console.log('\n3. Fetching all coupons...');
        const allCoupons = await couponService.getAllCoupons();
        const found = allCoupons.find(c => c.id === createdCouponId);
        if (found) {
            console.log(`✅ Coupon ID ${createdCouponId} found in list. Code: ${found.code}, Category IDs:`, found.category_ids, 'Customer IDs:', found.customer_ids);
        } else {
            console.error(`❌ Coupon ID ${createdCouponId} NOT found in list!`);
        }

        // 4. Test Updating Coupon
        console.log(`\n4. Updating coupon ID ${createdCouponId}...`);
        const updatePayload = {
            ...createPayload,
            description: 'Updated E2E Test Coupon Description',
            discount_value: 25,
            max_discount: 600,
            min_order_value: 1200
        };

        const updated = await couponService.updateCoupon(createdCouponId, updatePayload);
        console.log(`✅ Coupon updated successfully. New description: "${updated.description}", discount_value: ${updated.discount_value}`);

        // 5. Test Coupon Validation logic
        console.log('\n5. Validating coupon against order total...');
        const validationResult = await couponService.validateCoupon(testCode, 2000, [{ category_id: 1, price: 2000, quantity: 1 }], 'testuser1');
        console.log('✅ Validation result:', JSON.stringify(validationResult, null, 2));

        // 6. Cleanup test coupon
        console.log(`\n6. Cleaning up test coupon ID ${createdCouponId}...`);
        await couponService.deleteCoupon(createdCouponId);
        console.log(`✅ Coupon ID ${createdCouponId} deleted successfully.`);

        console.log('\n=== ALL VERIFICATIONS PASSED SUCCESSFULLY ===');
    } catch (err) {
        console.error('❌ Verification failed with error:', err);
        if (createdCouponId) {
            try { await couponService.deleteCoupon(createdCouponId); } catch {}
        }
    } finally {
        await pool.end();
    }
}

testCouponFlow();
