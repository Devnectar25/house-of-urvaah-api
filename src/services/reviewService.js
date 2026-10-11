const pool = require("../config/db");

exports.getReviewsByProduct = async (productId) => {
    // Extract numeric ID if string (e.g. 'prod-102' -> 102, 'bs-101' -> 101, '104' -> 104)
    const matches = String(productId || '').match(/\d+/);
    const numericId = matches ? parseInt(matches[0], 10) : 0;

    const result = await pool.query(
        `SELECT r.id, r.product_id, r.user_id, r.rating, r.comment, r.created_at,
                COALESCE(u.fullname, u.username, r.user_id, 'Verified Patron') as user_name
         FROM reviews r
         LEFT JOIN users u ON (u.username = r.user_id OR u.emailid = r.user_id)
         WHERE r.product_id = $1
         ORDER BY r.created_at DESC`,
        [numericId]
    );

    return result.rows.map(row => ({
        id: row.id,
        user: row.user_name || 'Verified Patron',
        rating: Number(row.rating) || 5,
        comment: row.comment || '',
        date: row.created_at,
        verified: true
    }));
};

exports.createReview = async (data) => {
    const { productId, username, rating, review } = data;
    const matches = String(productId || '').match(/\d+/);
    const numericId = matches ? parseInt(matches[0], 10) : 0;

    if (!numericId) {
        throw new Error("Valid numeric product ID is required.");
    }

    const validUser = username?.trim() || 'Verified Patron';
    const numRating = Math.max(1, Math.min(5, parseInt(rating, 10) || 5));
    const commentText = (review || '').trim();

    const result = await pool.query(
        `INSERT INTO reviews (product_id, user_id, rating, comment, created_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         RETURNING *`,
        [numericId, validUser, numRating, commentText]
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
        date: result.rows[0].created_at,
        verified: true
    };
};

exports.getReviewSummary = async (productId) => {
    const matches = String(productId || '').match(/\d+/);
    const numericId = matches ? parseInt(matches[0], 10) : 0;

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
