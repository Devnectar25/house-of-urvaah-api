const pool = require('../config/db');

const cleanId = (id) => {
    if (id === null || id === undefined) return null;
    const str = String(id).trim();
    const num = str.replace(/\D/g, '');
    return num ? parseInt(num, 10) : null;
};

const ensureUserExists = async (userId) => {
    if (!userId) return false;
    try {
        const uStr = String(userId).trim();
        const res = await pool.query(
            `SELECT username FROM public.users WHERE username = $1 OR emailid = $1 LIMIT 1`,
            [uStr]
        );
        return res.rows.length > 0;
    } catch (e) {
        console.warn('[cartService] ensureUserExists warning:', e.message);
        return false;
    }
};

exports.getCart = async (userId) => {
    if (!userId) return [];
    const result = await pool.query(
        `SELECT
            c.id,
            c.product_id,
            c.quantity,
            COALESCE(c.size, 'M') AS size,
            COALESCE(p.title, '') AS name,
            p.price,
            COALESCE(p.image_url, '') AS image,
            COALESCE(p.sale_price, p.price) AS originalprice,
            p.category_id,
            p.brand        AS brand_id,
            p.stock_quantity,
            p.size_stock,
            p.sizes,
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
    return result.rows.map(item => {
        const itemSize = (item.size || 'M').trim().toUpperCase();
        return {
            ...item,
            id: item.product_id.toString(),
            productId: item.product_id.toString(),
            cartItemId: item.id,
            selectedSize: itemSize,
            size: itemSize,
            name: item.name,
            brand: item.brand_name || 'House of Urvaah',
            category: item.category_name || 'Uncategorized',
            price: parseFloat(item.price || 0),
            originalPrice: parseFloat(item.originalprice || item.price || 0),
            discount: 0,
            category_id: item.category_id ?? null,
            brand_id: item.brand_id ?? null,
            stockQuantity: item.stock_quantity !== null && item.stock_quantity !== undefined ? parseInt(item.stock_quantity, 10) : null,
            sizeStock: item.size_stock || {},
            inStock: item.instock ?? true
        };
    });
};

exports.addToCart = async (userId, productId, quantity = 1, setMode = false, size = 'M') => {
    const numProductId = cleanId(productId);
    if (!userId || !numProductId) return null;

    const userExists = await ensureUserExists(userId);
    if (!userExists) {
        console.warn(`[cartService] addToCart: User ${userId} does not exist in DB.`);
        return null;
    }

    const cleanSize = (size ? String(size).trim().toUpperCase() : 'M');

    // Strict validation: check product existence and size stock
    const prodRes = await pool.query(
        `SELECT product_id, title, is_active, stock_quantity, size_stock FROM products WHERE product_id = $1 LIMIT 1`,
        [numProductId]
    );
    if (prodRes.rows.length === 0) return null;
    const prod = prodRes.rows[0];

    if (prod.is_active === false) {
        throw new Error(`Product "${prod.title || 'Product'}" is currently unavailable.`);
    }

    const sizeStock = prod.size_stock || {};
    let sizeLimit = null;
    if (sizeStock && typeof sizeStock === 'object' && Object.keys(sizeStock).length > 0) {
        const matchK = Object.keys(sizeStock).find(k => k.trim().toUpperCase() === cleanSize);
        if (matchK !== undefined) {
            sizeLimit = Math.max(0, parseInt(sizeStock[matchK], 10) || 0);
            if (sizeLimit <= 0) {
                throw new Error(`Size "${cleanSize}" for "${prod.title || 'Product'}" is out of stock.`);
            }
        }
    }

    const maxStock = sizeLimit !== null ? sizeLimit : (prod.stock_quantity !== null && prod.stock_quantity !== undefined ? parseInt(prod.stock_quantity, 10) : 99);
    if (maxStock <= 0) {
        throw new Error(`"${prod.title || 'Product'}" is out of stock.`);
    }

    const result = await pool.query(
        `INSERT INTO cart (user_id, product_id, size, quantity, created_at)
         VALUES ($1, $2, $3, LEAST($4, $5), NOW())
         ON CONFLICT (user_id, product_id, size)
         DO UPDATE SET 
            quantity = CASE WHEN $6 THEN EXCLUDED.quantity ELSE LEAST(cart.quantity + EXCLUDED.quantity, $5) END
         RETURNING *`,
        [userId, numProductId, cleanSize, quantity || 1, maxStock, setMode]
    );
    return result.rows[0];
};

exports.updateQuantity = async (userId, productId, quantity, size = null) => {
    const numProductId = cleanId(productId);
    if (!userId || !numProductId) return null;

    if (quantity <= 0) {
        return exports.removeFromCart(userId, productId, size);
    }

    const cleanSize = size ? String(size).trim().toUpperCase() : null;

    let query = `UPDATE cart
         SET quantity = LEAST($3, COALESCE((SELECT stock_quantity FROM products WHERE product_id = $2), $3))
         WHERE user_id = $1 AND product_id = $2`;
    const params = [userId, numProductId, quantity];
    if (cleanSize) {
        query += ` AND UPPER(TRIM(size)) = $4 RETURNING *`;
        params.push(cleanSize);
    } else {
        query += ` RETURNING *`;
    }

    const result = await pool.query(query, params);
    return result.rows[0];
};

exports.removeFromCart = async (userId, productId, size = null) => {
    const numProductId = cleanId(productId);
    if (!userId || !numProductId) return null;

    const cleanSize = size ? String(size).trim().toUpperCase() : null;
    let query = `DELETE FROM cart WHERE user_id = $1 AND product_id = $2`;
    const params = [userId, numProductId];
    if (cleanSize) {
        query += ` AND UPPER(TRIM(size)) = $3 RETURNING *`;
        params.push(cleanSize);
    } else {
        query += ` RETURNING *`;
    }

    const result = await pool.query(query, params);
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
    const userExists = await ensureUserExists(userId);
    if (!userExists) {
        console.warn(`[cartService] syncCart: User ${userId} does not exist in DB.`);
        return;
    }

    for (const item of localItems) {
        const pId = cleanId(item.id || item.productId || item.product?.id);
        if (!pId) continue;
        const cleanSize = (item.selectedSize || item.size || 'M').trim().toUpperCase();
        const qty = item.quantity || 1;

        const pRes = await pool.query(
            `SELECT stock_quantity, size_stock, is_active FROM products WHERE product_id = $1`,
            [pId]
        );
        if (pRes.rows.length === 0 || pRes.rows[0].is_active === false) continue;
        const prod = pRes.rows[0];
        const sStock = prod.size_stock || {};
        let sLimit = null;
        if (sStock && typeof sStock === 'object' && Object.keys(sStock).length > 0) {
            const mK = Object.keys(sStock).find(k => k.trim().toUpperCase() === cleanSize);
            if (mK !== undefined) {
                sLimit = Math.max(0, parseInt(sStock[mK], 10) || 0);
                if (sLimit <= 0) continue; // Skip out of stock size
            }
        }
        const maxStock = sLimit !== null ? sLimit : (prod.stock_quantity ?? 99);
        if (maxStock <= 0) continue;

        await pool.query(
            `INSERT INTO cart (user_id, product_id, size, quantity, created_at)
             VALUES ($1, $2, $3, LEAST($4, $5), NOW())
             ON CONFLICT (user_id, product_id, size)
             DO UPDATE SET 
                quantity = LEAST(EXCLUDED.quantity, $5)`,
            [userId, pId, cleanSize, qty, maxStock]
        );
    }
};


