const reviewService = require('../services/reviewService');
const storageService = require('../services/storageService');
const pool = require('../config/db');

exports.getAllReviews = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT r.id, r.product_id as productid, COALESCE(p.title, 'Product #' || r.product_id) as product_name,
                   p.image_url, p.images,
                   r.user_id as username, COALESCE(u.emailid, '') as emailid,
                   r.rating, r.comment, r.created_at as date,
                   r.images as review_images, r.image_url as review_image_url
            FROM reviews r
            LEFT JOIN products p ON r.product_id = p.product_id
            LEFT JOIN users u ON (u.username = r.user_id OR u.emailid = r.user_id)
            ORDER BY r.created_at DESC, r.id DESC
        `);

        const formattedRows = result.rows.map(row => {
            const firstProductImage = (Array.isArray(row.images) && row.images[0]) || row.image_url || '';
            const rawRevImgs = Array.isArray(row.review_images) && row.review_images.length > 0
                ? row.review_images
                : (row.review_image_url ? [row.review_image_url] : []);
            const resolvedRevImgs = rawRevImgs.map(img => storageService.getPublicMediaUrl(img)).filter(Boolean);

            return {
                id: row.id,
                productid: row.productid,
                product_name: row.product_name,
                product_image: storageService.getPublicMediaUrl(firstProductImage),
                username: row.username,
                emailid: row.emailid,
                rating: row.rating,
                comment: row.comment,
                images: resolvedRevImgs,
                image_url: resolvedRevImgs[0] || null,
                date: row.date
            };
        });

        res.status(200).json({ success: true, count: formattedRows.length, data: formattedRows });
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
        const { productId, username, rating, review, imageUrl } = req.body;

        if (!productId || !rating || !review) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        // Collect uploaded files if multipart
        let uploadedImages = [];
        if (req.files && Array.isArray(req.files) && req.files.length > 0) {
            for (const file of req.files) {
                try {
                    const uploadedUrl = await storageService.uploadImage(file, 'reviews');
                    if (uploadedUrl) uploadedImages.push(uploadedUrl);
                } catch (upErr) {
                    console.error('Error uploading review attachment:', upErr);
                }
            }
        } else if (req.file) {
            try {
                const uploadedUrl = await storageService.uploadImage(req.file, 'reviews');
                if (uploadedUrl) uploadedImages.push(uploadedUrl);
            } catch (upErr) {
                console.error('Error uploading review attachment:', upErr);
            }
        }

        // Collect any images passed as URLs or strings in body
        let bodyImages = [];
        if (Array.isArray(req.body.images)) {
            bodyImages = req.body.images.filter(Boolean);
        } else if (typeof req.body.images === 'string' && req.body.images.trim()) {
            try {
                const parsed = JSON.parse(req.body.images);
                if (Array.isArray(parsed)) bodyImages = parsed.filter(Boolean);
                else bodyImages = [req.body.images.trim()];
            } catch {
                bodyImages = [req.body.images.trim()];
            }
        } else if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim()) {
            bodyImages = [imageUrl.trim()];
        }

        const combinedImages = [...uploadedImages, ...bodyImages];

        const newReview = await reviewService.createReview({
            productId,
            username: username || req.user?.name || req.user?.username || 'Verified Patron',
            rating,
            review,
            images: combinedImages,
            imageUrl: combinedImages[0] || null
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
