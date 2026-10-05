const express = require('express');
const router = express.Router();

const productController = require('../controllers/productController');

// GET /api/products
router.get('/', productController.getProducts);

// GET /api/products/featured
router.get('/featured', productController.getFeaturedProducts);

// GET /api/products/recommendations
router.get('/recommendations', productController.getRecommendations);

// GET /api/products/search
router.get('/search', productController.searchProducts);

// POST /api/products/smart-search
router.post('/smart-search', productController.smartSearch);

// GET /api/products/:id
router.get('/:id', productController.getProduct);

// GET /api/products/:id/related
router.get('/:id/related', productController.getRelatedProducts);

const { protect, authorize, checkPermission } = require('../middlewares/authMiddleware');

// POST /api/products
router.post('/', protect, authorize('admin'), checkPermission('products'), productController.createProduct);

// PUT /api/products/:id
router.put('/:id', protect, authorize('admin'), checkPermission('products'), productController.updateProduct);

// DELETE /api/products/:id
router.delete('/:id', protect, authorize('admin'), checkPermission('products'), productController.deleteProduct);

// PATCH /api/products/:id/activate
router.patch('/:id/activate', protect, authorize('admin'), checkPermission('products'), productController.setActiveProduct);

// PATCH /api/products/:id/deactivate
router.patch('/:id/deactivate', protect, authorize('admin'), checkPermission('products'), productController.setInactiveProduct);

// PATCH /api/products/:id/toggle-active
router.patch('/:id/toggle-active', protect, authorize('admin'), checkPermission('products'), productController.toggleProductStatus);


module.exports = router;
