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

router.get('/:productId', reviewController.getProductReviews);
router.post('/', reviewController.addProductReview);
router.delete('/:id', protect, authorize('admin'), checkPermission('reviews'), reviewController.deleteReview);


module.exports = router;
