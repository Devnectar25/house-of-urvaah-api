const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect, authorize, checkPermission } = require('../middlewares/authMiddleware');

router.get('/', protect, authorize('admin'), checkPermission('customers'), userController.getUsers);
router.patch('/:username/toggle-status', protect, authorize('admin'), checkPermission('customers'), userController.toggleUserStatus);
router.get('/profile', protect, userController.getProfile);
router.put('/profile', protect, userController.updateProfile);


module.exports = router;
