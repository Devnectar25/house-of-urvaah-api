const express = require('express');
const router = express.Router();
const errorLogController = require('../controllers/errorLogController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// Public route to capture frontend UI/functional errors
router.post('/report', errorLogController.reportError);

// Admin-only management endpoints
router.get('/', protect, authorize('admin'), errorLogController.getErrorLogs);
router.get('/stats', protect, authorize('admin'), errorLogController.getErrorStats);
router.patch('/:id', protect, authorize('admin'), errorLogController.updateErrorLog);
router.delete('/:id', protect, authorize('admin'), errorLogController.deleteErrorLog);
router.post('/clear', protect, authorize('admin'), errorLogController.clearErrorLogs);
router.delete('/', protect, authorize('admin'), errorLogController.clearErrorLogs);

module.exports = router;
