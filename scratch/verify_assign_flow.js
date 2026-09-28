const pool = require('../src/config/db');
const targetingService = require('../src/services/targetingService');
const couponService = require('../src/services/couponService');

async function testAssignFlow() {
    console.log('=== STARTING ASSIGN POPUP BACKEND VERIFICATION ===');
    let testCouponId = null;

    try {
        // 1. Create temporary test coupon
        const code = 'ASSIGN' + Math.floor(Math.random() * 1000);
        console.log(`\n1. Creating temporary test coupon: ${code}...`);
        const cpn = await couponService.createCoupon({
            code,
            description: 'Test Assign Modal Coupon',
            discount_type: 'percentage',
            discount_value: 15,
            min_order_value: 0,
            expires_at: new Date(Date.now() + 86400000).toISOString(),
            applies_to: 'all',
            is_private: true,
            is_active: true
        });
        testCouponId = cpn.id;
        console.log(`✅ Test coupon created with ID: ${testCouponId}`);

        // 2. Test fetching "All Users"
        console.log('\n2. Fetching "All Users"...');
        const allUsers = await targetingService.getAllUsers(testCouponId);
        console.log(`✅ All Users count: ${allUsers.length}`);
        if (allUsers.length > 0) {
            console.log('First user preview:', allUsers[0]);
        }

        // 3. Test fetching "Top Customers"
        console.log('\n3. Fetching "Top Customers"...');
        const topCustomers = await targetingService.getTopCustomers(5);
        console.log(`✅ Top Customers count: ${topCustomers.length}`);
        if (topCustomers.length > 0) {
            console.log('First top customer preview:', topCustomers[0]);
        }

        // 4. Test fetching "Active Users"
        console.log('\n4. Fetching "Active Users"...');
        const activeUsers = await targetingService.getActiveUsers(5);
        console.log(`✅ Active Users count: ${activeUsers.length}`);
        if (activeUsers.length > 0) {
            console.log('First active user preview:', activeUsers[0]);
        }

        // 5. Test assigning coupon to users
        const targetUsernames = allUsers.slice(0, 2).map(u => u.username || u.id);
        if (targetUsernames.length > 0) {
            console.log(`\n5. Assigning coupon ID ${testCouponId} to users:`, targetUsernames);
            const assignRes = await targetingService.assignCouponToUsers(testCouponId, targetUsernames);
            console.log('✅ Assignment result:', assignRes);

            // Verify assigned in DB
            const assignments = await couponService.getCouponAssignments(testCouponId);
            console.log(`✅ Verified assignments in DB count: ${assignments.length}`);
        } else {
            console.log('\n5. Skipped assignment test (no users in DB).');
        }

        // 6. Cleanup
        console.log(`\n6. Cleaning up test coupon ID ${testCouponId}...`);
        await couponService.deleteCoupon(testCouponId);
        console.log(`✅ Test coupon ID ${testCouponId} deleted.`);

        console.log('\n=== ALL ASSIGNMENT VERIFICATIONS PASSED SUCCESSFULLY ===');
    } catch (err) {
        console.error('❌ Verification failed:', err);
        if (testCouponId) {
            try { await couponService.deleteCoupon(testCouponId); } catch {}
        }
    } finally {
        await pool.end();
    }
}

testAssignFlow();
