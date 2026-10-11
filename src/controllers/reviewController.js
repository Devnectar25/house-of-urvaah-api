const reviewService = require('../services/reviewService');
const pool = require('../config/db');

exports.getAllReviews = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT r.id, r.product_id as productid, COALESCE(p.title, 'Product #' || r.product_id) as product_name,
                   COALESCE(p.image_url, (p.images)[1], '') as product_image,
                   r.user_id as username, COALESCE(u.emailid, '') as emailid,
                   r.rating, r.comment, r.created_at as date
            FROM reviews r
            LEFT JOIN products p ON r.product_id = p.product_id
            LEFT JOIN users u ON (u.username = r.user_id OR u.emailid = r.user_id)
            ORDER BY r.created_at DESC, r.id DESC
        `);
        res.status(200).json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        console.error('Error fetching all reviews:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.deleteReview = async (req, res) => {
    try {
        const { id } = req.params;
        const reviewRes = await pool.query('SELECT product_id FROM reviews WHERE id = $1', [id]);
        if (reviewRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Review not found' });
        }
        const productId = reviewRes.rows[0].product_id;
        await pool.query('DELETE FROM reviews WHERE id = $1', [id]);
        
        try {
            await pool.query(
                `UPDATE products 
                 SET rating = COALESCE((SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews WHERE product_id = $1), 0),
                     reviews_count = COALESCE((SELECT COUNT(*) FROM reviews WHERE product_id = $1), 0)
                 WHERE product_id = $1`,
                [productId]
            );
        } catch (e) {}

        res.status(200).json({ success: true, message: 'Review deleted successfully' });
    } catch (error) {
        console.error('Error deleting review:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getProductReviews = async (req, res) => {
    try {
        const { productId } = req.params;
        const reviews = await reviewService.getReviewsByProduct(productId);
        const summary = await reviewService.getReviewSummary(productId);

        res.status(200).json({
            success: true,
            data: {
                reviews,
                summary
            }
        });
    } catch (error) {
        console.error('Error fetching reviews:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.addProductReview = async (req, res) => {
    try {
        const { productId, username, rating, review } = req.body;

        if (!productId || !rating || !review) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const newReview = await reviewService.createReview({
            productId,
            username: username || req.user?.name || req.user?.username || 'Verified Patron',
            rating,
            review
        });

        res.status(201).json({
            success: true,
            message: 'Review added successfully',
            data: newReview
        });
    } catch (error) {
        console.error('Error adding review:', error);
        res.status(500).json({ success: false, message: error.message || 'Server error' });
    }
};
