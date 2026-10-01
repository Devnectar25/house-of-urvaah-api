const pool = require('../config/db');

const cleanId = (id) => {
    if (id === null || id === undefined) return null;
    const str = String(id).trim();
    const num = str.replace(/\D/g, '');
    return num ? parseInt(num, 10) : null;
};

exports.addToWishlist = async (userId, productId) => {
    try {
        const numProductId = cleanId(productId);
        if (!userId || !numProductId) return null;
        const result = await pool.query(
            'INSERT INTO wishlist (user_id, product_id) VALUES ($1, $2::integer) ON CONFLICT (user_id, product_id) DO NOTHING RETURNING *',
            [userId, numProductId]
        );
        return result.rows[0] || null;
    } catch (err) {
        console.warn('[wishlistService] Error adding to wishlist:', err.message);
        return null;
    }
};

exports.getWishlistByUser = async (userId) => {
    try {
        if (!userId) return [];
        const result = await pool.query(
            `SELECT w.*, COALESCE(p.title, p.productname, 'Product') AS productname, COALESCE(p.image_url, p.image, '') AS image, p.price, p.instock, p.stock_quantity, p.quantity
             FROM wishlist w
             JOIN products p ON w.product_id::text = p.product_id::text
             WHERE w.user_id = $1
             ORDER BY w.created_at DESC`,
            [userId]
        );
        return result.rows.map(p => ({
            id: p.id,
            productId: p.product_id ? p.product_id.toString() : '',
            productName: p.productname,
            productImage: p.image,
            productPrice: parseFloat(p.price || 0),
            addedDate: p.created_at,
            inStock: p.instock !== false,
            stockQuantity: p.stock_quantity || p.quantity || 0
        }));
    } catch (err) {
        console.warn('[wishlistService] Error fetching wishlist:', err.message);
        return [];
    }
};

exports.removeFromWishlist = async (userId, productId) => {
    try {
        const numProductId = cleanId(productId);
        if (!userId || !numProductId) return null;
        const result = await pool.query(
            'DELETE FROM wishlist WHERE user_id = $1 AND product_id = $2::integer RETURNING *',
            [userId, numProductId]
        );
        return result.rows[0] || null;
    } catch (err) {
        console.warn('[wishlistService] Error removing from wishlist:', err.message);
        return null;
    }
};

exports.getWishlistCount = async (userId) => {
    try {
        if (!userId) return 0;
        const result = await pool.query(
            'SELECT COUNT(*) FROM wishlist WHERE user_id = $1',
            [userId]
        );
        return parseInt(result.rows[0]?.count || 0, 10);
    } catch (err) {
        console.warn('[wishlistService] Error getting count:', err.message);
        return 0;
    }
};

exports.toggleWishlist = async (userId, productId) => {
    try {
        const numProductId = cleanId(productId);
        if (!userId || !numProductId) return { added: false };

        const checkResult = await pool.query(
            'SELECT * FROM wishlist WHERE user_id = $1 AND product_id = $2::integer',
            [userId, numProductId]
        );

        if (checkResult.rows.length > 0) {
            await pool.query(
                'DELETE FROM wishlist WHERE user_id = $1 AND product_id = $2::integer',
                [userId, numProductId]
            );
            return { added: false };
        } else {
            await pool.query(
                'INSERT INTO wishlist (user_id, product_id) VALUES ($1, $2::integer) ON CONFLICT (user_id, product_id) DO NOTHING',
                [userId, numProductId]
            );
            return { added: true };
        }
    } catch (err) {
        console.warn('[wishlistService] Error toggling wishlist:', err.message);
        return { added: false };
    }
};
