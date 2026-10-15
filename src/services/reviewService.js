const pool = require("../config/db");

const resolveNumericProductId = (productId) => {
    const s = String(productId || '').trim();
    if (s === 'prod-105') return 108;
    if (s === 'bs-105' || s === 'prod-109') return 109;
    if (s === 'bs-101' || s === 'prod-101') return 105;
    if (s === 'bs-103' || s === 'prod-102') return 106;
    if (s === 'prod-103') return 107;
    if (s === 'bs-104') return 104;
    if (s === 'bs-102') return 102;
    const matches = s.match(/\d+/);
    return matches ? parseInt(matches[0], 10) : 0;
};

exports.getReviewsByProduct = async (productId) => {
    const numericId = resolveNumericProductId(productId);

    const result = await pool.query(
        `SELECT r.id, r.product_id, r.user_id, r.rating, r.comment, r.created_at,
                r.images, r.image_url,
                COALESCE(u.fullname, u.username, r.user_id, 'Verified Patron') as user_name
         FROM reviews r
         LEFT JOIN users u ON (u.username = r.user_id OR u.emailid = r.user_id)
         WHERE r.product_id = $1
         ORDER BY r.created_at DESC`,
        [numericId]
    );

    return result.rows.map(row => {
        let imgs = [];
        if (Array.isArray(row.images) && row.images.length > 0) {
            imgs = row.images;
        } else if (row.image_url) {
            imgs = [row.image_url];
        }
        return {
            id: row.id,
            user: row.user_name || 'Verified Patron',
            rating: Number(row.rating) || 5,
            comment: row.comment || '',
            images: imgs,
            imageUrl: row.image_url || imgs[0] || null,
            date: row.created_at,
            verified: true
        };
    });
};

exports.createReview = async (data) => {
    const { productId, username, rating, review, images, imageUrl } = data;
    const numericId = resolveNumericProductId(productId);

    if (!numericId) {
        throw new Error("Valid numeric product ID is required.");
    }

    const validUser = username?.trim() || 'Verified Patron';
    const numRating = Math.max(1, Math.min(5, parseInt(rating, 10) || 5));
    const commentText = (review || '').trim();

    let imgArray = [];
    if (Array.isArray(images)) {
        imgArray = images.filter(Boolean).map(String);
    } else if (typeof images === 'string' && images.trim()) {
        try {
            const parsed = JSON.parse(images);
            if (Array.isArray(parsed)) imgArray = parsed.filter(Boolean).map(String);
            else imgArray = [images.trim()];
        } catch {
            imgArray = [images.trim()];
        }
    } else if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim()) {
        imgArray = [imageUrl.trim()];
    }

    const primaryImage = imgArray[0] || (imageUrl && typeof imageUrl === 'string' ? imageUrl.trim() : null);

    const result = await pool.query(
        `INSERT INTO reviews (product_id, user_id, rating, comment, images, image_url, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
         RETURNING *`,
        [numericId, validUser, numRating, commentText, imgArray, primaryImage]
    );

    // Update product rating and reviews count if columns exist
    try {
        await pool.query(
            `UPDATE products 
             SET rating = COALESCE((SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews WHERE product_id = $1), 0),
                 reviews_count = COALESCE((SELECT COUNT(*) FROM reviews WHERE product_id = $1), 0)
             WHERE product_id = $1`,
            [numericId]
        );
    } catch (updateErr) {
        console.warn("Could not sync rating in products table:", updateErr.message);
    }

    return {
        id: result.rows[0].id,
        user: validUser,
        rating: numRating,
        comment: commentText,
        images: imgArray,
        imageUrl: primaryImage,
        date: result.rows[0].created_at,
        verified: true
    };
};

exports.getReviewSummary = async (productId) => {
    const numericId = resolveNumericProductId(productId);

    const result = await pool.query(
        `SELECT rating, COUNT(*) as count
         FROM reviews
         WHERE product_id = $1
         GROUP BY rating`,
        [numericId]
    );

    const distribution = {
        5: 0, 4: 0, 3: 0, 2: 0, 1: 0
    };

    let totalReviews = 0;
    let totalRating = 0;

    result.rows.forEach(row => {
        const r = parseInt(row.rating, 10);
        const c = parseInt(row.count, 10);
        if (distribution[r] !== undefined) {
            distribution[r] = c;
        }
        totalReviews += c;
        totalRating += (r * c);
    });

    const average = totalReviews > 0 ? (totalRating / totalReviews).toFixed(1) : '0.0';

    return {
        average,
        total: totalReviews,
        distribution
    };
};
