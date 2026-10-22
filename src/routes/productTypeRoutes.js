
const express = require('express');
const router = express.Router();
const productTypeController = require('../controllers/productTypeController');
const { protect } = require('../middlewares/authMiddleware');

router.get('/', productTypeController.getAllProductTypes);
router.post('/', protect, productTypeController.createProductType);
router.put('/:id', protect, productTypeController.updateProductType);
router.delete('/:id', protect, productTypeController.deleteProductType);

module.exports = router;
