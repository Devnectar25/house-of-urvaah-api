const express = require('express');
const router = express.Router();
const stockNotificationController = require('../controllers/stockNotificationController');
const { protect, authorize, checkPermission, optionalUser } = require('../middlewares/authMiddleware');

// Customer Public Routes
router.post('/subscribe', optionalUser, stockNotificationController.subscribe);
router.get('/unsubscribe', stockNotificationController.unsubscribe);
router.get('/verify', stockNotificationController.verify);

// Admin Routes (Protected with Admin Role & Permission)
router.get(
    '/admin/metrics',
    protect,
    authorize('admin'),
    checkPermission('stock-notifications'),
    stockNotificationController.getAdminMetrics
);

router.get(
    '/admin/subscriptions',
    protect,
    authorize('admin'),
    checkPermission('stock-notifications'),
    stockNotificationController.getAdminSubscriptions
);

router.post(
    '/admin/jobs/:jobId/retry',
    protect,
    authorize('admin'),
    checkPermission('stock-notifications'),
    stockNotificationController.retryJob
);

router.patch(
    '/admin/subscriptions/:id/cancel',
    protect,
    authorize('admin'),
    checkPermission('stock-notifications'),
    stockNotificationController.cancelSubscription
);

router.post(
    '/admin/subscriptions/:id/notify',
    protect,
    authorize('admin'),
    checkPermission('stock-notifications'),
    stockNotificationController.notifySubscription
);

router.post(
    '/admin/check-in-stock',
    protect,
    authorize('admin'),
    checkPermission('stock-notifications'),
    stockNotificationController.checkInStockNow
);

router.post(
    '/admin/test-restock',
    protect,
    authorize('admin'),
    checkPermission('stock-notifications'),
    stockNotificationController.triggerManualRestockTest
);

module.exports = router;

