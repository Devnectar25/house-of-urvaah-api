const pool = require('../config/db');
const bcrypt = require('bcryptjs');

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
    const { username, password, permissions } = data;
    if (!username || !username.trim()) throw new Error("Username is required");
    if (!password || !password.trim()) throw new Error("Password is required");

    const existing = await pool.query("SELECT * FROM public.admins WHERE LOWER(userid) = LOWER($1)", [username.trim()]);
    if (existing.rows.length > 0) throw new Error("Username already exists");

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password.trim(), salt);

    const result = await pool.query(
        "INSERT INTO public.admins (userid, password, accesstopage, active, createdate) VALUES ($1, $2, $3, true, NOW()) RETURNING *",
        [username.trim(), hashedPassword, Array.isArray(permissions) ? permissions : []]
    );

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
        values.push(Array.isArray(permissions) ? permissions : []);
    }

    if (username !== undefined && username.trim() !== '') {
        // Check uniqueness if username changed
        const duplicateCheck = await pool.query("SELECT * FROM public.admins WHERE userid = $1 AND adminid != $2", [username.trim(), id]);
        if (duplicateCheck.rows.length > 0) throw new Error("Username already taken by another admin");

        setClauses.push(`userid = $${paramIndex++}`);
        values.push(username.trim());
    }

    if (password && password.trim() !== '') {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password.trim(), salt);
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

