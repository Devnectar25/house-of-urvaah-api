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
        
        // Fetch addresses for users and group by user_id
        const addressMap = new Map();
        try {
            const addrResult = await pool.query(`
                SELECT id, user_id, address_label, full_address, city, state, postal_code, is_default, recipient_name, phone, created_at
                FROM public.user_addresses
                ORDER BY is_default DESC, created_at DESC
            `);
            for (const addr of addrResult.rows) {
                const uKey = (addr.user_id || '').toLowerCase().trim();
                if (!uKey) continue;
                if (!addressMap.has(uKey)) {
                    addressMap.set(uKey, []);
                }
                addressMap.get(uKey).push(addr);
            }
        } catch (addrErr) {
            console.error('Error fetching addresses in getUsers:', addrErr.message);
        }

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
                const userAddrs = addressMap.get(emailKey) || 
                                  addressMap.get((row.username || '').toLowerCase().trim()) || 
                                  [];
                const primary = userAddrs.find(a => a.is_default) || userAddrs[0] || null;
                let formattedAddr = null;
                if (primary) {
                    const parts = [primary.full_address, primary.city, primary.state].filter(Boolean);
                    const pin = primary.postal_code ? ` - ${primary.postal_code}` : '';
                    formattedAddr = parts.join(', ') + pin;
                    if (!phoneVal && primary.phone) {
                        phoneVal = primary.phone;
                    }
                }

                userMap.set(emailKey, {
                    id: row.username,
                    name: row.fullname || row.username,
                    email: row.emailid,
                    phone: phoneVal,
                    active: row.active !== false,
                    createdAt: row.createdate || row.member_since,
                    totalOrders: parseInt(row.total_orders) || 0,
                    totalSpent: parseFloat(row.total_spent) || 0,
                    addresses: userAddrs,
                    primaryAddress: primary,
                    formattedAddress: formattedAddr
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
                (u.id && u.id.toLowerCase().includes(q)) ||
                (u.formattedAddress && u.formattedAddress.toLowerCase().includes(q))
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
        if (req.user?.role === 'admin') {
            return res.status(403).json({ success: false, message: 'Admin accounts cannot update customer profile' });
        }
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
        let username;
        // If caller is an admin, look for username / email / userId in query parameters
        if (req.user?.role === 'admin') {
            username = req.query.username || req.query.userId || req.query.email;
            if (!username) {
                return res.status(400).json({ success: false, message: 'Username/Email query parameter is required for admin' });
            }
        } else {
            username = req.user?.id || req.user?.username || req.user?.email;
        }

        if (!username) {
            return res.status(401).json({ success: false, message: 'User not identified' });
        }

        const cleanUsername = String(username).trim();

        const userResult = await pool.query(`
            SELECT username, emailid, fullname, contactno, avatar_url, member_since
            FROM public.users
            WHERE LOWER(username) = LOWER($1) OR LOWER(emailid) = LOWER($1)
        `, [cleanUsername]);

        let userRow = userResult.rows[0];

        // Fetch user addresses from user_addresses matching either username or email
        let addresses = [];
        try {
            const addressResult = await pool.query(`
                SELECT * FROM public.user_addresses 
                WHERE LOWER(user_id) = LOWER($1) OR LOWER(user_id) = LOWER($2)
                ORDER BY is_default DESC, created_at DESC
            `, [userRow?.username || cleanUsername, userRow?.emailid || cleanUsername]);
            addresses = addressResult.rows;
        } catch (e) {
            console.error('Failed to fetch user addresses in profile:', e.message);
        }

        if (!userRow) {
            if (addresses.length > 0) {
                const firstAddr = addresses[0];
                return res.json({
                    success: true,
                    user: {
                        id: cleanUsername,
                        userid: cleanUsername,
                        email: cleanUsername,
                        fullName: firstAddr.recipient_name || cleanUsername,
                        phone: firstAddr.phone || '',
                        avatar: '',
                        memberSince: firstAddr.created_at
                    },
                    addresses,
                    ordersSummary: []
                });
            }
            return res.status(404).json({ success: false, message: 'User profile not found' });
        }

        const user = {
            id: userRow.username,
            userid: userRow.username,
            email: userRow.emailid,
            fullName: userRow.fullname || userRow.username,
            phone: userRow.contactno || (addresses.length > 0 ? addresses[0].phone : '') || '',
            avatar: userRow.avatar_url || '',
            memberSince: userRow.member_since
        };

        let ordersSummary = [];
        try {
            const ordersResult = await pool.query(`
                SELECT id, order_number, total as total_amount, total, status, created_at
                FROM public.orders
                WHERE LOWER(user_id) = LOWER($1) OR LOWER(user_id) = LOWER($2)
                ORDER BY created_at DESC
                LIMIT 5
            `, [userRow.username, userRow.emailid]);
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

