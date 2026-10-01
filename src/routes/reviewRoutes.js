const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.get('/', reviewController.getAllReviews);
router.get('/:productId', reviewController.getProductReviews);
router.post('/', reviewController.addProductReview);
router.delete('/:id', protect, authorize('admin', 'super_admin'), reviewController.deleteReview);

module.exports = router;
