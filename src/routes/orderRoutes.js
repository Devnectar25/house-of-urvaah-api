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
router.post('/:id/reorder', orderController.reorderOrder);
router.patch('/:id/status', orderController.updateOrderStatus);
router.patch('/:id/items/:itemId/status', authorize('admin'), checkPermission('orders'), orderController.updateOrderItemStatus);
router.patch('/:id/refund-status', authorize('admin'), checkPermission('orders'), orderController.updateRefundStatus);

router.post('/:id/return-request', orderController.requestReturnReplace);
router.post('/:id/cancel-item', orderController.requestItemCancellation);
router.patch('/:id/restock', authorize('admin'), checkPermission('orders'), orderController.restockOrder);


module.exports = router;
