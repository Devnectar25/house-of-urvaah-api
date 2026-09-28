const pool = require('../config/db');

/**
 * Create a new coupon in a single database transaction
 */
exports.createCoupon = async (data) => {
    const {
        code, description, discount_type, discount_value, max_discount, min_order_value,
        usage_limit, per_user_limit, starts_at, expires_at, expiry_date,
        applies_to, apply_to, category_ids, categoryIds, product_ids, productIds,
        customer_ids, customerIds, user_ids, userIds,
        is_private, is_restricted, is_active, active
    } = data;

    // ── 1. Code Validation ─────────────────────────────────────────────────────
    let finalCode = code ? String(code).trim().toUpperCase() : null;
    if (!finalCode) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude lookalikes 0,O,1,I
        let result = '';
        for (let i = 0; i < 8; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
        finalCode = `HOM${result}`;
    } else {
        const codeRegex = /^[A-Z0-9_-]{4,20}$/;
        if (!codeRegex.test(finalCode)) {
            throw new Error('Coupon code must be 4-20 characters long using uppercase letters, numbers, hyphens or underscores only.');
        }
    }

    const existingCodeRes = await pool.query('SELECT id FROM coupons WHERE UPPER(code) = UPPER($1)', [finalCode]);
    if (existingCodeRes.rows.length > 0) {
        throw new Error('This coupon code already exists');
    }

    // ── 2. Discount Type & Value Validation ──────────────────────────────────
    const finalDiscountType = (discount_type || 'percentage').toLowerCase();
    const allowedTypes = ['percentage', 'fixed', 'bogo'];
    if (!allowedTypes.includes(finalDiscountType)) {
        throw new Error(`Discount type must be one of: ${allowedTypes.join(', ')}`);
    }

    let parsedDiscountValue = 0;
    if (finalDiscountType !== 'bogo') {
        parsedDiscountValue = parseFloat(discount_value);
        if (discount_value === undefined || discount_value === null || isNaN(parsedDiscountValue)) {
            throw new Error('Discount value is required and must be a number');
        }
        if (parsedDiscountValue <= 0) {
            throw new Error('Discount value must be greater than 0');
        }
        if (finalDiscountType === 'percentage' && parsedDiscountValue > 100) {
            throw new Error('Percentage discount cannot exceed 100%');
        }
    }

    // ── 3. Min Order Value & Max Discount Validation ─────────────────────────
    let parsedMinOrder = 0;
    if (min_order_value !== undefined && min_order_value !== null && min_order_value !== '') {
        parsedMinOrder = parseFloat(min_order_value);
        if (isNaN(parsedMinOrder) || parsedMinOrder < 0) {
            throw new Error('Minimum order value cannot be negative');
        }
    }

    if (finalDiscountType === 'fixed' && parsedMinOrder > 0 && parsedDiscountValue >= parsedMinOrder) {
        throw new Error('Fixed discount cannot be equal to or greater than minimum order value');
    }

    let parsedMaxDiscount = null;
    if (finalDiscountType === 'percentage' && max_discount !== undefined && max_discount !== null && max_discount !== '') {
        parsedMaxDiscount = parseFloat(max_discount);
        if (isNaN(parsedMaxDiscount) || parsedMaxDiscount < 0) {
            throw new Error('Maximum discount cap cannot be negative');
        }
    }

    // ── 4. Usage & Per-User Limit Validation ─────────────────────────────────
    let parsedUsageLimit = usage_limit ? parseInt(usage_limit, 10) : null;
    if (parsedUsageLimit !== null && (isNaN(parsedUsageLimit) || parsedUsageLimit < 1)) {
        throw new Error('Usage limit must be a positive integer');
    }

    let parsedPerUserLimit = per_user_limit ? parseInt(per_user_limit, 10) : null;
    if (parsedPerUserLimit !== null && (isNaN(parsedPerUserLimit) || parsedPerUserLimit < 1)) {
        throw new Error('Per-user limit must be a positive integer');
    }

    if (parsedUsageLimit !== null && parsedPerUserLimit !== null && parsedPerUserLimit > parsedUsageLimit) {
        throw new Error('Per-user limit cannot exceed total usage limit');
    }

    // ── 5. Dates Validation ────────────────────────────────────────────────────
    const startDate = starts_at ? new Date(starts_at) : new Date();
    const rawExpiry = expires_at || expiry_date;
    if (!rawExpiry) {
        throw new Error('Expiry date is required');
    }
    const expiryDate = new Date(rawExpiry);
    if (isNaN(expiryDate.getTime())) {
        throw new Error('Invalid expiry date');
    }

    if (expiryDate <= startDate) {
        throw new Error('Expiry date must be later than start date');
    }
    if (expiryDate <= new Date()) {
        throw new Error('Expiry date must be in the future');
    }

    // ── 6. Scope Validation ────────────────────────────────────────────────────
    const rawScope = applies_to || apply_to || 'all';
    let finalScope = 'all';
    if (rawScope === 'categories' || rawScope === 'category') finalScope = 'categories';
    else if (rawScope === 'products' || rawScope === 'product') finalScope = 'products';

    const finalCatIds = category_ids || categoryIds || [];
    const finalProdIds = product_ids || productIds || [];

    if (finalScope === 'categories' && (!Array.isArray(finalCatIds) || finalCatIds.length === 0)) {
        throw new Error('Please select at least one category for category scope');
    }
    if (finalScope === 'products' && (!Array.isArray(finalProdIds) || finalProdIds.length === 0)) {
        throw new Error('Please select at least one product for product scope');
    }

    // ── 7. Description Validation ──────────────────────────────────────────────
    const finalDescription = description ? String(description).trim() : null;
    if (finalDescription && finalDescription.length > 120) {
        throw new Error('Description cannot exceed 120 characters');
    }

    const finalIsPrivate = is_private === true || is_restricted === true || is_private === 'true' || is_restricted === 'true';
    const finalIsActive = is_active !== undefined ? Boolean(is_active) : (active !== undefined ? Boolean(active) : true);

    const finalCustomerIds = customer_ids || customerIds || user_ids || userIds || [];

    // ── Transaction Execution ──────────────────────────────────────────────────
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const mainCatId = (finalScope === 'categories' && finalCatIds.length > 0) ? finalCatIds[0] : null;
        const mainProdId = (finalScope === 'products' && finalProdIds.length > 0) ? finalProdIds[0] : null;

        const result = await client.query(
            `INSERT INTO coupons (
                code, description, discount_type, discount_value, max_discount, min_order_value, min_order_amount,
                usage_limit, per_user_limit, used_count, starts_at, expires_at, expiry_date,
                applies_to, apply_to, category_id, product_id, is_private, is_restricted, is_active, active
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
            RETURNING *`,
            [
                finalCode,
                finalDescription,
                finalDiscountType,
                parsedDiscountValue,
                parsedMaxDiscount,
                parsedMinOrder,
                parsedMinOrder,
                parsedUsageLimit,
                parsedPerUserLimit,
                startDate.toISOString(),
                expiryDate.toISOString(),
                expiryDate.toISOString(),
                finalScope,
                finalScope,
                mainCatId,
                mainProdId,
                finalIsPrivate,
                finalIsPrivate,
                finalIsActive,
                finalIsActive
            ]
        );
        const coupon = result.rows[0];

        // Relational table inserts inside same transaction
        if (finalScope === 'categories' && Array.isArray(finalCatIds)) {
            for (const cid of finalCatIds) {
                await client.query('INSERT INTO coupon_categories (coupon_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [coupon.id, parseInt(cid, 10)]);
            }
        } else if (finalScope === 'products' && Array.isArray(finalProdIds)) {
            for (const pid of finalProdIds) {
                await client.query('INSERT INTO coupon_products (coupon_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [coupon.id, parseInt(pid, 10)]);
            }
        }

        if (finalIsPrivate && Array.isArray(finalCustomerIds) && finalCustomerIds.length > 0) {
            for (const uid of finalCustomerIds) {
                await client.query('INSERT INTO user_coupons (coupon_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [coupon.id, String(uid)]);
                await client.query('INSERT INTO coupon_assignments (coupon_id, user_id, status) VALUES ($1, $2, \'assigned\') ON CONFLICT DO NOTHING', [coupon.id, String(uid)]);
            }
        }

        await client.query('COMMIT');

        return {
            ...coupon,
            category_ids: finalScope === 'categories' ? finalCatIds : [],
            product_ids: finalScope === 'products' ? finalProdIds : [],
            customer_ids: finalIsPrivate ? finalCustomerIds : []
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

/**
 * Update an existing coupon in a single database transaction
 */
exports.updateCoupon = async (id, data) => {
    const {
        code, description, discount_type, discount_value, max_discount, min_order_value,
        usage_limit, per_user_limit, starts_at, expires_at, expiry_date,
        applies_to, apply_to, category_ids, categoryIds, product_ids, productIds,
        customer_ids, customerIds, user_ids, userIds,
        is_private, is_restricted, is_active, active
    } = data;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const existingRes = await client.query('SELECT * FROM coupons WHERE id = $1', [id]);
        if (existingRes.rows.length === 0) throw new Error('Coupon not found');
        const existing = existingRes.rows[0];

        const isUsed = (parseInt(existing.used_count, 10) || 0) > 0;

        // If used, code, discount_type and discount_value are locked
        let finalCode = existing.code;
        let finalDiscountType = existing.discount_type;
        let parsedDiscountValue = parseFloat(existing.discount_value);

        if (!isUsed) {
            if (code && String(code).trim().toUpperCase() !== existing.code.toUpperCase()) {
                finalCode = String(code).trim().toUpperCase();
                const codeRegex = /^[A-Z0-9_-]{4,20}$/;
                if (!codeRegex.test(finalCode)) {
                    throw new Error('Coupon code must be 4-20 characters long using uppercase letters, numbers, hyphens or underscores only.');
                }
                const dupCheck = await client.query('SELECT id FROM coupons WHERE UPPER(code) = UPPER($1) AND id != $2', [finalCode, id]);
                if (dupCheck.rows.length > 0) throw new Error('This coupon code already exists');
            }

            if (discount_type) {
                finalDiscountType = String(discount_type).toLowerCase();
            }

            if (finalDiscountType !== 'bogo' && discount_value !== undefined && discount_value !== null && discount_value !== '') {
                parsedDiscountValue = parseFloat(discount_value);
                if (isNaN(parsedDiscountValue) || parsedDiscountValue <= 0) {
                    throw new Error('Discount value must be greater than 0');
                }
                if (finalDiscountType === 'percentage' && parsedDiscountValue > 100) {
                    throw new Error('Percentage discount cannot exceed 100%');
                }
            }
        }

        let parsedMinOrder = existing.min_order_value !== undefined ? parseFloat(existing.min_order_value) : 0;
        if (min_order_value !== undefined && min_order_value !== null && min_order_value !== '') {
            parsedMinOrder = parseFloat(min_order_value);
            if (isNaN(parsedMinOrder) || parsedMinOrder < 0) {
                throw new Error('Minimum order value cannot be negative');
            }
        }

        if (finalDiscountType === 'fixed' && parsedMinOrder > 0 && parsedDiscountValue >= parsedMinOrder) {
            throw new Error('Fixed discount cannot be equal to or greater than minimum order value');
        }

        let parsedMaxDiscount = existing.max_discount !== undefined ? parseFloat(existing.max_discount) : null;
        if (finalDiscountType === 'percentage' && max_discount !== undefined && max_discount !== null && max_discount !== '') {
            parsedMaxDiscount = parseFloat(max_discount);
            if (isNaN(parsedMaxDiscount) || parsedMaxDiscount < 0) {
                throw new Error('Maximum discount cap cannot be negative');
            }
        } else if (finalDiscountType !== 'percentage') {
            parsedMaxDiscount = null;
        }

        let parsedUsageLimit = usage_limit !== undefined ? (usage_limit ? parseInt(usage_limit, 10) : null) : existing.usage_limit;
        if (parsedUsageLimit !== null && (isNaN(parsedUsageLimit) || parsedUsageLimit < 1)) {
            throw new Error('Usage limit must be a positive integer');
        }

        let parsedPerUserLimit = per_user_limit !== undefined ? (per_user_limit ? parseInt(per_user_limit, 10) : null) : existing.per_user_limit;
        if (parsedPerUserLimit !== null && (isNaN(parsedPerUserLimit) || parsedPerUserLimit < 1)) {
            throw new Error('Per-user limit must be a positive integer');
        }

        if (parsedUsageLimit !== null && parsedPerUserLimit !== null && parsedPerUserLimit > parsedUsageLimit) {
            throw new Error('Per-user limit cannot exceed total usage limit');
        }

        const startDate = starts_at ? new Date(starts_at) : (existing.starts_at ? new Date(existing.starts_at) : new Date());
        const rawExpiry = expires_at || expiry_date || existing.expires_at || existing.expiry_date;
        const expiryDate = new Date(rawExpiry);

        if (isNaN(expiryDate.getTime())) throw new Error('Invalid expiry date');
        if (expiryDate <= startDate) throw new Error('Expiry date must be later than start date');

        const rawScope = applies_to || apply_to || existing.applies_to || existing.apply_to || 'all';
        let finalScope = 'all';
        if (rawScope === 'categories' || rawScope === 'category') finalScope = 'categories';
        else if (rawScope === 'products' || rawScope === 'product') finalScope = 'products';

        const finalCatIds = category_ids || categoryIds || [];
        const finalProdIds = product_ids || productIds || [];

        if (finalScope === 'categories' && (!Array.isArray(finalCatIds) || finalCatIds.length === 0)) {
            throw new Error('Please select at least one category for category scope');
        }
        if (finalScope === 'products' && (!Array.isArray(finalProdIds) || finalProdIds.length === 0)) {
            throw new Error('Please select at least one product for product scope');
        }

        const finalDescription = description !== undefined ? (description ? String(description).trim() : null) : existing.description;
        if (finalDescription && finalDescription.length > 120) {
            throw new Error('Description cannot exceed 120 characters');
        }

        const finalIsPrivate = is_private !== undefined ? Boolean(is_private) : (is_restricted !== undefined ? Boolean(is_restricted) : Boolean(existing.is_private || existing.is_restricted));
        const finalIsActive = is_active !== undefined ? Boolean(is_active) : (active !== undefined ? Boolean(active) : Boolean(existing.is_active || existing.active));

        const mainCatId = (finalScope === 'categories' && finalCatIds.length > 0) ? finalCatIds[0] : null;
        const mainProdId = (finalScope === 'products' && finalProdIds.length > 0) ? finalProdIds[0] : null;

        await client.query(
            `UPDATE coupons SET
                code = $2,
                description = $3,
                discount_type = $4,
                discount_value = $5,
                max_discount = $6,
                min_order_value = $7,
                min_order_amount = $8,
                usage_limit = $9,
                per_user_limit = $10,
                starts_at = $11,
                expires_at = $12,
                expiry_date = $13,
                applies_to = $14,
                apply_to = $15,
                category_id = $16,
                product_id = $17,
                is_private = $18,
                is_restricted = $19,
                is_active = $20,
                active = $21,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1`,
            [
                id,
                finalCode,
                finalDescription,
                finalDiscountType,
                parsedDiscountValue,
                parsedMaxDiscount,
                parsedMinOrder,
                parsedMinOrder,
                parsedUsageLimit,
                parsedPerUserLimit,
                startDate.toISOString(),
                expiryDate.toISOString(),
                expiryDate.toISOString(),
                finalScope,
                finalScope,
                mainCatId,
                mainProdId,
                finalIsPrivate,
                finalIsPrivate,
                finalIsActive,
                finalIsActive
            ]
        );

        // Replace relational links atomically
        await client.query('DELETE FROM coupon_categories WHERE coupon_id = $1', [id]);
        await client.query('DELETE FROM coupon_products WHERE coupon_id = $1', [id]);

        if (finalScope === 'categories' && Array.isArray(finalCatIds)) {
            for (const cid of finalCatIds) {
                await client.query('INSERT INTO coupon_categories (coupon_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, parseInt(cid, 10)]);
            }
        } else if (finalScope === 'products' && Array.isArray(finalProdIds)) {
            for (const pid of finalProdIds) {
                await client.query('INSERT INTO coupon_products (coupon_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, parseInt(pid, 10)]);
            }
        }

        const finalCustomerIds = customer_ids || customerIds || user_ids || userIds;
        if (finalCustomerIds && Array.isArray(finalCustomerIds)) {
            await client.query('DELETE FROM user_coupons WHERE coupon_id = $1', [id]);
            await client.query('DELETE FROM coupon_assignments WHERE coupon_id = $1', [id]);
            if (finalIsPrivate) {
                for (const uid of finalCustomerIds) {
                    await client.query('INSERT INTO user_coupons (coupon_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, String(uid)]);
                    await client.query('INSERT INTO coupon_assignments (coupon_id, user_id, status) VALUES ($1, $2, \'assigned\') ON CONFLICT DO NOTHING', [id, String(uid)]);
                }
            }
        }

        await client.query('COMMIT');

        const updatedRes = await pool.query('SELECT * FROM coupons WHERE id = $1', [id]);
        return {
            ...updatedRes.rows[0],
            category_ids: finalScope === 'categories' ? finalCatIds : [],
            product_ids: finalScope === 'products' ? finalProdIds : [],
            customer_ids: finalIsPrivate ? (finalCustomerIds || []) : []
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

/**
 * Get all coupons with category/product/customer link arrays
 */
exports.getAllCoupons = async () => {
    const result = await pool.query(`
        SELECT
            c.*,
            COALESCE(c.applies_to, c.apply_to, 'all') AS applies_to,
            COALESCE(c.is_private, c.is_restricted, false) AS is_private,
            COALESCE(c.is_active, c.active, true) AS is_active,
            COALESCE(c.is_active, c.active, true) AS active,
            COALESCE(c.expires_at, c.expiry_date) AS expires_at,
            COALESCE(c.expires_at, c.expiry_date) AS expiry_date,
            COUNT(DISTINCT uc.user_id)::int AS assigned_count,
            COUNT(DISTINCT cr.id)::int AS times_used,
            COALESCE((SELECT json_agg(category_id) FROM coupon_categories WHERE coupon_id = c.id), '[]') as category_ids,
            COALESCE((SELECT json_agg(product_id) FROM coupon_products WHERE coupon_id = c.id), '[]') as product_ids,
            COALESCE((SELECT json_agg(user_id) FROM user_coupons WHERE coupon_id = c.id), '[]') as customer_ids
        FROM coupons c
        LEFT JOIN user_coupons uc ON uc.coupon_id = c.id
        LEFT JOIN coupon_redemptions cr ON cr.coupon_id = c.id
        GROUP BY c.id
        ORDER BY c.created_at DESC
    `);

    return result.rows;
};

/**
 * Toggle coupon status
 */
exports.toggleCouponStatus = async (id) => {
    const existing = await pool.query('SELECT is_active, active FROM coupons WHERE id = $1', [id]);
    if (existing.rows.length === 0) throw new Error('Coupon not found');
    const newStatus = !Boolean(existing.rows[0].is_active ?? existing.rows[0].active);

    const result = await pool.query(
        'UPDATE coupons SET is_active = $2, active = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
        [id, newStatus]
    );
    return result.rows[0];
};

/**
 * Delete coupon
 */
exports.deleteCoupon = async (id) => {
    const result = await pool.query('DELETE FROM coupons WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) throw new Error('Coupon not found');
    return { success: true };
};

/**
 * Get coupon by code
 */
exports.getCouponByCode = async (code) => {
    const result = await pool.query(`
        SELECT c.*,
            COALESCE((SELECT json_agg(category_id) FROM coupon_categories WHERE coupon_id = c.id), '[]') as category_ids,
            COALESCE((SELECT json_agg(product_id) FROM coupon_products WHERE coupon_id = c.id), '[]') as product_ids,
            COALESCE((SELECT json_agg(user_id) FROM user_coupons WHERE coupon_id = c.id), '[]') as customer_ids
        FROM coupons c WHERE UPPER(code) = UPPER($1)
    `, [code]);
    return result.rows[0];
};

/**
 * Validate coupon code against order details
 */
exports.validateCoupon = async (code, orderTotal, cartItems = [], userId = null) => {
    const normalizedCode = (code || '').trim().toUpperCase();
    if (!normalizedCode) throw new Error('Coupon code is required');

    const parsedTotal = parseFloat(orderTotal);
    if (isNaN(parsedTotal) || parsedTotal < 0) throw new Error('Invalid order total');

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const couponResult = await client.query(
            `SELECT c.*,
                COALESCE((SELECT json_agg(category_id) FROM coupon_categories WHERE coupon_id = c.id), '[]') as category_ids,
                COALESCE((SELECT json_agg(product_id) FROM coupon_products WHERE coupon_id = c.id), '[]') as product_ids
             FROM coupons c WHERE UPPER(c.code) = UPPER($1) FOR UPDATE`,
            [normalizedCode]
        );
        const coupon = couponResult.rows[0];

        if (!coupon) throw new Error('Invalid coupon code');
        const isActive = Boolean(coupon.is_active ?? coupon.active);
        if (!isActive) throw new Error('This coupon is no longer active');

        const expiryDate = coupon.expires_at || coupon.expiry_date;
        if (expiryDate && new Date() > new Date(expiryDate)) {
            throw new Error('This coupon has expired');
        }

        const minOrderVal = parseFloat(coupon.min_order_value || coupon.min_order_amount || 0);
        if (parsedTotal < minOrderVal) {
            throw new Error(`Minimum order value of ₹${minOrderVal.toLocaleString('en-IN')} required`);
        }

        if (coupon.usage_limit) {
            const usageResult = await client.query('SELECT COUNT(*) AS count FROM coupon_redemptions WHERE coupon_id = $1', [coupon.id]);
            if (parseInt(usageResult.rows[0].count, 10) >= parseInt(coupon.usage_limit, 10)) {
                throw new Error('This coupon has reached its total usage limit');
            }
        }

        if (coupon.per_user_limit && userId) {
            const userUsageResult = await client.query('SELECT COUNT(*) AS count FROM coupon_redemptions WHERE coupon_id = $1 AND user_id = $2', [coupon.id, userId]);
            if (parseInt(userUsageResult.rows[0].count, 10) >= parseInt(coupon.per_user_limit, 10)) {
                throw new Error(`You have reached your redemption limit (${coupon.per_user_limit}) for this coupon`);
            }
        }

        const isPrivate = Boolean(coupon.is_private ?? coupon.is_restricted);
        if (isPrivate && userId) {
            const userAssignmentResult = await client.query(
                `SELECT 1 FROM user_coupons WHERE coupon_id = $1 AND user_id = $2`,
                [coupon.id, userId]
            );
            if (userAssignmentResult.rows.length === 0) {
                throw new Error('This coupon is restricted to specific customer accounts');
            }
        }

        // Scope validation
        const scope = coupon.applies_to || coupon.apply_to || 'all';
        let applicableTotal = parsedTotal;
        let eligibleItems = cartItems;

        if (scope !== 'all' && cartItems.length > 0) {
            eligibleItems = cartItems.filter(item => {
                if (scope === 'products' || scope === 'product') {
                    const pids = coupon.product_ids || [];
                    if (pids.length > 0) return pids.includes(Number(item.product_id || item.id));
                    return String(item.product_id || item.id) === String(coupon.product_id);
                }
                if (scope === 'categories' || scope === 'category') {
                    const cids = coupon.category_ids || [];
                    if (cids.length > 0) return cids.includes(Number(item.category_id));
                    return String(item.category_id) === String(coupon.category_id);
                }
                return false;
            });

            if (eligibleItems.length === 0) {
                throw new Error(`This coupon only applies to specific ${scope} not present in your cart`);
            }
            applicableTotal = eligibleItems.reduce((sum, item) => sum + (parseFloat(item.price) * parseInt(item.quantity, 10)), 0);
        }

        // Discount calculation
        let discountAmount = 0;
        if (coupon.discount_type === 'percentage') {
            discountAmount = (applicableTotal * parseFloat(coupon.discount_value)) / 100;
            if (coupon.max_discount && parseFloat(coupon.max_discount) > 0) {
                discountAmount = Math.min(discountAmount, parseFloat(coupon.max_discount));
            }
        } else if (coupon.discount_type === 'fixed') {
            discountAmount = Math.min(parseFloat(coupon.discount_value), applicableTotal);
        } else if (coupon.discount_type === 'bogo') {
            const itemsWithQty2 = eligibleItems.filter(item => parseInt(item.quantity || 1, 10) >= 2);
            if (itemsWithQty2.length === 0) {
                throw new Error('This BOGO coupon requires at least 2 units of an eligible product in your cart.');
            }
            const maxPriceItem = itemsWithQty2.reduce((prev, current) => {
                return (parseFloat(prev.price) > parseFloat(current.price)) ? prev : current;
            }, itemsWithQty2[0]);
            discountAmount = parseFloat(maxPriceItem.price);
        }

        if (discountAmount > parsedTotal) discountAmount = parsedTotal;
        if (discountAmount < 0) discountAmount = 0;

        await client.query('COMMIT');

        return {
            isValid: true,
            coupon: {
                id: coupon.id,
                code: coupon.code,
                discount_type: coupon.discount_type,
                discount_value: coupon.discount_value,
                max_discount: coupon.max_discount,
                applies_to: scope
            },
            discountAmount: parseFloat(discountAmount.toFixed(2)),
            finalTotal: parseFloat((parsedTotal - discountAmount).toFixed(2))
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

exports.getUserCoupons = async (userId) => {
    const result = await pool.query(
        `SELECT c.*,
             COALESCE((SELECT json_agg(category_id) FROM coupon_categories WHERE coupon_id = c.id), '[]') as category_ids,
             COALESCE((SELECT json_agg(product_id) FROM coupon_products WHERE coupon_id = c.id), '[]') as product_ids,
             CASE 
                WHEN (COALESCE(c.is_private, c.is_restricted, false) = true) AND EXISTS (SELECT 1 FROM user_coupons uc WHERE uc.coupon_id = c.id AND uc.user_id = $1) THEN true 
                ELSE false 
             END AS is_assigned
         FROM coupons c
         WHERE COALESCE(c.is_active, c.active, true) = true
             AND (c.expires_at IS NULL OR c.expires_at >= NOW() OR c.expiry_date IS NULL OR c.expiry_date::date >= CURRENT_DATE)
             AND (COALESCE(c.is_private, c.is_restricted, false) = false OR EXISTS (SELECT 1 FROM user_coupons uc WHERE uc.coupon_id = c.id AND uc.user_id = $1))
         ORDER BY c.created_at DESC`,
        [userId]
    );
    return result.rows;
};

exports.getCouponAssignments = async (couponId) => {
    const result = await pool.query(
        `SELECT u.username, u.emailid, u.fullname, uc.assigned_at, 'assigned' as status FROM user_coupons uc JOIN users u ON u.username = uc.user_id WHERE uc.coupon_id = $1 ORDER BY uc.assigned_at DESC`,
        [couponId]
    );
    return result.rows;
};

exports.revokeAssignment = async (couponId, userId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`DELETE FROM user_coupons WHERE coupon_id = $1 AND user_id = $2`, [couponId, userId]);
        await client.query(`DELETE FROM coupon_assignments WHERE coupon_id = $1 AND user_id = $2`, [couponId, userId]);
        await client.query('COMMIT');
        return { success: true };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

exports.getUsedUsers = async (couponId) => {
    const result = await pool.query(
        `SELECT u.username, u.emailid as email, u.fullname, cr.redeemed_at as order_date FROM coupon_redemptions cr JOIN users u ON u.username = cr.user_id WHERE cr.coupon_id = $1 ORDER BY cr.redeemed_at DESC`,
        [couponId]
    );
    return result.rows;
};
