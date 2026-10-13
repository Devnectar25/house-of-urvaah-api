const express = require('express');
const router = express.Router();
const emailNotificationController = require('../controllers/emailNotificationController');
const { protect, authorize, checkPermission } = require('../middlewares/authMiddleware');

// Public route: Token-based secure invoice PDF download (from email link)
router.get('/invoices/download/:token', emailNotificationController.downloadInvoiceByToken);

// Admin Routes: protected with JWT & permissions
router.get(
  '/',
  protect,
  authorize('admin'),
  checkPermission('email-notifications'),
  emailNotificationController.getNotifications
);

router.get(
  '/stats',
  protect,
  authorize('admin'),
  checkPermission('email-notifications'),
  emailNotificationController.getStats
);

router.post(
  '/:id/retry',
  protect,
  authorize('admin'),
  checkPermission('email-notifications'),
  emailNotificationController.retryNotification
);

module.exports = router;
