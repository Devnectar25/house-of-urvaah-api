/**
 * Shipping Controller
 * Exposes endpoints for forward shipping, courier assignment, live tracking,
 * reverse logistics (returns & replacements), document generation, and webhooks.
 */

const shiprocketService = require('../services/shiprocketService');
const shippingLabelService = require('../services/shippingLabelService');
const orderService = require('../services/orderService');
const pool = require('../config/db');

// 1. Check Serviceability & EDD
exports.checkServiceability = async (req, res) => {
    try {
        const { pincode, pickupPincode, weight, cod } = req.query;
        if (!pincode || !/^\d{6}$/.test(String(pincode).trim())) {
            return res.status(400).json({
                success: false,
                message: 'A valid 6-digit destination pincode is required.'
            });
        }

        const result = await shiprocketService.checkServiceability({
            deliveryPincode: pincode,
            pickupPincode,
            weight: weight ? parseFloat(weight) : 0.5,
            cod: cod === '0' ? 0 : 1
        });

        return res.json(result);
    } catch (err) {
        console.error('[ShippingController Check Serviceability Error]:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 2. Create Forward Shipment
exports.createForwardShipment = async (req, res) => {
    try {
        const orderData = req.body;
        if (!orderData || (!orderData.order_id && !orderData.order_number && !orderData.id)) {
            return res.status(400).json({
                success: false,
                message: 'Order data with a valid order ID or order number is required.'
            });
        }

        const result = await shiprocketService.createForwardShipment(orderData);

        // Sync shipment_id & tracking_number into the orders DB row if order exists
        const orderIdentifier = orderData.order_number || orderData.order_id || orderData.id;
        const shipmentId = result.shipment_id || (result.order_id ? `SR-${result.order_id}` : null);
        if (shipmentId && orderIdentifier) {
            try {
                await pool.query(
                    `UPDATE orders 
                     SET tracking_number = COALESCE(NULLIF(tracking_number, ''), $1),
                         shipment_id = COALESCE(NULLIF(shipment_id, ''), $1),
                         shipping_provider = COALESCE(shipping_provider, 'Shiprocket'),
                         updated_at = NOW()
                     WHERE order_number = $2 OR id::text = $2`,
                    [String(shipmentId), String(orderIdentifier)]
                );
                console.log(`[ShippingController] Synced shipment ID ${shipmentId} to database order ${orderIdentifier}`);
            } catch (dbErr) {
                console.warn('[ShippingController DB Sync Warning]:', dbErr.message);
            }
        }

        return res.json(result);
    } catch (err) {
        console.error('[ShippingController Create Shipment Error]:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 3. Assign Courier Partner & AWB
exports.assignAwb = async (req, res) => {
    try {
        const { shipment_id, courier_id } = req.body;
        if (!shipment_id) {
            return res.status(400).json({ success: false, message: 'shipment_id is required.' });
        }

        const result = await shiprocketService.assignAwb(shipment_id, courier_id);
        return res.json(result);
    } catch (err) {
        console.error('[ShippingController Assign AWB Error]:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 4. Schedule Courier Pickup
exports.schedulePickup = async (req, res) => {
    try {
        const { shipment_id, shipment_ids } = req.body;
        const targetIds = shipment_ids || shipment_id;
        if (!targetIds) {
            return res.status(400).json({ success: false, message: 'shipment_id or shipment_ids is required.' });
        }

        const result = await shiprocketService.schedulePickup(targetIds);

        // Sync logistics status to database
        try {
            const idList = Array.isArray(targetIds) ? targetIds : [targetIds];
            await pool.query(
                `UPDATE orders 
                 SET logistics_status = 'Pickup Scheduled',
                     shipment_status = 'Pickup Scheduled',
                     updated_at = NOW()
                 WHERE shipment_id = ANY($1::text[]) 
                    OR tracking_number = ANY($1::text[]) 
                    OR order_number = ANY($1::text[]) 
                    OR id::text = ANY($1::text[])`,
                [idList.map(String)]
            );
            console.log(`[ShippingController] Updated logistics_status to 'Pickup Scheduled' for:`, idList);
        } catch (dbErr) {
            console.warn('[ShippingController DB Sync Warning]:', dbErr.message);
        }

        return res.json(result);
    } catch (err) {
        console.error('[ShippingController Schedule Pickup Error]:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 5. Track Forward Shipment
exports.trackShipment = async (req, res) => {
    try {
        const awb = req.params.awb || req.query.awb;
        if (!awb) {
            return res.status(400).json({ success: false, message: 'AWB code is required.' });
        }

        const result = await shiprocketService.trackShipment(awb);
        return res.json(result);
    } catch (err) {
        console.error('[ShippingController Track Error]:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 6. Simulate Out for Delivery
exports.simulateOutForDelivery = async (req, res) => {
    try {
        const { awb } = req.body;
        if (!awb) {
            return res.status(400).json({ success: false, message: 'AWB code is required.' });
        }

        const result = await shiprocketService.triggerOutForDelivery(awb);
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 7. Simulate Delivered
exports.simulateDelivered = async (req, res) => {
    try {
        const { awb, recipient_name } = req.body;
        if (!awb) {
            return res.status(400).json({ success: false, message: 'AWB code is required.' });
        }

        const result = await shiprocketService.triggerDelivered(awb, recipient_name);
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 8. Generate Label & Manifest
exports.generateLabel = async (req, res) => {
    try {
        const { shipment_ids, shipment_id } = req.body;
        const targetIds = shipment_ids || shipment_id;
        if (!targetIds) {
            return res.status(400).json({ success: false, message: 'shipment_id is required.' });
        }

        const result = await shiprocketService.generateLabel(targetIds);
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// Stream or render Shipping Label (PDF, HTML, or JSON)
exports.getShippingLabel = async (req, res) => {
    try {
        const identifier = req.params.identifier || req.query.orderId || req.query.id || req.query.awb;
        if (!identifier) {
            return res.status(400).json({ success: false, message: 'Order ID or tracking number identifier is required.' });
        }

        const format = (req.query.format || '').toLowerCase();
        const isReturn = req.query.isReturn === 'true' || req.query.type === 'return';

        // 1. JSON Data Endpoint
        if (format === 'json') {
            const data = await shippingLabelService.getShippingLabelData(identifier, isReturn);
            return res.status(200).json({ success: true, data });
        }

        // 2. HTML Printable Label
        if (format === 'html' || req.query.print === '1' || req.headers.accept?.includes('text/html')) {
            const html = await shippingLabelService.generateShippingLabelHTML(identifier, { isReturn });
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(html);
        }

        // 3. Default: Binary PDF
        try {
            const pdfBuffer = await shippingLabelService.generateShippingLabelPDF(identifier, { isReturn });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="HOUSE_OF_URVAAH_SHIPPING_LABEL_${identifier}.pdf"`);
            res.setHeader('Content-Length', pdfBuffer.length);
            return res.end(pdfBuffer);
        } catch (pdfErr) {
            console.warn('[getShippingLabel] PDF rendering warning, falling back to HTML:', pdfErr.message);
            const html = await shippingLabelService.generateShippingLabelHTML(identifier, { isReturn });
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(html);
        }
    } catch (err) {
        console.error('[getShippingLabel Error]:', err);
        return res.status(err.message.includes('not found') ? 404 : 500).json({
            success: false,
            message: err.message
        });
    }
};

exports.generateManifest = async (req, res) => {
    try {
        const { shipment_ids, shipment_id } = req.body;
        const targetIds = shipment_ids || shipment_id;
        if (!targetIds) {
            return res.status(400).json({ success: false, message: 'shipment_id is required.' });
        }

        const result = await shiprocketService.generateManifest(targetIds);
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// Stream or render Handover Manifest (PDF or HTML)
exports.getShippingManifest = async (req, res) => {
    try {
        const identifier = req.params.identifier || req.query.orderId || req.query.id;
        if (!identifier) {
            return res.status(400).json({ success: false, message: 'Order ID or tracking number identifier is required.' });
        }

        const format = (req.query.format || '').toLowerCase();

        if (format === 'html' || req.query.print === '1' || req.headers.accept?.includes('text/html')) {
            const html = await shippingLabelService.generateManifestHTML(identifier);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(html);
        }

        try {
            const pdfBuffer = await shippingLabelService.generateManifestPDF(identifier);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="HOUSE_OF_URVAAH_MANIFEST_${identifier}.pdf"`);
            res.setHeader('Content-Length', pdfBuffer.length);
            return res.end(pdfBuffer);
        } catch (pdfErr) {
            const html = await shippingLabelService.generateManifestHTML(identifier);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(html);
        }
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 9. Cancel Order / Shipment
exports.cancelShipment = async (req, res) => {
    try {
        const { order_ids, order_id, reason, cancelReason, comments } = req.body;
        const targetIds = order_ids || order_id;
        if (!targetIds) {
            return res.status(400).json({ success: false, message: 'order_id or order_ids is required.' });
        }

        const ids = Array.isArray(targetIds) ? targetIds : [targetIds];
        const result = await shiprocketService.cancelShipment(ids);

        const finalReason = reason || cancelReason || comments || 'Customer requested order cancellation';
        const updatedOrders = [];

        // Synchronize with database: update status and void courier assignment
        for (const identifier of ids) {
            try {
                const order = await orderService.getOrderById(identifier);
                if (order) {
                    const currentStatus = (order.status || '').toLowerCase();
                    const isDelivered = currentStatus === 'delivered' || currentStatus === 'completed';
                    const targetStatus = isDelivered ? 'Cancellation Requested' : 'Cancelled';

                    const updated = await orderService.updateOrderStatus(
                        order.id,
                        targetStatus,
                        finalReason,
                        null,
                        order.payment_status
                    );
                    updatedOrders.push(updated);
                    console.log(`[CancelShipment API] Order #${order.order_number || order.id} marked as "${targetStatus}" in DB`);
                }
            } catch (dbErr) {
                console.warn(`[CancelShipment DB sync warning for ${identifier}]:`, dbErr.message);
            }
        }

        return res.json({
            success: true,
            status_code: 200,
            message: 'Order and shipment cancelled successfully.',
            ...result,
            updated_orders: updatedOrders
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 10. Customer Notifications
exports.notifyCustomer = async (req, res) => {
    try {
        const { order, status, tracking_info } = req.body;
        if (!order || !status) {
            return res.status(400).json({ success: false, message: 'order and status are required.' });
        }

        const result = await shiprocketService.notifyCustomer(order, status, tracking_info || {});
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 11. Create Reverse Pickup (Return Order)
exports.createReturnOrder = async (req, res) => {
    try {
        const { order, items_to_return, reason } = req.body;
        if (!order || !items_to_return || !items_to_return.length) {
            return res.status(400).json({
                success: false,
                message: 'order and items_to_return array are required.'
            });
        }

        const result = await shiprocketService.createReversePickup(order, items_to_return, reason);
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 12. Assign Return AWB
exports.assignReturnAwb = async (req, res) => {
    try {
        const { shipment_id } = req.body;
        if (!shipment_id) {
            return res.status(400).json({ success: false, message: 'shipment_id is required.' });
        }

        const result = await shiprocketService.assignReturnAwb(shipment_id);
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 13. Schedule Reverse Pickup
exports.scheduleReversePickup = async (req, res) => {
    try {
        const { shipment_ids, shipment_id } = req.body;
        const targetIds = shipment_ids || shipment_id;
        if (!targetIds) {
            return res.status(400).json({ success: false, message: 'shipment_id is required.' });
        }

        const result = await shiprocketService.scheduleReversePickup(targetIds);
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 14. Track Return Parcel
exports.trackReturnParcel = async (req, res) => {
    try {
        const awb = req.params.awb || req.query.awb;
        if (!awb) {
            return res.status(400).json({ success: false, message: 'Return AWB code is required.' });
        }

        const result = await shiprocketService.trackReturnParcel(awb);
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 15. Dispatch Replacement Item
exports.dispatchReplacement = async (req, res) => {
    try {
        const { original_order, replacement_items } = req.body;
        if (!original_order) {
            return res.status(400).json({ success: false, message: 'original_order object is required.' });
        }

        const result = await shiprocketService.dispatchReplacement(original_order, replacement_items);
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 16. Webhook Receiver
exports.handleWebhook = async (req, res) => {
    try {
        const payload = req.body;
        const result = await shiprocketService.handleWebhookEvent(payload);

        // Update database order status if mappedStatus exists
        const identifier = result.awb || payload.order_id || payload.order_number;
        if (result.mapped_urvaah_status && identifier) {
            try {
                const updateRes = await pool.query(
                    `UPDATE orders 
                     SET status = $1, 
                         tracking_number = COALESCE(tracking_number, $3), 
                         updated_at = NOW() 
                     WHERE tracking_number = $2 OR order_number = $2 OR id::text = $2
                     RETURNING id, order_number, status`,
                    [result.mapped_urvaah_status, identifier, result.awb || `URV-${Date.now().toString().slice(-8)}IN`]
                );
                
                if (updateRes.rows.length > 0) {
                    const updatedOrder = updateRes.rows[0];
                    console.log(`[SHIPROCKET WEBHOOK] Successfully synced order #${updatedOrder.order_number} to "${result.mapped_urvaah_status}"`);

                    // Also sync order_items status for forward delivery lifecycle
                    await pool.query(
                        `UPDATE order_items 
                         SET status = $1 
                         WHERE order_id = $2 
                           AND (status IS NULL OR status IN ('Pending', 'Confirmed', 'Processing', 'Shipped', 'Out for Delivery'))`,
                        [result.mapped_urvaah_status, updatedOrder.id]
                    );
                } else {
                    console.warn(`[SHIPROCKET WEBHOOK] No order found matching identifier: ${identifier}`);
                }
            } catch (dbErr) {
                console.warn('[SHIPROCKET WEBHOOK DB Sync Notice]:', dbErr.message);
            }
        }

        return res.json({ success: true, ...result });
    } catch (err) {
        console.error('[Shiprocket Webhook Receiver Error]:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};
