const express = require('express');
const router = express.Router();
const newsletterController = require('../controllers/newsletterController');
const { protect, authorize, checkPermission } = require('../middlewares/authMiddleware');

// Public subscription endpoints
router.post('/subscribe', newsletterController.subscribe);
router.post('/', newsletterController.subscribe);

// Admin endpoints (Protected)
router.get(
  '/admin/subscribers',
  protect,
  authorize('admin'),
  checkPermission('newsletter'),
  newsletterController.getAllSubscribers
);

router.get(
  '/admin/stats',
  protect,
  authorize('admin'),
  checkPermission('newsletter'),
  newsletterController.getSubscriberStats
);

router.post(
  '/admin/subscribers',
  protect,
  authorize('admin'),
  checkPermission('newsletter'),
  newsletterController.addSubscriberManual
);

router.patch(
  '/admin/subscribers/:id/status',
  protect,
  authorize('admin'),
  checkPermission('newsletter'),
  newsletterController.updateSubscriberStatus
);

router.delete(
  '/admin/subscribers/:id',
  protect,
  authorize('admin'),
  checkPermission('newsletter'),
  newsletterController.deleteSubscriber
);

module.exports = router;
