/**
 * Shipping Controller
 * Exposes endpoints for forward shipping, courier assignment, live tracking,
 * reverse logistics (returns & replacements), document generation, and webhooks.
 */

const shiprocketService = require('../services/shiprocketService');
const pool = require('../config/db');

// 0. Configuration & Connectivity Health Check
exports.getConfigStatus = async (req, res) => {
    try {
        const status = await shiprocketService.getConfigStatus();
        return res.json(status);
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

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

        const orderIdentifier = orderData.order_number || orderData.order_id || orderData.id;

        // Idempotency Guard: Avoid duplicate forward shipments for the same order
        if (orderIdentifier) {
            try {
                const existingCheck = await pool.query(
                    `SELECT id, order_number, shipment_id, tracking_number, awb_code, courier_name, status, logistics_status 
                     FROM orders 
                     WHERE order_number = $1 OR id::text = $1`,
                    [String(orderIdentifier)]
                );
                if (existingCheck.rows.length > 0 && existingCheck.rows[0].shipment_id) {
                    const row = existingCheck.rows[0];
                    console.log(`[ShippingController] Order #${row.order_number} already has shipment ID ${row.shipment_id}. Returning existing shipment.`);
                    return res.json({
                        success: true,
                        status_code: 1,
                        status: row.status || 'PROCESSING',
                        order_id: row.order_number,
                        shipment_id: row.shipment_id,
                        awb_code: row.awb_code || row.tracking_number,
                        courier_name: row.courier_name,
                        already_exists: true,
                        message: 'Forward shipment already exists for this order.'
                    });
                }
            } catch (checkErr) {
                console.warn('[ShippingController Existing Check Warning]:', checkErr.message);
            }
        }

        const result = await shiprocketService.createForwardShipment(orderData);

        // Sync shipment_id & tracking_number into the orders DB row if order exists
        const shipmentId = result.shipment_id || (result.order_id ? `SR-${result.order_id}` : null);
        if (shipmentId && orderIdentifier) {
            try {
                await pool.query(
                    `UPDATE orders 
                     SET tracking_number = COALESCE(NULLIF(tracking_number, ''), $1),
                         shipment_id = COALESCE(NULLIF(shipment_id, ''), $1),
                         shipping_provider = COALESCE(shipping_provider, 'Shiprocket'),
                         shipment_status = COALESCE(shipment_status, 'Shipment Created'),
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
        const { shipment_id, courier_id, order_id, order_number } = req.body;
        if (!shipment_id) {
            return res.status(400).json({ success: false, message: 'shipment_id is required.' });
        }

        const result = await shiprocketService.assignAwb(shipment_id, courier_id);

        const awbCode = result.response?.data?.awb_code || result.awb_code;
        const courierName = result.response?.data?.courier_name || result.courier_name || (courier_id === 12 ? 'Blue Dart Air' : 'Delhivery Express');

        if (awbCode) {
            try {
                const targetId = order_number || order_id || shipment_id;
                await pool.query(
                    `UPDATE orders 
                     SET tracking_number = $1,
                         awb_code = $1,
                         courier_name = $2,
                         shipment_status = 'AWB Assigned',
                         logistics_status = COALESCE(logistics_status, 'AWB Assigned'),
                         updated_at = NOW()
                     WHERE shipment_id = $3 
                        OR tracking_number = $3 
                        OR order_number = $4 
                        OR id::text = $4`,
                    [String(awbCode), String(courierName), String(shipment_id), String(targetId)]
                );
                console.log(`[ShippingController] Synced AWB ${awbCode} (${courierName}) to database for shipment ${shipment_id}`);
            } catch (dbErr) {
                console.warn('[ShippingController DB Sync Warning]:', dbErr.message);
            }
        }

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

        // Sync cancellation to orders database
        try {
            const idList = Array.isArray(targetIds) ? targetIds : [targetIds];
            await pool.query(
                `UPDATE orders 
                 SET logistics_status = 'Cancelled',
                     shipment_status = 'Cancelled',
                     cancelled_at = COALESCE(cancelled_at, NOW()),
                     updated_at = NOW()
                 WHERE shipment_id = ANY($1::text[]) 
                    OR tracking_number = ANY($1::text[]) 
                    OR order_number = ANY($1::text[]) 
                    OR id::text = ANY($1::text[])`,
                [idList.map(String)]
            );
            console.log(`[ShippingController] Synced cancellation in DB for:`, idList);
        } catch (dbErr) {
            console.warn('[ShippingController Cancel DB Sync Warning]:', dbErr.message);
        }

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

        // Record reverse shipment ID and initial status in DB if order found
        const orderIdentifier = order.order_number || order.id;
        if (orderIdentifier && result.shipment_id) {
            try {
                await pool.query(
                    `UPDATE orders 
                     SET shipment_id = COALESCE(shipment_id, $1),
                         logistics_status = 'Return Initiated',
                         updated_at = NOW()
                     WHERE order_number = $2 OR id::text = $2`,
                    [String(result.shipment_id), String(orderIdentifier)]
                );
            } catch (dbErr) {
                console.warn('[ShippingController Return DB Sync Warning]:', dbErr.message);
            }
        }

        return res.json(result);
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 12. Assign Return AWB
exports.assignReturnAwb = async (req, res) => {
    try {
        const { shipment_id, order_number, order_id } = req.body;
        if (!shipment_id) {
            return res.status(400).json({ success: false, message: 'shipment_id is required.' });
        }

        const result = await shiprocketService.assignReturnAwb(shipment_id);
        const returnAwb = result.response?.data?.awb_code || result.awb_code;

        if (returnAwb) {
            try {
                const targetId = order_number || order_id || shipment_id;
                await pool.query(
                    `UPDATE orders 
                     SET tracking_number = $1,
                         awb_code = $1,
                         logistics_status = 'Return AWB Assigned',
                         updated_at = NOW()
                     WHERE shipment_id = $2 OR order_number = $3 OR id::text = $3`,
                    [String(returnAwb), String(shipment_id), String(targetId)]
                );
                console.log(`[ShippingController] Synced Return AWB ${returnAwb} to DB for shipment ${shipment_id}`);
            } catch (dbErr) {
                console.warn('[ShippingController Return AWB DB Sync Warning]:', dbErr.message);
            }
        }

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

        // Sync reverse pickup status to DB
        try {
            const idList = Array.isArray(targetIds) ? targetIds : [targetIds];
            await pool.query(
                `UPDATE orders 
                 SET logistics_status = 'Return Pickup Scheduled',
                     updated_at = NOW()
                 WHERE shipment_id = ANY($1::text[]) 
                    OR tracking_number = ANY($1::text[]) 
                    OR order_number = ANY($1::text[]) 
                    OR id::text = ANY($1::text[])`,
                [idList.map(String)]
            );
        } catch (dbErr) {
            console.warn('[ShippingController Reverse Pickup DB Sync Warning]:', dbErr.message);
        }

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

        // Record replacement order in database if not already present
        if (result && result.order_number) {
            try {
                const repNumber = result.order_number;
                const checkRep = await pool.query(
                    'SELECT id FROM orders WHERE order_number = $1',
                    [repNumber]
                );

                if (checkRep.rows.length === 0) {
                    const origId = original_order.id || original_order.order_id;
                    const origRes = await pool.query(
                        'SELECT * FROM orders WHERE id::text = $1 OR order_number = $1 LIMIT 1',
                        [String(origId)]
                    );
                    const origRow = origRes.rows[0];

                    if (origRow) {
                        // Determine requested replacement size from request, original order, or text notes
                        let targetSize = req.body.replacement_size || req.body.replacementSize || original_order.replacement_size || origRow.replacement_size;
                        if (!targetSize) {
                            const combinedReason = `${origRow.cancel_reason || ''} ${origRow.return_reason || ''}`;
                            const sizeMatch = combinedReason.match(/Preferred Size:\s*([A-Za-z0-9]+)/i) || 
                                              combinedReason.match(/Size:\s*([A-Za-z0-9]+)/i);
                            if (sizeMatch && sizeMatch[1]) {
                                targetSize = sizeMatch[1].trim();
                            }
                        }
                        if (!targetSize) targetSize = 'M';

                        const origTotal = Number(origRow.total || 0);
                        const origSubtotal = Number(origRow.subtotal || origTotal || 0);
                        const repItems = replacement_items || original_order.items || [];
                        const itemToCopy = repItems[0] || {};
                        const itemPrice = Number(itemToCopy.price || origSubtotal || origTotal || 0);

                        const insertRes = await pool.query(
                            `INSERT INTO orders (
                                user_id, order_number, invoice_number, address_id, shipping_address,
                                payment_method, payment_status, payment_type,
                                subtotal, total, original_total, shipping, tax, discount_amount,
                                status, logistics_status, shipment_status, tracking_number, awb_code, 
                                courier_name, shipment_id, return_type, original_order_id, original_order_number, replacement_size, created_at, updated_at
                            ) VALUES (
                                $1, $2, $3, $4, $5,
                                'Replacement Exchange', 'Paid', 'Exchange',
                                $6, $7, $7, 0, 0, 0,
                                'Confirmed', 'Order Placed & Confirmed', 'Processing', $8, $8,
                                $9, $10, 'exchange', $11, $12, $13, NOW(), NOW()
                            ) RETURNING id`,
                            [
                                origRow.user_id,
                                repNumber,
                                `HOU-REP-${Date.now().toString().slice(-6)}`,
                                origRow.address_id,
                                origRow.shipping_address,
                                origSubtotal,
                                origTotal,
                                result.awb_code,
                                result.courier_name,
                                result.shipment_id,
                                origRow.id,
                                origRow.order_number,
                                targetSize
                            ]
                        );

                        const newRepId = insertRes.rows[0]?.id;
                        await pool.query(
                            `INSERT INTO order_items (order_id, product_id, name, image, price, quantity, size, status, created_at)
                             VALUES ($1, $2, $3, $4, $5, $6, $7, 'Confirmed', NOW())`,
                            [
                                newRepId,
                                itemToCopy.product_id || itemToCopy.id || 1,
                                itemToCopy.name || itemToCopy.title || 'Replacement Garment',
                                itemToCopy.image || itemToCopy.image_url || origRow.image || '/assets/Images/Brown01.png',
                                itemPrice,
                                itemToCopy.quantity || 1,
                                targetSize
                            ]
                        );
                        console.log(`[ShippingController] Created database replacement order #${repNumber} (ID: ${newRepId}, Size: ${targetSize}, Price: ${itemPrice})`);

                        // Also update original parent order with replacement links
                        await pool.query(
                            `UPDATE orders SET 
                                status = 'Replaced', 
                                logistics_status = 'Replacement Order Dispatched',
                                shipment_status = 'In Transit',
                                replacement_order_id = $2,
                                replacement_order_number = $3,
                                replacement_size = $4,
                                tracking_number = COALESCE($5, tracking_number),
                                awb_code = COALESCE($5, awb_code),
                                courier_name = COALESCE($6, courier_name),
                                payment_status = 'Paid',
                                updated_at = NOW()
                             WHERE id = $1`,
                            [origRow.id, newRepId, repNumber, targetSize, result.awb_code, result.courier_name]
                        );

                        result.replacement_order_id = newRepId;
                        result.replacement_order_number = repNumber;
                        result.replacement_size = targetSize;
                    }
                }
            } catch (dbErr) {
                console.warn('[ShippingController Replacement DB Sync Warning]:', dbErr.message);
            }
        }

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
                     RETURNING id, order_number, status, payment_method, payment_type`,
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

                    // If Delivered: mark COD orders Paid and trigger delivery confirmation workflow
                    if (result.mapped_urvaah_status === 'Delivered') {
                        const isCod = (updatedOrder.payment_method || '').toLowerCase() === 'cod' ||
                                      (updatedOrder.payment_type || '').toLowerCase() === 'cod' ||
                                      (updatedOrder.payment_method || '').toLowerCase().includes('cash');
                        if (isCod) {
                            await pool.query(
                                `UPDATE orders SET payment_status = 'Paid' WHERE id = $1`,
                                [updatedOrder.id]
                            );
                            console.log(`[SHIPROCKET WEBHOOK] COD order #${updatedOrder.order_number} marked Paid on delivery.`);
                        }

                        // Trigger delivery confirmation email with invoice and feedback
                        try {
                            const orderEmailService = require('../services/orderEmailService');
                            if (orderEmailService && typeof orderEmailService.sendDeliveryConfirmationWorkflow === 'function') {
                                orderEmailService.sendDeliveryConfirmationWorkflow(updatedOrder.id).catch(emailErr => {
                                    console.warn('[SHIPROCKET WEBHOOK] Delivery email notice:', emailErr.message);
                                });
                            }
                        } catch (_) {}
                    }
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

// 17. Printable HTML View for Shipping Label
exports.viewLabelHtml = async (req, res) => {
    try {
        const { targetId } = req.params;
        let order = null;

        if (targetId) {
            const query = `
                SELECT * FROM orders 
                WHERE tracking_number = $1 
                   OR awb_code = $1 
                   OR shipment_id = $1 
                   OR order_number = $1 
                   OR id::text = $1 
                LIMIT 1
            `;
            const dbRes = await pool.query(query, [String(targetId)]);
            if (dbRes.rows.length > 0) {
                order = dbRes.rows[0];
            }
        }

        const awb = order?.tracking_number || order?.awb_code || targetId || 'URV109418566IN';
        const isReturn = String(awb).startsWith('REV') || (order?.status || '').toLowerCase().includes('return');
        const courier = order?.courier_name || (isReturn ? 'Delhivery Reverse Logistics' : 'Delhivery Express');
        const orderNumber = order?.order_number || `#ORD-${order?.id || targetId}`;
        const recipientName = order?.shipping_name || order?.recipient_name || order?.customer_name || 'Valued Customer';
        const phone = order?.shipping_phone || order?.phone || '+91 98765 43210';
        const address = order?.shipping_address || order?.address || 'Signature Suite, Luxury Boulevard';
        const city = order?.shipping_city || order?.city || 'Mumbai';
        const state = order?.shipping_state || order?.state || 'Maharashtra';
        const pincode = order?.shipping_pincode || order?.pincode || '400001';
        const total = parseFloat(order?.total || 4999).toLocaleString('en-IN');
        const isCod = (order?.payment_method || '').toLowerCase() === 'cod';

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Shipping Label - ${awb}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 24px; display: flex; justify-content: center; }
    .label { width: 380px; background: #fff; border: 2px solid #000; padding: 16px; box-sizing: border-box; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 8px; }
    .logo { font-size: 16px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; }
    .courier-badge { background: #000; color: #fff; padding: 3px 6px; font-size: 11px; font-weight: bold; font-family: monospace; }
    .barcode-container { text-align: center; padding: 12px 0; border-bottom: 2px solid #000; }
    .barcode-lines { height: 48px; display: flex; justify-content: center; gap: 2px; margin-bottom: 6px; }
    .bar { background: #000; height: 100%; }
    .awb-code { font-family: monospace; font-size: 14px; font-weight: 900; letter-spacing: 3px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 2px solid #000; padding: 8px 0; font-size: 11px; }
    .section-title { font-size: 9px; font-weight: 900; text-transform: uppercase; background: #000; color: #fff; padding: 2px 4px; display: inline-block; margin-bottom: 4px; }
    .address-block { border-bottom: 2px solid #000; padding: 8px 0; font-size: 11px; line-height: 1.4; }
    .shipper-block { border-bottom: 2px solid #000; padding: 8px 0; font-size: 10px; color: #444; line-height: 1.3; }
    .footer { display: flex; justify-content: space-between; align-items: center; padding-top: 8px; font-size: 9px; color: #666; }
    .print-bar { position: fixed; top: 12px; right: 12px; }
    .btn-print { background: #059669; color: #fff; border: none; padding: 8px 16px; font-weight: bold; border-radius: 6px; cursor: pointer; font-size: 12px; text-transform: uppercase; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
    @media print {
      body { background: #fff; padding: 0; }
      .print-bar { display: none !important; }
      .label { border: 2px solid #000 !important; width: 100% !important; max-width: 380px !important; margin: 0 auto !important; }
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <button class="btn-print" onclick="window.print()">🖨️ Print Shipping Label</button>
  </div>
  <div class="label">
    <div class="header">
      <div>
        <div class="logo">HOUSE OF URVAAH</div>
        <div style="font-size: 9px; color: #555; text-transform: uppercase; letter-spacing: 1px;">Haute Couture & Atelier Express</div>
      </div>
      <div style="text-align: right;">
        <span class="courier-badge">${courier}</span>
        <div style="font-family: monospace; font-size: 10px; font-weight: bold; margin-top: 2px;">DEL/EXP/${pincode.slice(0, 3)}</div>
      </div>
    </div>
    <div class="barcode-container">
      <div class="barcode-lines">
        ${[4, 2, 6, 2, 8, 3, 5, 2, 7, 3, 4, 2, 6, 3, 8, 2, 4, 3, 7, 2, 5, 3, 8, 4, 3, 2, 6, 3, 8, 4, 2, 6, 3, 7, 2, 5, 3, 8, 4, 2, 6].map((w, i) =>
          `<div class="bar" style="width: ${w}px; background: ${i % 2 === 0 ? '#000' : 'transparent'};"></div>`
        ).join('')}
      </div>
      <div class="awb-code">${awb}</div>
    </div>
    <div class="meta-grid">
      <div style="border-right: 1px solid #000; padding-right: 8px;">
        <div style="font-size: 9px; color: #666; text-transform: uppercase;">Order Number</div>
        <div style="font-weight: 900; font-family: monospace; font-size: 12px;">${orderNumber}</div>
      </div>
      <div style="padding-left: 8px;">
        <div style="font-size: 9px; color: #666; text-transform: uppercase;">Payment</div>
        <div style="font-weight: 900; font-size: 11px;">${isCod ? `COD: ₹${total}` : 'PREPAID'}</div>
        <div style="font-size: 9px; color: #666;">Weight: 0.85 KG</div>
      </div>
    </div>
    <div class="address-block">
      <span class="section-title">DELIVER TO:</span>
      <div style="font-weight: bold; font-size: 13px;">${recipientName}</div>
      <div>${address}</div>
      <div style="font-weight: bold; font-size: 12px;">${city}, ${state} - <u>${pincode}</u></div>
      <div style="font-family: monospace; font-weight: bold; margin-top: 2px;">Phone: ${phone}</div>
    </div>
    <div class="shipper-block">
      <div style="font-size: 8.5px; text-transform: uppercase; font-weight: bold;">IF UNDELIVERED, RETURN TO:</div>
      <strong>HOUSE OF URVAAH ATELIER CENTRAL WAREHOUSE</strong><br>
      Plot 402, Signature Industrial Estate, Kurla East, Mumbai, MH - 400024<br>
      <span style="font-family: monospace; font-size: 9px;">GSTIN: 27AABCH8821F1ZX • concierge@urvaah.com</span>
    </div>
    <div class="footer">
      <span>Shiprocket Logistics Network</span>
      <span style="font-family: monospace; font-weight: bold;">URVAAH-DISPATCH-V4</span>
    </div>
  </div>
</body>
</html>`;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
    } catch (err) {
        console.error('[ShippingController viewLabelHtml Error]:', err.message);
        return res.status(500).send('<h3>Failed to generate shipping label view</h3><p>' + err.message + '</p>');
    }
};

// 18. Printable HTML View for Pickup Manifest
exports.viewManifestHtml = async (req, res) => {
    try {
        const { targetId } = req.params;
        let order = null;

        if (targetId) {
            const query = `
                SELECT * FROM orders 
                WHERE tracking_number = $1 
                   OR awb_code = $1 
                   OR shipment_id = $1 
                   OR order_number = $1 
                   OR id::text = $1 
                LIMIT 1
            `;
            const dbRes = await pool.query(query, [String(targetId)]);
            if (dbRes.rows.length > 0) {
                order = dbRes.rows[0];
            }
        }

        const awb = order?.tracking_number || order?.awb_code || targetId || 'URV109418566IN';
        const isReturn = String(awb).startsWith('REV') || (order?.status || '').toLowerCase().includes('return');
        const courier = order?.courier_name || (isReturn ? 'Delhivery Reverse Logistics' : 'Delhivery Express');
        const orderNumber = order?.order_number || `#ORD-${order?.id || targetId}`;
        const recipientName = order?.shipping_name || order?.recipient_name || order?.customer_name || 'Customer';
        const city = order?.shipping_city || order?.city || 'Mumbai';
        const pincode = order?.shipping_pincode || order?.pincode || '400001';
        const manifestToken = order?.pickup_token || `MNF-${Date.now().toString().slice(-8)}`;
        const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Pickup Manifest - ${manifestToken}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 24px; display: flex; justify-content: center; }
    .manifest { width: 700px; background: #fff; border: 1px solid #333; padding: 24px; box-sizing: border-box; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 12px; }
    .title { font-size: 18px; font-weight: 900; letter-spacing: 2px; }
    .table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 11px; }
    .table th, .table td { border: 1px solid #333; padding: 8px 10px; text-align: left; }
    .table th { background: #000; color: #fff; font-weight: bold; text-transform: uppercase; font-size: 10px; }
    .verify-box { border: 1px solid #000; padding: 12px; margin-top: 16px; background: #fafafa; font-size: 11px; }
    .signature-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 12px; }
    .sig-line { border-bottom: 1px solid #000; height: 28px; }
    .print-bar { position: fixed; top: 12px; right: 12px; }
    .btn-print { background: #d97706; color: #fff; border: none; padding: 8px 16px; font-weight: bold; border-radius: 6px; cursor: pointer; font-size: 12px; text-transform: uppercase; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
    @media print {
      body { background: #fff; padding: 0; }
      .print-bar { display: none !important; }
      .manifest { border: 1px solid #000 !important; width: 100% !important; margin: 0 !important; }
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <button class="btn-print" onclick="window.print()">🖨️ Print Courier Manifest</button>
  </div>
  <div class="manifest">
    <div class="header">
      <div>
        <div class="title">HOUSE OF URVAAH</div>
        <div style="font-size: 11px; color: #555; text-transform: uppercase; font-weight: bold;">Courier Dispatch Handover Manifest</div>
        <div style="font-size: 10px; color: #666; margin-top: 2px;">Atelier Warehouse: Kurla East Hub, Mumbai 400024</div>
      </div>
      <div style="text-align: right;">
        <div style="font-family: monospace; font-size: 14px; font-weight: bold;">${manifestToken}</div>
        <div style="font-size: 11px; color: #444;">Date: ${dateStr}</div>
        <div style="display: inline-block; background: #000; color: #fff; padding: 2px 8px; font-size: 10px; font-weight: bold; margin-top: 4px;">${courier}</div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 12px; padding: 10px; background: #f8f8f8; border: 1px solid #ddd; font-size: 11px;">
      <div><span style="color: #666; font-size: 9px; text-transform: uppercase; display: block;">Total Shipments:</span><strong>1 Parcel</strong></div>
      <div><span style="color: #666; font-size: 9px; text-transform: uppercase; display: block;">Courier Partner:</span><strong>${courier}</strong></div>
      <div><span style="color: #666; font-size: 9px; text-transform: uppercase; display: block;">Manifest Type:</span><strong>${isReturn ? 'Reverse Doorstep Return' : 'Forward Outbound Dispatch'}</strong></div>
    </div>

    <table class="table">
      <thead>
        <tr>
          <th>#</th>
          <th>AWB Number</th>
          <th>Order ID</th>
          <th>Consignee</th>
          <th>Dest. PIN</th>
          <th>Weight</th>
          <th>Driver Check</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="font-family: monospace; font-weight: bold;">1</td>
          <td style="font-family: monospace; font-weight: bold;">${awb}</td>
          <td style="font-family: monospace;">${orderNumber}</td>
          <td><strong>${recipientName}</strong><br><span style="color: #666; font-size: 10px;">${city}</span></td>
          <td style="font-family: monospace; font-weight: bold;">${pincode}</td>
          <td style="font-family: monospace;">0.85 kg</td>
          <td style="text-align: center;"><div style="width: 14px; height: 14px; border: 2px solid #000; margin: auto;"></div></td>
        </tr>
      </tbody>
    </table>

    <div class="verify-box">
      <strong style="text-transform: uppercase; font-size: 10px; display: block; border-bottom: 1px solid #ddd; padding-bottom: 4px;">Courier Pickup Executive Handover Verification</strong>
      <div class="signature-grid">
        <div><span style="color: #666; font-size: 9px; text-transform: uppercase;">Executive Name</span><div class="sig-line"></div></div>
        <div><span style="color: #666; font-size: 9px; text-transform: uppercase;">Executive Mobile</span><div class="sig-line"></div></div>
        <div><span style="color: #666; font-size: 9px; text-transform: uppercase;">Vehicle Number</span><div class="sig-line"></div></div>
        <div><span style="color: #666; font-size: 9px; text-transform: uppercase;">Executive Signature</span><div class="sig-line"></div></div>
      </div>
      <p style="font-size: 9.5px; color: #666; font-style: italic; margin-top: 8px; margin-bottom: 0;">
        I hereby acknowledge receipt of <strong>1 (One)</strong> sealed package(s) from House of Urvaah in tamper-evident packaging with security barcoding intact.
      </p>
    </div>

    <div style="display: flex; justify-content: space-between; font-size: 9px; color: #666; margin-top: 12px; border-top: 1px solid #ddd; padding-top: 6px;">
      <span>House of Urvaah Enterprise Logistics System • Shiprocket Integration</span>
      <span style="font-family: monospace;">PAGE 1 OF 1</span>
    </div>
  </div>
</body>
</html>`;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
    } catch (err) {
        console.error('[ShippingController viewManifestHtml Error]:', err.message);
        return res.status(500).send('<h3>Failed to generate manifest view</h3><p>' + err.message + '</p>');
    }
};
