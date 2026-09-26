const pool = require('../config/db');

const cleanId = (id) => {
    if (id === null || id === undefined) return null;
    const str = String(id).trim();
    const num = str.replace(/\D/g, '');
    return num ? parseInt(num, 10) : null;
};

exports.getCart = async (userId) => {
    if (!userId) return [];
    const result = await pool.query(
        `SELECT
            c.id,
            c.product_id,
            c.quantity,
            COALESCE(p.title, '') AS name,
            p.price,
            COALESCE(p.image_url, '') AS image,
            COALESCE(p.sale_price, p.price) AS originalprice,
            p.category_id,
            p.brand        AS brand_id,
            p.stock_quantity,
            COALESCE(p.is_active, true) AS instock,
            cat.name       AS category_name,
            b.name         AS brand_name
         FROM cart c
         JOIN products p ON c.product_id::text = p.product_id::text
         LEFT JOIN category cat ON p.category_id = cat.category_id
         LEFT JOIN brand b ON (p.brand_id = b.brand_id OR p.brand = b.name OR p.brand = b.brand_id::text)
         WHERE c.user_id = $1`,
        [userId]
    );
    return result.rows.map(item => ({
        ...item,
        id: item.product_id.toString(),
        productId: item.product_id.toString(),
        cartItemId: item.id,
        name: item.name,
        brand: item.brand_name || 'House of Urvaah',
        category: item.category_name || 'Uncategorized',
        price: parseFloat(item.price || 0),
        originalPrice: parseFloat(item.originalprice || item.price || 0),
        discount: 0,
        category_id: item.category_id ?? null,
        brand_id: item.brand_id ?? null,
        stockQuantity: item.stock_quantity !== null && item.stock_quantity !== undefined ? parseInt(item.stock_quantity, 10) : null,
        inStock: item.instock ?? true
    }));
};

exports.addToCart = async (userId, productId, quantity = 1, setMode = false) => {
    const numProductId = cleanId(productId);
    if (!userId || !numProductId) return null;

    const result = await pool.query(
        `INSERT INTO cart (user_id, product_id, quantity, created_at)
         SELECT $1, $2, $3, NOW()
         FROM products p WHERE p.product_id = $2
         ON CONFLICT (user_id, product_id)
         DO UPDATE SET 
            quantity = CASE WHEN $4 THEN EXCLUDED.quantity ELSE LEAST(cart.quantity + EXCLUDED.quantity, COALESCE((SELECT p2.stock_quantity FROM products p2 WHERE p2.product_id = cart.product_id), 99)) END
         RETURNING *`,
        [userId, numProductId, quantity || 1, setMode]
    );
    return result.rows[0];
};

exports.updateQuantity = async (userId, productId, quantity) => {
    const numProductId = cleanId(productId);
    if (!userId || !numProductId) return null;

    if (quantity <= 0) {
        return exports.removeFromCart(userId, productId);
    }

    const result = await pool.query(
        `UPDATE cart
         SET quantity = LEAST($3, COALESCE((SELECT stock_quantity FROM products WHERE product_id = $2), $3))
         WHERE user_id = $1 AND product_id = $2
         RETURNING *`,
        [userId, numProductId, quantity]
    );
    return result.rows[0];
};

exports.removeFromCart = async (userId, productId) => {
    const numProductId = cleanId(productId);
    if (!userId || !numProductId) return null;

    const result = await pool.query(
        `DELETE FROM cart
         WHERE user_id = $1 AND product_id = $2
         RETURNING *`,
        [userId, numProductId]
    );
    return result.rows[0];
};

exports.clearCart = async (userId) => {
    if (!userId) return;
    await pool.query(
        `DELETE FROM cart
         WHERE user_id = $1`,
        [userId]
    );
};

exports.syncCart = async (userId, localItems) => {
    if (!userId || !localItems || !Array.isArray(localItems)) return;

    for (const item of localItems) {
        const pId = cleanId(item.id || item.productId || item.product?.id);
        if (!pId) continue;
        const qty = item.quantity || 1;

        await pool.query(
            `INSERT INTO cart (user_id, product_id, quantity, created_at)
             SELECT $1, $2, LEAST($3, COALESCE(p.stock_quantity, $3)), NOW()
             FROM products p WHERE p.product_id = $2
             ON CONFLICT (user_id, product_id)
             DO UPDATE SET 
                quantity = LEAST(EXCLUDED.quantity, COALESCE((SELECT stock_quantity FROM products WHERE product_id = cart.product_id), EXCLUDED.quantity))`,
            [userId, pId, qty]
        );
    }
};

