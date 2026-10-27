const pool = require('../config/db');
const bcrypt = require('bcryptjs');

// Modules a sub-admin can be granted. Keep in sync with FE src/constants/adminPermissions.js.
// 'subadmins' is deliberately not grantable: sub-admin management is super-admin only.
const ALLOWED_PERMISSIONS = [
    'analytics', 'products', 'categories',
    'orders', 'refunds',
    'customers', 'leads', 'reviews',
    'email-notifications', 'stock-notifications', 'faqs',
    'modify-ui', 'error-monitoring', 'settings'
];
const RESERVED_USERNAMES = ['admin', 'administrator', 'root', 'superadmin', 'super_admin', 'system'];
// Maximum number of sub-admin accounts (the super 'Admin' account is not counted).
// Keep in sync with MAX_SUB_ADMINS in FE src/constants/adminPermissions.js.
const MAX_SUB_ADMINS = 10;

const validationError = (message) => {
    const err = new Error(message);
    err.statusCode = 400;
    return err;
};

const validateUsername = (raw) => {
    const username = String(raw || '').trim();
    if (!username) throw validationError('Username is required');
    if (username.length < 3 || username.length > 50) throw validationError('Username must be 3-50 characters');
    if (!/^[A-Za-z0-9._@-]+$/.test(username)) throw validationError('Username may only contain letters, numbers, and . _ - @ (no spaces)');
    if (username.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(username)) throw validationError('Enter a valid email address as username');
    if (RESERVED_USERNAMES.includes(username.toLowerCase())) throw validationError('This username is reserved');
    return username;
};

const validatePassword = (password, username = '') => {
    const p = String(password || '');
    if (!p) throw validationError('Password is required');
    if (p.length < 8 || p.length > 64) throw validationError('Password must be 8-64 characters');
    if (/\s/.test(p)) throw validationError('Password must not contain spaces');
    if (!/[A-Z]/.test(p) || !/[a-z]/.test(p) || !/\d/.test(p) || !/[^A-Za-z0-9]/.test(p)) {
        throw validationError('Password must include an uppercase letter, a lowercase letter, a number, and a special character');
    }
    if (username && p.toLowerCase().includes(String(username).toLowerCase())) {
        throw validationError('Password must not contain the username');
    }
    return p;
};

const validatePermissions = (permissions) => {
    if (!Array.isArray(permissions)) throw validationError('Permissions must be a list');
    const normalized = Array.from(new Set(permissions.map((p) => (p === 'refund-desk' ? 'refunds' : String(p)))));
    const unknown = normalized.filter((p) => !ALLOWED_PERMISSIONS.includes(p));
    if (unknown.length > 0) throw validationError(`Invalid permission(s): ${unknown.join(', ')}`);
    if (normalized.length === 0) throw validationError('Select at least one permission module');
    return normalized;
};

exports.ALLOWED_PERMISSIONS = ALLOWED_PERMISSIONS;
exports.MAX_SUB_ADMINS = MAX_SUB_ADMINS;

exports.getSubAdmins = async () => {
    const result = await pool.query("SELECT * FROM public.admins WHERE userid != 'Admin'");
    return result.rows.map(row => ({
        id: row.adminid.toString(),
        username: row.userid,
        role: 'sub_admin',
        permissions: row.accesstopage || [],
        active: row.active,
        createdate: row.createdate
    }));
};

exports.createSubAdmin = async (data) => {
    const username = validateUsername(data.username);
    const password = validatePassword(data.password, username);
    const permissions = validatePermissions(data.permissions);

    const existing = await pool.query("SELECT 1 FROM public.admins WHERE LOWER(userid) = LOWER($1)", [username]);
    if (existing.rows.length > 0) throw validationError("Username already exists");

    const countRes = await pool.query("SELECT COUNT(*)::int AS total FROM public.admins WHERE userid != 'Admin'");
    if (countRes.rows[0].total >= MAX_SUB_ADMINS) {
        throw validationError(`Sub-admin limit reached: a maximum of ${MAX_SUB_ADMINS} sub-admins can be created. Delete an existing sub-admin to add a new one.`);
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Count check and insert in one statement so two simultaneous requests can't exceed the limit
    const result = await pool.query(
        `INSERT INTO public.admins (userid, password, accesstopage, active, createdate)
         SELECT $1, $2, $3, true, NOW()
         WHERE (SELECT COUNT(*) FROM public.admins WHERE userid != 'Admin') < $4
         RETURNING *`,
        [username, hashedPassword, permissions, MAX_SUB_ADMINS]
    );
    if (result.rows.length === 0) {
        throw validationError(`Sub-admin limit reached: a maximum of ${MAX_SUB_ADMINS} sub-admins can be created.`);
    }

    const row = result.rows[0];
    return {
        id: row.adminid.toString(),
        username: row.userid,
        role: 'sub_admin',
        permissions: row.accesstopage || [],
        active: row.active,
        createdate: row.createdate
    };
};

exports.updateSubAdmin = async (id, data) => {
    const { username, password, permissions, active } = data;
    
    const existing = await pool.query("SELECT * FROM public.admins WHERE adminid = $1 AND userid != 'Admin'", [id]);
    if (existing.rows.length === 0) throw new Error("Sub-admin not found");

    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    if (permissions !== undefined) {
        setClauses.push(`accesstopage = $${paramIndex++}`);
        values.push(validatePermissions(permissions));
    }

    const effectiveUsername = (username !== undefined && String(username).trim() !== '')
        ? validateUsername(username)
        : existing.rows[0].userid;

    if (username !== undefined && String(username).trim() !== '') {
        // Check uniqueness (case-insensitive) if username changed
        const duplicateCheck = await pool.query("SELECT 1 FROM public.admins WHERE LOWER(userid) = LOWER($1) AND adminid != $2", [effectiveUsername, id]);
        if (duplicateCheck.rows.length > 0) throw validationError("Username already taken by another admin");

        setClauses.push(`userid = $${paramIndex++}`);
        values.push(effectiveUsername);
    }

    if (password !== undefined && password !== null && String(password) !== '') {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(validatePassword(password, effectiveUsername), salt);
        setClauses.push(`password = $${paramIndex++}`);
        values.push(hashedPassword);
    }

    if (active !== undefined) {
        setClauses.push(`active = $${paramIndex++}`);
        values.push(Boolean(active));
    }

    if (setClauses.length === 0) {
        const row = existing.rows[0];
        return {
            id: row.adminid.toString(),
            username: row.userid,
            role: 'sub_admin',
            permissions: row.accesstopage || [],
            active: row.active,
            createdate: row.createdate
        };
    }

    values.push(id);
    const query = `UPDATE public.admins SET ${setClauses.join(', ')} WHERE adminid = $${paramIndex} RETURNING *`;

    const result = await pool.query(query, values);
    const row = result.rows[0];

    return {
        id: row.adminid.toString(),
        username: row.userid,
        role: 'sub_admin',
        permissions: row.accesstopage || [],
        active: row.active,
        createdate: row.createdate
    };
};

exports.deleteSubAdmin = async (id) => {
    const existing = await pool.query("SELECT * FROM public.admins WHERE adminid = $1 AND userid != 'Admin'", [id]);
    if (existing.rows.length === 0) throw new Error("Sub-admin not found");

    await pool.query("DELETE FROM public.admins WHERE adminid = $1", [id]);
};

