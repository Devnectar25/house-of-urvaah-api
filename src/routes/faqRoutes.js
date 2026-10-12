const express = require('express');
const router = express.Router();
const faqController = require('../controllers/faqController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// Public route for storefront Contact Us page & Urvaah Bot
router.get('/', faqController.getAllFAQs);

// Admin-only routes
router.get('/admin', protect, authorize('admin', 'super_admin'), faqController.getAdminFAQs);
router.post('/', protect, authorize('admin', 'super_admin'), faqController.createFAQ);
router.put('/:id', protect, authorize('admin', 'super_admin'), faqController.updateFAQ);
router.patch('/:id/toggle', protect, authorize('admin', 'super_admin'), faqController.toggleFAQStatus);
router.delete('/:id', protect, authorize('admin', 'super_admin'), faqController.deleteFAQ);

module.exports = router;
