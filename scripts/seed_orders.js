const pool = require('../src/config/db');

async function seedOrders() {
  try {
    console.log('--- Seeding Realistic Orders for House of Urvaah ---');

    // Get a user and address
    const userRes = await pool.query('SELECT username FROM users LIMIT 1');
    const username = userRes.rows[0]?.username || 'khushal.mali0506@gmail.com';

    // Get an address or insert fallback
    let addrRes = await pool.query('SELECT id FROM user_addresses LIMIT 1');
    let addressId;
    if (addrRes.rows.length === 0) {
      const newAddr = await pool.query(
        "INSERT INTO user_addresses (user_id, full_address, city, state, postal_code, address_label, is_default) VALUES ($1, '102 Luxury Towers, Bandra West', 'Mumbai', 'Maharashtra', '400050', 'Home', true) RETURNING id",
        [username]
      );
      addressId = newAddr.rows[0].id;
    } else {
      addressId = addrRes.rows[0].id;
    }

    // Products sample
    const prodRes = await pool.query('SELECT product_id, title, price FROM products LIMIT 5');
    const products = prodRes.rows;

    const sampleOrders = [
      {
        orderNumber: 'HOU-ORD-1001',
        total: 4999.00,
        subtotal: 4999.00,
        shipping: 0,
        paymentMethod: 'card',
        paymentStatus: 'Paid',
        paymentType: 'Card',
        status: 'Delivered',
        customerName: 'Aanya Sharma',
        customerEmail: 'aanya.sharma@example.com',
        createdAt: '2026-09-20T10:30:00Z',
        items: [
          { productId: products[0]?.product_id || 103, quantity: 1, price: 4999.00 }
        ]
      },
      {
        orderNumber: 'HOU-ORD-1002',
        total: 7850.00,
        subtotal: 7850.00,
        shipping: 0,
        paymentMethod: 'upi',
        paymentStatus: 'Paid',
        paymentType: 'UPI',
        status: 'Shipped',
        customerName: 'Priya Kapoor',
        customerEmail: 'priya.k@example.com',
        createdAt: '2026-09-22T14:15:00Z',
        items: [
          { productId: products[1]?.product_id || 102, quantity: 1, price: 7850.00 }
        ]
      },
      {
        orderNumber: 'HOU-ORD-1003',
        total: 3450.00,
        subtotal: 3450.00,
        shipping: 0,
        paymentMethod: 'cod',
        paymentStatus: 'Pending',
        paymentType: 'COD',
        status: 'Pending',
        customerName: 'Rohan Mehta',
        customerEmail: 'rohan.m@example.com',
        createdAt: '2026-09-25T09:00:00Z',
        items: [
          { productId: products[2]?.product_id || 105, quantity: 1, price: 3450.00 }
        ]
      },
      {
        orderNumber: 'HOU-ORD-1004',
        total: 6200.00,
        subtotal: 6200.00,
        shipping: 0,
        paymentMethod: 'upi',
        paymentStatus: 'Paid',
        paymentType: 'UPI',
        status: 'Processing',
        customerName: 'Kavya Verma',
        customerEmail: 'kavya.v@example.com',
        createdAt: '2026-09-24T16:45:00Z',
        items: [
          { productId: products[3]?.product_id || 104, quantity: 1, price: 6200.00 }
        ]
      },
      {
        orderNumber: 'HOU-ORD-1005',
        total: 8900.00,
        subtotal: 8900.00,
        shipping: 0,
        paymentMethod: 'card',
        paymentStatus: 'Paid',
        paymentType: 'Card',
        status: 'Out for Delivery',
        customerName: 'Meera Rajput',
        customerEmail: 'meera.r@example.com',
        createdAt: '2026-09-23T11:20:00Z',
        items: [
          { productId: products[0]?.product_id || 103, quantity: 1, price: 8900.00 }
        ]
      },
      {
        orderNumber: 'HOU-ORD-1006',
        total: 2999.00,
        subtotal: 2999.00,
        shipping: 0,
        paymentMethod: 'card',
        paymentStatus: 'Failed',
        paymentType: 'Online',
        status: 'Pending',
        customerName: 'Siddharth Nair',
        customerEmail: 'siddharth.n@example.com',
        createdAt: '2026-09-25T18:10:00Z',
        items: [
          { productId: products[1]?.product_id || 102, quantity: 1, price: 2999.00 }
        ]
      },
      {
        orderNumber: 'HOU-ORD-1007',
        total: 5500.00,
        subtotal: 5500.00,
        shipping: 0,
        paymentMethod: 'upi',
        paymentStatus: 'Refunded',
        paymentType: 'UPI',
        status: 'Cancelled',
        customerName: 'Ananya Roy',
        customerEmail: 'ananya.roy@example.com',
        createdAt: '2026-09-18T13:00:00Z',
        items: [
          { productId: products[2]?.product_id || 105, quantity: 1, price: 5500.00 }
        ]
      },
      {
        orderNumber: 'HOU-ORD-1008',
        total: 4200.00,
        subtotal: 4200.00,
        shipping: 0,
        paymentMethod: 'card',
        paymentStatus: 'Paid',
        paymentType: 'Card',
        status: 'Returned',
        customerName: 'Tanya Joshi',
        customerEmail: 'tanya.j@example.com',
        createdAt: '2026-09-15T15:30:00Z',
        items: [
          { productId: products[3]?.product_id || 104, quantity: 1, price: 4200.00 }
        ]
      },
      {
        orderNumber: 'HOU-ORD-1009',
        total: 6700.00,
        subtotal: 6700.00,
        shipping: 0,
        paymentMethod: 'cod',
        paymentStatus: 'Pending',
        paymentType: 'COD',
        status: 'Exchanged',
        customerName: 'Neha Deshmukh',
        customerEmail: 'neha.d@example.com',
        createdAt: '2026-09-12T10:00:00Z',
        items: [
          { productId: products[0]?.product_id || 103, quantity: 1, price: 6700.00 }
        ]
      }
    ];

    for (const ord of sampleOrders) {
      // Create user if not existing
      await pool.query(
        "INSERT INTO users (username, emailid, fullname, contactno) VALUES ($1, $1, $2, '9876543210') ON CONFLICT (username) DO NOTHING",
        [ord.customerEmail, ord.customerName]
      );

      // Insert Order
      const insRes = await pool.query(
        `INSERT INTO orders (
          order_number, user_id, address_id, total, subtotal, shipping_cost,
          payment_method, payment_status, payment_type, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        ON CONFLICT DO NOTHING
        RETURNING id`,
        [
          ord.orderNumber, ord.customerEmail, addressId, ord.total, ord.subtotal, ord.shipping,
          ord.paymentMethod, ord.paymentStatus, ord.paymentType, ord.status, ord.createdAt
        ]
      );

      if (insRes.rows.length > 0) {
        const orderId = insRes.rows[0].id;
        for (const item of ord.items) {
          await pool.query(
            `INSERT INTO order_items (order_id, product_id, quantity, price, created_at) VALUES ($1, $2, $3, $4, NOW())`,
            [orderId, item.productId, item.quantity, item.price]
          );
        }
        console.log(`Seeded order ${ord.orderNumber} (${ord.status})`);
      }
    }

    console.log('✅ Orders seeded successfully!');
  } catch (err) {
    console.error('❌ Error seeding orders:', err);
  } finally {
    process.exit(0);
  }
}

seedOrders();
