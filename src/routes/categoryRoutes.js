const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');

const { protect, authorize, checkPermission } = require('../middlewares/authMiddleware');

router.get('/', categoryController.getCategories);
router.get('/active', categoryController.getActiveCategories);
router.get('/:id', categoryController.getCategoryById);
router.post('/', protect, authorize('admin'), checkPermission('categories'), categoryController.createCategory);
router.put('/:id', protect, authorize('admin'), checkPermission('categories'), categoryController.updateCategory);
router.delete('/:id', protect, authorize('admin'), checkPermission('categories'), categoryController.deleteCategory);
router.patch('/:id/activate', protect, authorize('admin'), checkPermission('categories'), categoryController.setActiveCategory);
router.patch('/:id/deactivate', protect, authorize('admin'), checkPermission('categories'), categoryController.setInactiveCategory);


module.exports = router;
