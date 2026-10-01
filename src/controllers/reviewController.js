const reviewService = require('../services/reviewService');
const pool = require('../config/db');

exports.getAllReviews = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT r.srno as id, r.productid, COALESCE(p.productname, 'Product #' || r.productid) as product_name, r.username, u.emailid, r.rating, r.review as comment, r.date
            FROM review r
            LEFT JOIN products p ON r.productid = p.product_id
            LEFT JOIN users u ON r.username = u.username
            ORDER BY r.date DESC, r.srno DESC
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
        const reviewRes = await pool.query('SELECT productid FROM review WHERE srno = $1', [id]);
        if (reviewRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Review not found' });
        }
        const productId = reviewRes.rows[0].productid;
        await pool.query('DELETE FROM review WHERE srno = $1', [id]);
        
        // Update product rating and review count
        await pool.query(
            `UPDATE products 
             SET rating = COALESCE((SELECT AVG(rating) FROM review WHERE productid = $1), 0),
                 reviews = (SELECT COUNT(*)::text FROM review WHERE productid = $1)
             WHERE product_id = $1`,
            [productId]
        );

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
            username: username || 'Guest', // Fallback
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
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
