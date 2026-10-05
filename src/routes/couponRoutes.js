const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const { protect, authorize, checkPermission } = require('../middlewares/authMiddleware');

// Admin Routes - Manage Coupons (Requires coupons permission for sub-admins)
router.post('/admin/coupons', protect, authorize('admin'), checkPermission('coupons'), couponController.createCoupon);
router.get('/admin/coupons', protect, authorize('admin'), checkPermission('coupons'), couponController.getAllCoupons);
router.put('/admin/coupons/:id', protect, authorize('admin'), checkPermission('coupons'), couponController.updateCoupon);
router.patch('/admin/coupons/:id/toggle-status', protect, authorize('admin'), checkPermission('coupons'), couponController.toggleCouponStatus);
router.delete('/admin/coupons/:id', protect, authorize('admin'), checkPermission('coupons'), couponController.deleteCoupon);

// Public/User Routes - Use Coupons
router.post('/coupons/validate', protect, couponController.validateCoupon);

// GET /api/user/coupons — returns active global + personally assigned coupons for this user
router.get('/user/coupons', protect, couponController.getUserCoupons);

// Admin: list all assigned users for a coupon
router.get('/admin/coupons/:id/assignments', protect, authorize('admin'), checkPermission('coupons'), couponController.getCouponAssignments);

// Admin: revoke a single user's assignment
router.patch('/admin/coupons/:couponId/assignments/:userId', protect, authorize('admin'), checkPermission('coupons'), couponController.revokeAssignment);

// Admin: list all users who used a coupon
router.get('/admin/coupons/:id/used-users', protect, authorize('admin'), checkPermission('coupons'), couponController.getUsedUsers);


module.exports = router;
