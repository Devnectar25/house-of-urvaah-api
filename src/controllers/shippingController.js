/**
 * Shipping Controller
 * Exposes endpoints for forward shipping, courier assignment, live tracking,
 * reverse logistics (returns & replacements), document generation, and webhooks.
 */

const shiprocketService = require('../services/shiprocketService');
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

// 9. Cancel Order / Shipment
exports.cancelShipment = async (req, res) => {
    try {
        const { order_ids, order_id } = req.body;
        const targetIds = order_ids || order_id;
        if (!targetIds) {
            return res.status(400).json({ success: false, message: 'order_id or order_ids is required.' });
        }

        const result = await shiprocketService.cancelShipment(targetIds);
        return res.json(result);
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
    const client = await pool.connect();
    try {
        const { original_order, replacement_items, replacement_size } = req.body;
        if (!original_order) {
            return res.status(400).json({ success: false, message: 'original_order object is required.' });
        }

        const origId = original_order.id || original_order.order_number;
        const origRes = await client.query(
            `SELECT * FROM orders WHERE id::text = $1 OR order_number = $1`,
            [String(origId)]
        );
        if (origRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Original order not found in database.' });
        }
        const dbOrigOrder = origRes.rows[0];

        // Fetch original items
        const origItemsRes = await client.query(
            `SELECT * FROM order_items WHERE order_id = $1::uuid`,
            [dbOrigOrder.id]
        );
        const dbOrigItems = origItemsRes.rows;

        const chosenItems = (replacement_items && replacement_items.length > 0)
            ? replacement_items
            : dbOrigItems;

        const targetSize = replacement_size || original_order.replacement_size || dbOrigOrder.replacement_size || 'M';

        // Call shiprocket service for tracking/shipment
        const shiprocketResult = await shiprocketService.dispatchReplacement(
            { ...dbOrigOrder, ...original_order },
            chosenItems
        );

        const repOrderNumber = shiprocketResult.order_number || `${dbOrigOrder.order_number}-REP`;
        const repTracking = shiprocketResult.awb_code || `URV-REP-${Date.now().toString().slice(-8)}IN`;

        await client.query('BEGIN');

        // Check if replacement order already exists
        const existingRepRes = await client.query(
            `SELECT id, order_number FROM orders WHERE order_number = $1`,
            [repOrderNumber]
        );

        let repOrderId;
        if (existingRepRes.rows.length > 0) {
            repOrderId = existingRepRes.rows[0].id;
            await client.query(
                `UPDATE orders 
                 SET status = 'Confirmed',
                     tracking_number = COALESCE(tracking_number, $1),
                     updated_at = NOW()
                 WHERE id = $2::uuid`,
                [repTracking, repOrderId]
            );
        } else {
            // INSERT replacement forward order into `orders`
            const insertRepRes = await client.query(
                `INSERT INTO orders (
                    user_id, order_number, invoice_number, address_id,
                    payment_method, payment_status, payment_type,
                    subtotal, original_total, shipping, tax, discount_amount, total,
                    status, tracking_number, return_type,
                    original_order_number, original_order_id,
                    created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4,
                    'Exchange', 'Paid', 'Prepaid (Exchange)',
                    0, 0, 0, 0, 0, 0,
                    'Confirmed', $5, 'exchange',
                    $6, $7,
                    NOW(), NOW()
                ) RETURNING id`,
                [
                    dbOrigOrder.user_id,
                    repOrderNumber,
                    `INV-${repOrderNumber}`,
                    dbOrigOrder.address_id,
                    repTracking,
                    dbOrigOrder.order_number,
                    dbOrigOrder.id
                ]
            );
            repOrderId = insertRepRes.rows[0].id;

            // INSERT items into `order_items` for replacement forward order
            for (const it of chosenItems) {
                const prodId = it.product_id || it.id || 1;
                await client.query(
                    `INSERT INTO order_items (
                        order_id, product_id, name, price, quantity, image, size, status, created_at
                    ) VALUES (
                        $1::uuid, $2, $3, 0, $4, $5, $6, 'Confirmed', NOW()
                    )`,
                    [
                        repOrderId,
                        prodId,
                        it.name || 'Replacement Piece',
                        it.quantity || 1,
                        it.image || null,
                        targetSize
                    ]
                );
            }
        }

        // Link on original order and update status to Replaced
        await client.query(
            `UPDATE orders 
             SET status = 'Replaced',
                 replacement_order_number = $1,
                 replacement_order_id = $2::uuid,
                 replacement_size = $3,
                 updated_at = NOW()
             WHERE id = $4::uuid`,
            [repOrderNumber, repOrderId, targetSize, dbOrigOrder.id]
        );

        await client.query('COMMIT');

        return res.json({
            success: true,
            order_number: repOrderNumber,
            replacement_order_number: repOrderNumber,
            replacement_order_id: repOrderId,
            original_order_id: dbOrigOrder.id,
            shipment_id: shiprocketResult.shipment_id,
            awb_code: repTracking,
            courier_name: shiprocketResult.courier_name || 'Delhivery Express',
            status: 'Replacement Processing',
            message: `Replacement order #${repOrderNumber} generated and dispatched in size ${targetSize}.`
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[ShippingController] dispatchReplacement error:', err);
        return res.status(500).json({ success: false, message: err.message });
    } finally {
        client.release();
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
