const pool = require('../config/db');

exports.getUsers = async (req, res) => {
    try {
        const { period, page, limit, search } = req.query;

        // Calculate end date for filtering if period is provided
        let queryParams = [];
        let whereClause = '';

        if (period && period !== 'all') {
            let endDate = new Date();
            endDate.setHours(23, 59, 59, 999);
            queryParams.push(endDate.toISOString());
            whereClause = 'WHERE u.createdate <= $1';
        }

        const query = `
            SELECT 
                u.username, 
                u.emailid, 
                u.fullname, 
                u.contactno, 
                u.active, 
                u.createdate,
                COALESCE(u.member_since, u.createdate) as member_since,
                COUNT(DISTINCT o.id) as total_orders,
                COALESCE(SUM(CASE WHEN o.status != 'Cancelled' THEN o.total ELSE 0 END), 0) as total_spent
            FROM public.users u
            LEFT JOIN public.orders o ON u.username = o.user_id OR LOWER(u.emailid) = LOWER(o.user_id)
            ${whereClause}
            GROUP BY u.username, u.emailid, u.fullname, u.contactno, u.active, u.createdate, u.member_since
            ORDER BY u.createdate DESC
        `;

        const result = await pool.query(query, queryParams);
        
        // In-memory deduplication & phone sanitization
        const userMap = new Map();
        for (const row of result.rows) {
            const emailKey = (row.emailid || row.username || '').toLowerCase().trim();
            if (!emailKey) continue;

            let phoneVal = row.contactno;
            if (!phoneVal || phoneVal === 'null' || phoneVal === 'undefined' || !phoneVal.trim()) {
                phoneVal = null;
            }

            if (userMap.has(emailKey)) {
                const existing = userMap.get(emailKey);
                existing.totalOrders += parseInt(row.total_orders) || 0;
                existing.totalSpent += parseFloat(row.total_spent) || 0;
                if (!existing.phone && phoneVal) {
                    existing.phone = phoneVal;
                }
                if (row.fullname && row.fullname !== row.username) {
                    existing.name = row.fullname;
                }
            } else {
                userMap.set(emailKey, {
                    id: row.username,
                    name: row.fullname || row.username,
                    email: row.emailid,
                    phone: phoneVal,
                    active: row.active !== false,
                    createdAt: row.createdate || row.member_since,
                    totalOrders: parseInt(row.total_orders) || 0,
                    totalSpent: parseFloat(row.total_spent) || 0
                });
            }
        }

        let mappedUsers = Array.from(userMap.values());

        // Optional server-side search filter
        if (search && search.trim()) {
            const q = search.toLowerCase().trim();
            mappedUsers = mappedUsers.filter(u => 
                (u.name && u.name.toLowerCase().includes(q)) ||
                (u.email && u.email.toLowerCase().includes(q)) ||
                (u.phone && u.phone.toLowerCase().includes(q)) ||
                (u.id && u.id.toLowerCase().includes(q))
            );
        }

        const totalCount = mappedUsers.length;

        // Support optional pagination
        let paginatedUsers = mappedUsers;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);

        if (!isNaN(pageNum) && !isNaN(limitNum) && limitNum > 0) {
            const startIndex = (pageNum - 1) * limitNum;
            paginatedUsers = mappedUsers.slice(startIndex, startIndex + limitNum);
        }

        res.json({ 
            success: true, 
            count: paginatedUsers.length,
            totalCount, 
            page: pageNum || 1,
            totalPages: limitNum > 0 ? Math.ceil(totalCount / limitNum) : 1,
            data: paginatedUsers 
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch users', error: error.message });
    }
};

exports.toggleUserStatus = async (req, res) => {
    try {
        const { username } = req.params;
        const userCheck = await pool.query('SELECT active FROM public.users WHERE username = $1', [username]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        const currentActive = userCheck.rows[0].active !== false;
        const newActive = !currentActive;

        await pool.query('UPDATE public.users SET active = $1 WHERE username = $2', [newActive, username]);

        res.json({ success: true, message: `User status updated to ${newActive ? 'active' : 'inactive'}`, active: newActive });
    } catch (error) {
        console.error('Error toggling user status:', error);
        res.status(500).json({ success: false, message: 'Failed to toggle user status', error: error.message });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const { fullName, phone, avatar } = req.body;
        const username = req.user.id;

        if (!username) {
            return res.status(401).json({ success: false, message: 'User not identified' });
        }

        if (phone !== undefined && (!phone || !phone.trim())) {
            return res.status(400).json({ success: false, message: 'Mobile number is required' });
        }

        const result = await pool.query(`
            UPDATE public.users
            SET fullname = COALESCE($1, fullname),
                contactno = COALESCE($2, contactno),
                avatar_url = COALESCE($3, avatar_url)
            WHERE username = $4
            RETURNING username, emailid, fullname, contactno, avatar_url, member_since
        `, [fullName || null, phone || null, avatar || null, username]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const row = result.rows[0];
        const updatedUser = {
            id: row.username,
            email: row.emailid,
            fullName: row.fullname,
            phone: row.contactno,
            avatar: row.avatar_url,
            memberSince: row.member_since,
            twoFactorEnabled: true
        };

        res.json({ success: true, user: updatedUser });
    } catch (error) {
        console.error('Error updating user profile:', error);
        res.status(500).json({ success: false, message: 'Failed to update profile', error: error.message });
    }
};

exports.getProfile = async (req, res) => {
    try {
        const username = req.user.id;
        if (!username) {
            return res.status(401).json({ success: false, message: 'User not identified' });
        }

        const userResult = await pool.query(`
            SELECT username, emailid, fullname, contactno, avatar_url, member_since
            FROM public.users
            WHERE username = $1 OR emailid = $1
        `, [username]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User profile not found' });
        }

        const userRow = userResult.rows[0];
        const user = {
            id: userRow.username,
            userid: userRow.username,
            email: userRow.emailid,
            fullName: userRow.fullname || userRow.username,
            phone: userRow.contactno || '',
            avatar: userRow.avatar_url || '',
            memberSince: userRow.member_since
        };

        let addresses = [];
        try {
            const addressResult = await pool.query(`
                SELECT * FROM public.user_addresses 
                WHERE user_id = $1 
                ORDER BY is_default DESC, created_at DESC
            `, [username]);
            addresses = addressResult.rows;
        } catch (e) {
            console.error('Failed to fetch user addresses in profile:', e.message);
        }

        let ordersSummary = [];
        try {
            const ordersResult = await pool.query(`
                SELECT id, order_number, total_amount, status, created_at
                FROM public.orders
                WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT 5
            `, [username]);
            ordersSummary = ordersResult.rows;
        } catch (e) {
            console.error('Failed to fetch user orders in profile:', e.message);
        }

        res.json({
            success: true,
            user,
            addresses,
            ordersSummary
        });
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch profile', error: error.message });
    }
};

