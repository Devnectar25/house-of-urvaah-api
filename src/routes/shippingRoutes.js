const express = require('express');
const router = express.Router();
const shippingController = require('../controllers/shippingController');

// 1. Availability / Serviceability
router.get('/serviceability', shippingController.checkServiceability);

// 2. Create Forward Shipment
router.post('/order/create', shippingController.createForwardShipment);

// 3. Assign AWB
router.post('/courier/assign-awb', shippingController.assignAwb);

// 4. Schedule Pickup
router.post('/courier/pickup', shippingController.schedulePickup);

// 5. Track Shipment
router.get('/track/:awb', shippingController.trackShipment);
router.get('/track', shippingController.trackShipment);

// 6 & 7. Milestones (Out for Delivery & Delivered Simulators)
router.post('/simulate/out-for-delivery', shippingController.simulateOutForDelivery);
router.post('/simulate/delivered', shippingController.simulateDelivered);

// 8. Labels & Manifests
router.get('/label/:identifier', shippingController.getShippingLabel);
router.get('/label', shippingController.getShippingLabel);
router.post('/label', shippingController.generateLabel);
router.get('/manifest/:identifier', shippingController.getShippingManifest);
router.get('/manifest', shippingController.getShippingManifest);
router.post('/manifest', shippingController.generateManifest);

// 9. Cancel Order
router.post('/order/cancel', shippingController.cancelShipment);

// 10. Customer Notification
router.post('/notify', shippingController.notifyCustomer);

// 11. Create Reverse Order (Return)
router.post('/return/create', shippingController.createReturnOrder);

// 12. Assign Return AWB
router.post('/return/assign-awb', shippingController.assignReturnAwb);

// 13. Schedule Return Pickup
router.post('/return/pickup', shippingController.scheduleReversePickup);

// 14. Track Return Parcel
router.get('/return/track/:awb', shippingController.trackReturnParcel);
router.get('/return/track', shippingController.trackReturnParcel);

// 15. Dispatch Replacement
router.post('/replacement/dispatch', shippingController.dispatchReplacement);

// 16. Webhook
router.post('/webhook', shippingController.handleWebhook);

module.exports = router;
