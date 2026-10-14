const pool = require('../config/db');

exports.getAddressesByUserId = async (userId) => {
    const cleanId = String(userId || '').trim();
    const result = await pool.query(
        "SELECT * FROM public.user_addresses WHERE LOWER(user_id) = LOWER($1) ORDER BY is_default DESC, created_at DESC",
        [cleanId]
    );
    return result.rows;
};

exports.addAddress = async (data) => {
    const {
        user_id,
        address_label,
        type,
        full_address,
        street,
        address,
        city,
        state,
        postal_code,
        pincode,
        is_default,
        recipient_name,
        fullName,
        name,
        phone,
        mobile
    } = data;

    const cleanUserId = String(user_id || '').trim();
    const recipientName = recipient_name || fullName || name || '';
    const phoneNum = phone || mobile || '';
    const fullAddr = full_address || street || address || '';
    const postCode = postal_code || pincode || '';
    const label = address_label || type || 'Home';

    const countRes = await pool.query(
        "SELECT COUNT(*) FROM public.user_addresses WHERE LOWER(user_id) = LOWER($1)",
        [cleanUserId]
    );
    const count = parseInt(countRes.rows[0]?.count || 0, 10);
    if (count >= 4) {
        const error = new Error('You can save a maximum of 4 delivery addresses. Please delete or edit an existing address.');
        error.statusCode = 400;
        throw error;
    }
    const shouldBeDefault = is_default || count === 0;

    if (shouldBeDefault) {
        await pool.query(
            "UPDATE public.user_addresses SET is_default = FALSE WHERE LOWER(user_id) = LOWER($1)",
            [cleanUserId]
        );
    }

    const result = await pool.query(
        `INSERT INTO public.user_addresses 
        (user_id, address_label, full_address, city, state, postal_code, is_default, recipient_name, phone) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
        RETURNING *`,
        [cleanUserId, label, fullAddr, city || '', state || '', postCode, shouldBeDefault, recipientName, phoneNum]
    );
    return result.rows[0];
};

exports.updateAddress = async (id, data) => {
    const {
        address_label,
        type,
        full_address,
        street,
        address,
        city,
        state,
        postal_code,
        pincode,
        is_default,
        user_id,
        recipient_name,
        fullName,
        name,
        phone,
        mobile
    } = data;

    const cleanUserId = user_id ? String(user_id).trim() : null;
    const recipientName = recipient_name || fullName || name || '';
    const phoneNum = phone || mobile || '';
    const fullAddr = full_address || street || address || '';
    const postCode = postal_code || pincode || '';
    const label = address_label || type || 'Home';

    if (is_default && cleanUserId) {
        await pool.query(
            "UPDATE public.user_addresses SET is_default = FALSE WHERE LOWER(user_id) = LOWER($1)",
            [cleanUserId]
        );
    }

    const result = await pool.query(
        `UPDATE public.user_addresses 
        SET address_label = $1, full_address = $2, city = $3, state = $4, postal_code = $5, is_default = $6, recipient_name = $7, phone = $8 
        WHERE id = $9 
        RETURNING *`,
        [label, fullAddr, city || '', state || '', postCode, !!is_default, recipientName, phoneNum, id]
    );
    return result.rows[0];
};

exports.deleteAddress = async (id, userId) => {
    let cleanUserId = userId ? String(userId).trim() : null;
    if (!cleanUserId) {
        const ownerRes = await pool.query("SELECT user_id FROM public.user_addresses WHERE id = $1", [id]);
        if (ownerRes.rows.length > 0) {
            cleanUserId = ownerRes.rows[0].user_id;
        }
    }

    if (cleanUserId) {
        const countRes = await pool.query(
            "SELECT COUNT(*) FROM public.user_addresses WHERE LOWER(user_id) = LOWER($1)",
            [cleanUserId]
        );
        const count = parseInt(countRes.rows[0]?.count || 0, 10);
        if (count <= 1) {
            const error = new Error('At least 1 delivery address is required. You cannot delete your only saved address.');
            error.statusCode = 400;
            throw error;
        }
    }

    await pool.query("DELETE FROM public.user_addresses WHERE id = $1", [id]);
    return { success: true };
};

