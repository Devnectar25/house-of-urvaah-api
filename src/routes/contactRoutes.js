const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');

const { protect, authorize, checkPermission } = require('../middlewares/authMiddleware');

// Public route: submit contact form
router.post('/submit', contactController.submitContactForm);
router.post('/', contactController.submitContactForm);

// Admin stats: support /api/leads/stats and /api/contact/leads/stats
router.get('/stats', protect, authorize('admin'), checkPermission('leads'), contactController.getLeadsStats);
router.get('/leads/stats', protect, authorize('admin'), checkPermission('leads'), contactController.getLeadsStats);

// Admin list: support /api/leads and /api/contact/leads
router.get('/', protect, authorize('admin'), checkPermission('leads'), contactController.getAllLeads);
router.get('/leads', protect, authorize('admin'), contactController.getAllLeads);

// Admin update lead: support /api/leads/:id and /api/contact/leads/:id
router.patch('/:id', protect, authorize('admin'), checkPermission('leads'), contactController.updateLeadStatus);
router.patch('/leads/:id', protect, authorize('admin'), checkPermission('leads'), contactController.updateLeadStatus);

// Admin delete lead: support /api/leads/:id and /api/contact/leads/:id
router.delete('/:id', protect, authorize('admin'), checkPermission('leads'), contactController.deleteLead);
router.delete('/leads/:id', protect, authorize('admin'), checkPermission('leads'), contactController.deleteLead);

module.exports = router;
