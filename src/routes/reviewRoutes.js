const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { protect, authorize, checkPermission } = require('../middlewares/authMiddleware');

router.get('/', (req, res, next) => {
    // If request has Authorization header or token cookie, check admin permission for reviews management
    if (req.headers.authorization || (req.cookies && req.cookies.token)) {
        return protect(req, res, () => {
            if (req.user && req.user.role === 'admin') {
                return checkPermission('reviews')(req, res, () => reviewController.getAllReviews(req, res, next));
            }
            return reviewController.getAllReviews(req, res, next);
        });
    }
    return reviewController.getAllReviews(req, res, next);
});

const uploadController = require('../controllers/uploadController');

const handleReviewUpload = (req, res, next) => {
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('multipart/form-data')) {
        return uploadController.uploadMiddleware(req, res, (err) => {
            if (err) {
                console.error('Multer upload error in review submission:', err);
                return res.status(400).json({ success: false, message: err.message || 'File upload failed' });
            }
            next();
        });
    }
    next();
};

router.get('/redirect/:productId?', (req, res) => {
    const productId = req.params.productId || req.query.productId || '102';
    const targetUrl = `https://house-of-urvaah-fe.vercel.app/product/${productId}?openReview=true#customer-reviews`;
    return res.redirect(302, targetUrl);
});

router.get('/:productId', reviewController.getProductReviews);
router.post('/', handleReviewUpload, reviewController.addProductReview);
router.delete('/:id', protect, authorize('admin', 'super_admin'), checkPermission('reviews'), reviewController.deleteReview);


module.exports = router;
