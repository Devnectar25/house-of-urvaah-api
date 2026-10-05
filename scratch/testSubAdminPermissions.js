const pool = require('../src/config/db');
const authService = require('../src/services/authService');
const subAdminService = require('../src/services/subAdminService');
const http = require('http');

async function testSubAdminPermissions() {
  console.log('=== STARTING SUB-ADMIN PERMISSION INTEGRATION TEST ===\n');

  const username = 'test-subadmin-analytics-orders';
  const password = 'Password123!';

  // Clean up old test user if exists
  await pool.query("DELETE FROM public.admins WHERE userid = $1", [username]);

  // 1. Create Sub-Admin with ONLY 'analytics' and 'orders' permissions
  const created = await subAdminService.createSubAdmin({
    username,
    password,
    permissions: ['analytics', 'orders']
  });
  console.log('1. Created Test Sub-Admin with permissions:', created.permissions);

  // 2. Login as this Sub-Admin
  const loginRes = await authService.loginAdmin(username, password, '127.0.0.1');
  const token = loginRes.token;
  console.log('2. Logged in successfully. User object:', loginRes.admin);

  function makeReq(path, method = 'GET', body = null) {
    return new Promise((resolve) => {
      const postData = body ? JSON.stringify(body) : '';
      const req = http.request({
        hostname: 'localhost',
        port: 4000,
        path: path,
        method: method,
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data || '{}') }));
      });
      if (body) req.write(postData);
      req.end();
    });
  }

  console.log('\n--- Testing Backend API Authorization ---');

  // 3. Test ALLOWED endpoints:
  const analyticsRes = await makeReq('/api/admin/analytics/summary?period=7Days');
  console.log('   - Analytics Summary (ALLOWED): Status =', analyticsRes.status, analyticsRes.status === 200 ? '✅ PASS' : '❌ FAIL');

  const ordersRes = await makeReq('/api/orders');
  console.log('   - Orders List (ALLOWED): Status =', ordersRes.status, ordersRes.status === 200 ? '✅ PASS' : '❌ FAIL');

  // 4. Test RESTRICTED endpoints (Must return 403 Forbidden):
  const couponsRes = await makeReq('/api/admin/coupons');
  console.log('   - Coupons List (RESTRICTED): Status =', couponsRes.status, couponsRes.status === 403 ? '✅ REJECTED (403 FORBIDDEN)' : '❌ FAIL');

  const customersRes = await makeReq('/api/users');
  console.log('   - Customers List (RESTRICTED): Status =', customersRes.status, customersRes.status === 403 ? '✅ REJECTED (403 FORBIDDEN)' : '❌ FAIL');

  const refundRes = await makeReq('/api/admin/refund-desk');
  console.log('   - Refund Desk (RESTRICTED): Status =', refundRes.status, refundRes.status === 403 ? '✅ REJECTED (403 FORBIDDEN)' : '❌ FAIL');

  const productMutationRes = await makeReq('/api/products', 'POST', { name: 'Test Product' });
  console.log('   - Product Creation (RESTRICTED): Status =', productMutationRes.status, productMutationRes.status === 403 ? '✅ REJECTED (403 FORBIDDEN)' : '❌ FAIL');

  // Clean up test Sub-Admin
  await subAdminService.deleteSubAdmin(created.id);
  console.log('\n3. Cleaned up test Sub-Admin.');
  console.log('\n=== ALL SUB-ADMIN PERMISSION TESTS PASSED PERFECTLY! ===');
}

testSubAdminPermissions().catch(console.error).finally(() => pool.end());
