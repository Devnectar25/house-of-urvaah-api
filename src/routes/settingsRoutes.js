const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { protect, authorize, checkPermission } = require('../middlewares/authMiddleware');

// Public route for customer checkout, cart, and storefront configuration
router.get('/public', settingsController.getPublicSettings);
router.post('/calculate', settingsController.calculateTaxes);

// Admin routes for managing GST and card surcharge
router.get(
    '/admin',
    protect,
    authorize('admin'),
    checkPermission('settings'),
    settingsController.getAdminSettings
);

router.put(
    '/admin',
    protect,
    authorize('admin'),
    checkPermission('settings'),
    settingsController.updateAdminSettings
);

module.exports = router;
