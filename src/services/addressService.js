const pool = require('../config/db');

exports.getAddressesByUserId = async (userId) => {
    const result = await pool.query(
        "SELECT * FROM public.user_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC",
        [userId]
    );
    return result.rows;
};

exports.addAddress = async (data) => {
    const { user_id, address_label, full_address, city, state, postal_code, is_default, recipient_name, name, phone } = data;
    const recipientName = recipient_name || name || '';
    const phoneNum = phone || '';

    const countRes = await pool.query(
        "SELECT COUNT(*) FROM public.user_addresses WHERE user_id = $1",
        [user_id]
    );
    const count = parseInt(countRes.rows[0]?.count || 0, 10);
    const shouldBeDefault = is_default || count === 0;

    if (shouldBeDefault) {
        await pool.query(
            "UPDATE public.user_addresses SET is_default = FALSE WHERE user_id = $1",
            [user_id]
        );
    }

    const result = await pool.query(
        `INSERT INTO public.user_addresses 
        (user_id, address_label, full_address, city, state, postal_code, is_default, recipient_name, phone) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
        RETURNING *`,
        [user_id, address_label || 'Home', full_address, city, state, postal_code, shouldBeDefault, recipientName, phoneNum]
    );
    return result.rows[0];
};

exports.updateAddress = async (id, data) => {
    const { address_label, full_address, city, state, postal_code, is_default, user_id, recipient_name, name, phone } = data;
    const recipientName = recipient_name || name || '';
    const phoneNum = phone || '';

    if (is_default && user_id) {
        await pool.query(
            "UPDATE public.user_addresses SET is_default = FALSE WHERE user_id = $1",
            [user_id]
        );
    }

    const result = await pool.query(
        `UPDATE public.user_addresses 
        SET address_label = $1, full_address = $2, city = $3, state = $4, postal_code = $5, is_default = $6, recipient_name = $7, phone = $8 
        WHERE id = $9 
        RETURNING *`,
        [address_label || 'Home', full_address, city, state, postal_code, !!is_default, recipientName, phoneNum, id]
    );
    return result.rows[0];
};

exports.deleteAddress = async (id) => {
    await pool.query("DELETE FROM public.user_addresses WHERE id = $1", [id]);
    return { success: true };
};

