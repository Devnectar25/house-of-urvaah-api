const express = require('express');
const router = express.Router();
const shippingController = require('../controllers/shippingController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// Admin-desk operations change shipments / order state, so they require an admin token.
// Serviceability, tracking, checkout shipment creation, label/manifest view links and the
// courier webhook stay open as before.
const adminOnly = [protect, authorize('admin')];

// 0. Configuration & Connectivity Status Check
router.get('/config-status', shippingController.getConfigStatus);

// 1. Availability / Serviceability
router.get('/serviceability', shippingController.checkServiceability);

// 2. Create Forward Shipment
router.post('/order/create', shippingController.createForwardShipment);

// 3. Assign AWB
router.post('/courier/assign-awb', adminOnly, shippingController.assignAwb);

// 4. Schedule Pickup
router.post('/courier/pickup', adminOnly, shippingController.schedulePickup);

// 5. Track Shipment
router.get('/track/:awb', shippingController.trackShipment);
router.get('/track', shippingController.trackShipment);

// 6 & 7. Milestones (Out for Delivery & Delivered Simulators)
router.post('/simulate/out-for-delivery', adminOnly, shippingController.simulateOutForDelivery);
router.post('/simulate/delivered', adminOnly, shippingController.simulateDelivered);

// 8. Labels & Manifests
router.post('/label', adminOnly, shippingController.generateLabel);
router.post('/manifest', adminOnly, shippingController.generateManifest);
router.get('/label/view/:targetId', shippingController.viewLabelHtml);
router.get('/manifest/view/:targetId', shippingController.viewManifestHtml);

// 9. Cancel Order
router.post('/order/cancel', adminOnly, shippingController.cancelShipment);

// 10. Customer Notification
router.post('/notify', adminOnly, shippingController.notifyCustomer);

// 11. Create Reverse Order (Return)
router.post('/return/create', adminOnly, shippingController.createReturnOrder);

// 12. Assign Return AWB
router.post('/return/assign-awb', adminOnly, shippingController.assignReturnAwb);

// 13. Schedule Return Pickup
router.post('/return/pickup', adminOnly, shippingController.scheduleReversePickup);

// 14. Track Return Parcel
router.get('/return/track/:awb', shippingController.trackReturnParcel);
router.get('/return/track', shippingController.trackReturnParcel);

// 15. Dispatch Replacement
router.post('/replacement/dispatch', adminOnly, shippingController.dispatchReplacement);

// 16. Webhook
router.post('/webhook', shippingController.handleWebhook);

module.exports = router;
