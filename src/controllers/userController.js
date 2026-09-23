const pool = require('../config/db');

exports.getUsers = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT username, emailid, contactno, active, createdate 
            FROM public.users
            ORDER BY createdate DESC
        `);
        
        const mappedUsers = result.rows.map(row => ({
            id: row.username,
            name: row.username, // the id is username which often is email or name
            email: row.emailid,
            phone: row.contactno,
            active: row.active,
            createdAt: row.createdate
        }));

        res.json({ success: true, count: mappedUsers.length, data: mappedUsers });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch users', error: error.message });
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

