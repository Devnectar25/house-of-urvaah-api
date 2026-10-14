const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { protect, authorize, checkPermission } = require('../middlewares/authMiddleware');

router.use(protect);

router.get('/', authorize('admin'), checkPermission('orders'), orderController.getAllOrders);
router.get('/admin/cancelled-orders', authorize('admin'), checkPermission('orders'), orderController.getCancelledOrders);
router.get('/stats', authorize('admin'), checkPermission('orders'), orderController.getOrderStats);
router.post('/', orderController.createOrder);
router.post('/reorder/select', orderController.reorderOrder); // For intelligent reorder flow
router.get('/my-orders', orderController.getOrdersByUser);
router.get('/:id', orderController.getOrderById);
router.get('/:id/invoice', orderController.downloadInvoice);
router.put('/:id/address', orderController.updateOrderShippingAddress);
router.patch('/:id/address', orderController.updateOrderShippingAddress);
router.post('/:id/reorder', orderController.reorderOrder);
router.patch('/:id/status', orderController.updateOrderStatus);
router.patch('/:id/items/:itemId/status', authorize('admin'), checkPermission('orders'), orderController.updateOrderItemStatus);
router.patch('/:id/refund-status', authorize('admin'), checkPermission('orders'), orderController.updateRefundStatus);

router.post('/:id/return-request', orderController.requestReturnReplace);
router.post('/:id/replace', (req, res, next) => {
    if (req.user?.role !== 'admin') {
        req.body.status = 'Replacement Request Processing';
        req.body.type = 'Replacement';
    } else {
        req.body.status = req.body.status || 'Replace Approved';
    }
    return orderController.updateOrderStatus(req, res, next);
});
router.post('/:id/return', (req, res, next) => {
    if (req.user?.role !== 'admin') {
        req.body.status = 'Cancellation Requested';
    } else {
        req.body.status = req.body.status || 'Cancelled';
    }
    return orderController.updateOrderStatus(req, res, next);
});
router.post('/:id/cancel-item', orderController.requestItemCancellation);
router.post('/:id/cancel', (req, res, next) => {
    // If regular user requests cancellation (both pre-delivery and post-delivery), route to 'Cancellation Requested' for admin review
    if (req.user?.role !== 'admin') {
        req.body.status = req.body.status || 'Cancellation Requested';
    } else {
        req.body.status = req.body.status || 'Cancelled';
    }
    return orderController.updateOrderStatus(req, res, next);
});
router.patch('/:id/restock', authorize('admin'), checkPermission('orders'), orderController.restockOrder);


module.exports = router;
