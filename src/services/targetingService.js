const pool = require('../config/db');
const analyticsService = require('../ga/analyticsService.cjs');

/**
 * Fetch top customers by total spending and order count
 * @param {number} limit 
 */
exports.getTopCustomers = async (limit = 50) => {
    const query = `
        SELECT
            u.username                        AS id,
            u.username,
            u.emailid                         AS email,
            u.contactno,
            u.createdate                      AS created_at,
            COUNT(o.id)::int                  AS total_orders,
            COALESCE(SUM(o.total), 0)::float    AS total_revenue
        FROM users u
        LEFT JOIN orders o ON u.username = o.user_id
            AND o.status NOT IN ('Cancelled', 'Returned')
        GROUP BY u.username, u.emailid, u.contactno, u.createdate
        ORDER BY total_revenue DESC, total_orders DESC
        LIMIT $1
    `;
    const result = await pool.query(query, [limit]);
    return result.rows.map(row => ({
        ...row,
        total_orders: parseInt(row.total_orders, 10),
        total_revenue: parseFloat(row.total_revenue),
        orders: parseInt(row.total_orders, 10),
        order_count: parseInt(row.total_orders, 10)
    }));
};

/**
 * Fetch all customers with their assignment status for a given coupon.
 * @param {number|null} couponId
 */
exports.getAllUsers = async (couponId = null) => {
    const query = couponId
        ? `SELECT
               u.username           AS id,
               u.username,
               u.emailid            AS email,
               u.contactno,
               u.createdate         AS created_at,
               ca.status
           FROM users u
           LEFT JOIN coupon_assignments ca
               ON ca.user_id = u.username AND ca.coupon_id = $1
           ORDER BY u.createdate DESC`
        : `SELECT
               username             AS id,
               username,
               emailid              AS email,
               contactno,
               createdate           AS created_at,
               NULL                 AS status
           FROM users
           ORDER BY createdate DESC`;

    const result = couponId
        ? await pool.query(query, [couponId])
        : await pool.query(query);
    return result.rows;
};

/**
 * Fetch users by IDs
 * @param {Array} userIds 
 */
exports.getUsersByIds = async (userIds) => {
    if (!userIds || userIds.length === 0) return [];

    const query = `
        SELECT username as id, username, emailid as email, contactno, createdate as created_at
        FROM users
        WHERE username = ANY($1)
    `;
    const result = await pool.query(query, [userIds]);
    return result.rows;
};

/**
 * Assign coupon to multiple users (syncs both coupon_assignments and user_coupons)
 * @param {number} couponId 
 * @param {Array} userIds 
 */
exports.assignCouponToUsers = async (couponId, userIds) => {
    if (!userIds || userIds.length === 0) return { success: true, assignedCount: 0 };

    // Verify coupon exists
    const couponCheck = await pool.query(
        'SELECT id FROM coupons WHERE id = $1',
        [couponId]
    );
    if (couponCheck.rows.length === 0) throw new Error('Invalid coupon ID');

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Insert into coupon_assignments
        const result = await client.query(
            `INSERT INTO coupon_assignments (coupon_id, user_id, status, assigned_at)
             SELECT $1, unnest($2::text[]), 'assigned', NOW()
             ON CONFLICT (coupon_id, user_id)
             DO UPDATE
                 SET status      = 'assigned',
                     assigned_at = NOW()
                 WHERE coupon_assignments.status = 'revoked'
             RETURNING id`,
            [couponId, userIds]
        );

        // Also sync user_coupons table
        await client.query(
            `INSERT INTO user_coupons (coupon_id, user_id, assigned_at)
             SELECT $1, unnest($2::text[]), NOW()
             ON CONFLICT (coupon_id, user_id) DO NOTHING`,
            [couponId, userIds]
        );

        await client.query('COMMIT');
        return { success: true, assignedCount: result.rowCount };

    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
};

/**
 * Fetch active users using actual order timestamps and activity from PostgreSQL
 * @param {number} limit 
 */
exports.getActiveUsers = async (limit = 50) => {
    try {
        let activeUsers = [];
        try {
            activeUsers = await analyticsService.getTopActiveUsers('30d', limit);
        } catch {
            activeUsers = [];
        }

        if (Array.isArray(activeUsers) && activeUsers.length > 0) {
            return activeUsers.map(u => ({
                id: u.userId,
                username: u.userName || u.userId,
                email: u.email,
                contactno: u.phone,
                orders: parseInt(u.totalOrders || 0, 10),
                total_orders: parseInt(u.totalOrders || 0, 10),
                revenue: parseFloat(u.totalRevenue || 0),
                total_revenue: parseFloat(u.totalRevenue || 0),
                last_active: u.lastActiveDate || new Date().toISOString()
            }));
        }

        // Fallback to querying order activity & user accounts directly from PostgreSQL
        const dbQuery = `
            SELECT
                u.username                        AS id,
                u.username,
                u.emailid                         AS email,
                u.contactno,
                u.createdate                      AS created_at,
                COUNT(o.id)::int                  AS total_orders,
                COALESCE(SUM(o.total), 0)::float    AS total_revenue,
                COALESCE(MAX(o.created_at), u.createdate) AS last_active
            FROM users u
            LEFT JOIN orders o ON u.username = o.user_id
            GROUP BY u.username, u.emailid, u.contactno, u.createdate
            ORDER BY last_active DESC, total_revenue DESC
            LIMIT $1
        `;
        const result = await pool.query(dbQuery, [limit]);
        return result.rows.map(row => ({
            ...row,
            orders: parseInt(row.total_orders, 10),
            total_orders: parseInt(row.total_orders, 10),
            revenue: parseFloat(row.total_revenue),
            total_revenue: parseFloat(row.total_revenue),
            last_active: row.last_active
        }));

    } catch (error) {
        console.error("Error fetching active users:", error);
        return [];
    }
};
