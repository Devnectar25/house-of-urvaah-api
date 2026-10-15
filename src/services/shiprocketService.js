/**
 * Shiprocket Logistics Service (Dual Mode: Mock & Real API)
 * Handles forward logistics, reverse pickups, live tracking, and document generation.
 * 
 * Switching to Real API:
 * Set SHIPROCKET_MOCK=false in your .env and provide SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD.
 */

const axios = require('axios');

const SHIPROCKET_BASE_URL = 'https://apiv2.shiprocket.in/v1/external';
let cachedToken = null;
let tokenExpiresAt = null;

/**
 * Checks whether mock mode is enabled (default is true for safe local testing)
 */
const isMockMode = () => {
    return process.env.SHIPROCKET_MOCK !== 'false';
};

/**
 * Retrieves valid Shiprocket JWT Auth Token.
 * Caches token in memory for up to 9 days (Shiprocket tokens expire in 10 days).
 */
const getAuthToken = async () => {
    if (isMockMode()) {
        return 'mock_jwt_shiprocket_token_urvaah_2026';
    }

    const now = Date.now();
    if (cachedToken && tokenExpiresAt && now < tokenExpiresAt) {
        return cachedToken;
    }

    const email = process.env.SHIPROCKET_EMAIL;
    const password = process.env.SHIPROCKET_PASSWORD;

    if (!email || !password) {
        throw new Error('Shiprocket credentials missing. Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD in .env.');
    }

    try {
        const response = await axios.post(`${SHIPROCKET_BASE_URL}/auth/login`, {
            email,
            password
        });

        if (response.data && response.data.token) {
            cachedToken = response.data.token;
            // Cache for 9 days in milliseconds
            tokenExpiresAt = now + (9 * 24 * 60 * 60 * 1000);
            return cachedToken;
        } else {
            throw new Error('Failed to obtain token from Shiprocket authentication API.');
        }
    } catch (err) {
        console.error('[Shiprocket Auth Error]:', err.response?.data || err.message);
        throw new Error(`Shiprocket Authentication Failed: ${err.response?.data?.message || err.message}`);
    }
};

/**
 * Common Axios requester with authorization headers
 */
const apiClient = async (method, endpoint, data = null, params = null) => {
    const token = await getAuthToken();
    return axios({
        method,
        url: `${SHIPROCKET_BASE_URL}${endpoint}`,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        data,
        params
    });
};

// ============================================================================
// 1. AVAILABILITY & SERVICEABILITY API
// ============================================================================
exports.checkServiceability = async ({
    deliveryPincode,
    pickupPincode = process.env.SHIPROCKET_PICKUP_PINCODE || '411001',
    weight = 0.5,
    cod = 1
}) => {
    const cleanDelivery = String(deliveryPincode || '').trim();
    const cleanPickup = String(pickupPincode || '').trim();

    if (isMockMode()) {
        console.log(`[SHIPROCKET MOCK] Checking serviceability from ${cleanPickup} to ${cleanDelivery}`);
        
        // Treat 000000 or pincodes starting with 999 as unserviceable for testing
        const isUnserviceable = cleanDelivery === '000000' || cleanDelivery.startsWith('999');
        if (isUnserviceable) {
            return {
                success: true,
                available: false,
                pincode: cleanDelivery,
                message: 'Delivery is currently unavailable for this PIN code.',
                data: { available_courier_companies: [] }
            };
        }

        // Metro vs Non-Metro simulated transit days
        const isMetro = ['110', '400', '560', '700', '600', '500'].some(prefix => cleanDelivery.startsWith(prefix));
        const minDays = isMetro ? 2 : 3;
        const maxDays = isMetro ? 3 : 5;

        return {
            success: true,
            available: true,
            pincode: cleanDelivery,
            pickupPincode: cleanPickup,
            zone: isMetro ? 'METRO' : 'DOMESTIC',
            minDays,
            maxDays,
            data: {
                available_courier_companies: [
                    {
                        courier_company_id: 10,
                        courier_name: 'Delhivery Express',
                        estimated_delivery_days: minDays,
                        rate: 65.0,
                        cod: 1,
                        etd_hours: minDays * 24
                    },
                    {
                        courier_company_id: 12,
                        courier_name: 'Blue Dart Air',
                        estimated_delivery_days: minDays,
                        rate: 95.0,
                        cod: 1,
                        etd_hours: minDays * 24
                    },
                    {
                        courier_company_id: 14,
                        courier_name: 'Shadowfax Surface',
                        estimated_delivery_days: maxDays,
                        rate: 55.0,
                        cod: 1,
                        etd_hours: maxDays * 24
                    }
                ]
            }
        };
    }

    try {
        const response = await apiClient('GET', '/courier/serviceability/', null, {
            pickup_postcode: cleanPickup,
            delivery_postcode: cleanDelivery,
            weight,
            cod: cod ? 1 : 0
        });

        const couriers = response.data?.data?.available_courier_companies || [];
        const isAvailable = couriers.length > 0;
        
        let minDays = 3;
        let maxDays = 5;
        if (isAvailable) {
            const daysList = couriers
                .map(c => parseInt(c.estimated_delivery_days, 10))
                .filter(d => !isNaN(d) && d > 0);
            if (daysList.length > 0) {
                minDays = Math.min(...daysList);
                maxDays = Math.max(...daysList);
            }
        }

        return {
            success: true,
            available: isAvailable,
            pincode: cleanDelivery,
            pickupPincode: cleanPickup,
            minDays,
            maxDays,
            data: response.data?.data || {}
        };
    } catch (err) {
        console.error('[Shiprocket Serviceability Error]:', err.response?.data || err.message);
        throw new Error(`Serviceability check failed: ${err.response?.data?.message || err.message}`);
    }
};

// ============================================================================
// 2. CREATE FORWARD SHIPMENT (Simulated / Live Order Push)
// ============================================================================
exports.createForwardShipment = async (order) => {
    const payload = {
        order_id: String(order.order_number || order.id),
        order_date: order.created_at || new Date().toISOString().replace('T', ' ').substring(0, 16),
        pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION_NAME || 'Primary Atelier',
        billing_customer_name: order.shippingAddress?.firstName || order.recipient_name?.split(' ')[0] || 'Customer',
        billing_last_name: order.shippingAddress?.lastName || order.recipient_name?.split(' ').slice(1).join(' ') || '',
        billing_address: order.shippingAddress?.address || order.shipping_address_line || 'Boutique Address',
        billing_city: order.shippingAddress?.city || order.city || 'Mumbai',
        billing_pincode: String(order.shippingAddress?.pincode || order.pincode || '400001'),
        billing_state: order.shippingAddress?.state || order.state || 'Maharashtra',
        billing_country: order.shippingAddress?.country || 'India',
        billing_email: order.shippingAddress?.email || order.customer_email || 'customer@houseofurvaah.com',
        billing_phone: String(order.shippingAddress?.phone || order.recipient_phone || '9999999999'),
        shipping_is_billing: true,
        order_items: (order.items || []).map(item => ({
            name: item.name || item.title || 'Luxury Garment',
            sku: String(item.product_id || item.sku || 'URV-SKU-001'),
            units: parseInt(item.quantity || 1, 10),
            selling_price: parseFloat(item.price || item.unit_price || 0)
        })),
        payment_method: (order.payment_method === 'cod' || order.payment_type === 'COD') ? 'COD' : 'Prepaid',
        sub_total: parseFloat(order.subtotal || order.total || 0),
        length: 15,
        breadth: 12,
        height: 6,
        weight: order.weight || 0.6
    };

    if (isMockMode()) {
        const mockShipmentId = `SR-MOCK-SHP-${Date.now().toString().slice(-6)}`;
        const mockOrderId = Math.floor(1000000 + Math.random() * 9000000);
        console.log(`[SHIPROCKET MOCK] Created Forward Shipment: ID=${mockShipmentId}, Order=${payload.order_id}`);
        return {
            success: true,
            status_code: 1,
            status: 'NEW',
            order_id: mockOrderId,
            shipment_id: mockShipmentId,
            message: 'Forward shipment created successfully in Shiprocket (MOCK)'
        };
    }

    try {
        const response = await apiClient('POST', '/orders/create/adhoc', payload);
        return {
            success: true,
            ...response.data
        };
    } catch (err) {
        console.error('[Shiprocket Create Shipment Error]:', err.response?.data || err.message);
        throw new Error(`Failed to create shipment: ${err.response?.data?.message || err.message}`);
    }
};

// ============================================================================
// 3. GENERATE AWB NUMBER (Assign Courier Partner)
// ============================================================================
exports.assignAwb = async (shipmentId, courierId = null) => {
    if (isMockMode()) {
        const mockAwb = `URV${Math.floor(100000000 + Math.random() * 900000000)}IN`;
        console.log(`[SHIPROCKET MOCK] Assigned AWB: ${mockAwb} to shipment ${shipmentId}`);
        return {
            success: true,
            awb_assign_status: 1,
            response: {
                data: {
                    awb_code: mockAwb,
                    courier_company_id: courierId || 10,
                    courier_name: courierId === 12 ? 'Blue Dart Air' : 'Delhivery Express',
                    shipment_id: shipmentId,
                    assigned_date_time: new Date().toISOString()
                }
            }
        };
    }

    try {
        const payload = { shipment_id: shipmentId };
        if (courierId) payload.courier_id = courierId;
        const response = await apiClient('POST', '/courier/assign/awb', payload);
        return {
            success: true,
            ...response.data
        };
    } catch (err) {
        console.error('[Shiprocket Assign AWB Error]:', err.response?.data || err.message);
        throw new Error(`Failed to assign AWB: ${err.response?.data?.message || err.message}`);
    }
};

// ============================================================================
// 4. SCHEDULE COURIER PICKUP
// ============================================================================
exports.schedulePickup = async (shipmentIds) => {
    const ids = Array.isArray(shipmentIds) ? shipmentIds : [shipmentIds];

    if (isMockMode()) {
        const tokenNumber = `PKP-MOCK-${Math.floor(10000 + Math.random() * 90000)}`;
        const pickupDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString().replace('T', ' ').substring(0, 16);
        console.log(`[SHIPROCKET MOCK] Scheduled Pickup for shipments: ${ids.join(', ')} (Token: ${tokenNumber})`);
        return {
            success: true,
            pickup_status: 1,
            response: {
                pickup_token_number: tokenNumber,
                pickup_scheduled_date: pickupDate,
                message: 'Courier pickup scheduled successfully from House of Urvaah Atelier.'
            }
        };
    }

    try {
        const response = await apiClient('POST', '/courier/generate/pickup', { shipment_id: ids });
        return {
            success: true,
            ...response.data
        };
    } catch (err) {
        console.error('[Shiprocket Schedule Pickup Error]:', err.response?.data || err.message);
        throw new Error(`Failed to schedule pickup: ${err.response?.data?.message || err.message}`);
    }
};

// ============================================================================
// 5. LIVE SHIPMENT TRACKING
// ============================================================================
exports.trackShipment = async (awbCode) => {
    const cleanAwb = String(awbCode || '').trim();

    if (isMockMode()) {
        console.log(`[SHIPROCKET MOCK] Tracking AWB: ${cleanAwb}`);
        const now = new Date();
        const dateStr = (offsetHours) => new Date(now.getTime() - offsetHours * 3600000).toISOString().replace('T', ' ').substring(0, 19);

        return {
            success: true,
            tracking_data: {
                track_status: 1,
                shipment_status: 3,
                current_status: 'IN TRANSIT',
                awb_code: cleanAwb,
                etd: new Date(now.getTime() + 48 * 3600000).toISOString().replace('T', ' ').substring(0, 19),
                origin: 'House of Urvaah Atelier (Mumbai)',
                destination: 'Customer City Hub',
                scans: [
                    {
                        date: dateStr(24),
                        activity: 'Shipment Created and Manifested',
                        location: 'Urvaah Atelier'
                    },
                    {
                        date: dateStr(18),
                        activity: 'Package Picked up by Courier Partner',
                        location: 'Mumbai Sorting Hub'
                    },
                    {
                        date: dateStr(6),
                        activity: 'In Transit - Dispatched to Destination Hub',
                        location: 'BOM Airport'
                    },
                    {
                        date: dateStr(1),
                        activity: 'Arrived at Regional Distribution Center',
                        location: 'Destination Hub'
                    }
                ]
            }
        };
    }

    try {
        const response = await apiClient('GET', `/courier/track/awb/${cleanAwb}`);
        return {
            success: true,
            ...response.data
        };
    } catch (err) {
        console.error('[Shiprocket Tracking Error]:', err.response?.data || err.message);
        throw new Error(`Failed to track AWB: ${err.response?.data?.message || err.message}`);
    }
};

// ============================================================================
// 6. SIMULATE / TRIGGER 'OUT FOR DELIVERY'
// ============================================================================
exports.triggerOutForDelivery = async (awbCode) => {
    console.log(`[SHIPROCKET LOGISTICS] Milestone Event: OUT_FOR_DELIVERY for AWB ${awbCode}`);
    return {
        success: true,
        event: 'OUT_FOR_DELIVERY',
        awb_code: awbCode,
        current_status: 'Out for Delivery',
        rider: {
            name: 'Sunil Verma',
            phone: '+91 98765 43210'
        },
        timestamp: new Date().toISOString(),
        message: 'Order is out for delivery. Rider will contact before arriving.'
    };
};

// ============================================================================
// 7. SIMULATE / TRIGGER 'DELIVERED'
// ============================================================================
exports.triggerDelivered = async (awbCode, recipientName = 'Customer') => {
    console.log(`[SHIPROCKET LOGISTICS] Milestone Event: DELIVERED for AWB ${awbCode}`);
    return {
        success: true,
        event: 'DELIVERED',
        awb_code: awbCode,
        current_status: 'Delivered',
        delivered_to: recipientName,
        delivered_timestamp: new Date().toISOString(),
        pod_signature_url: 'https://storage.urvaah.com/mock-signatures/pod_sample.png',
        message: 'Order successfully delivered to recipient.'
    };
};

// ============================================================================
// 8. GENERATE SHIPPING LABEL & MANIFEST
// ============================================================================
exports.generateLabel = async (shipmentIds) => {
    const ids = Array.isArray(shipmentIds) ? shipmentIds : [shipmentIds];

    if (isMockMode()) {
        console.log(`[SHIPROCKET MOCK] Generating Shipping Label for: ${ids.join(', ')}`);
        return {
            success: true,
            is_label_created: 1,
            label_url: `https://storage.urvaah.com/mock-labels/label_${ids[0]}.pdf`
        };
    }

    try {
        const response = await apiClient('POST', '/courier/generate/label', { shipment_id: ids });
        return {
            success: true,
            ...response.data
        };
    } catch (err) {
        console.error('[Shiprocket Generate Label Error]:', err.response?.data || err.message);
        throw new Error(`Failed to generate label: ${err.response?.data?.message || err.message}`);
    }
};

exports.generateManifest = async (shipmentIds) => {
    const ids = Array.isArray(shipmentIds) ? shipmentIds : [shipmentIds];

    if (isMockMode()) {
        console.log(`[SHIPROCKET MOCK] Generating Courier Manifest for: ${ids.join(', ')}`);
        return {
            success: true,
            manifest_url: `https://storage.urvaah.com/mock-manifests/manifest_${Date.now()}.pdf`
        };
    }

    try {
        const response = await apiClient('POST', '/manifests/generate', { shipment_id: ids });
        return {
            success: true,
            ...response.data
        };
    } catch (err) {
        console.error('[Shiprocket Generate Manifest Error]:', err.response?.data || err.message);
        throw new Error(`Failed to generate manifest: ${err.response?.data?.message || err.message}`);
    }
};

// ============================================================================
// 9. CANCEL SHIPMENT
// ============================================================================
exports.cancelShipment = async (orderIds) => {
    const ids = Array.isArray(orderIds) ? orderIds : [orderIds];

    if (isMockMode()) {
        console.log(`[SHIPROCKET MOCK] Cancelling Shipments for Orders: ${ids.join(', ')}`);
        return {
            success: true,
            status_code: 200,
            message: 'Order cancelled successfully in Shiprocket. Shipment voided.',
            cancelled_orders: ids
        };
    }

    try {
        const response = await apiClient('POST', '/orders/cancel', { ids });
        return {
            success: true,
            ...response.data
        };
    } catch (err) {
        console.error('[Shiprocket Cancel Shipment Error]:', err.response?.data || err.message);
        throw new Error(`Failed to cancel shipment: ${err.response?.data?.message || err.message}`);
    }
};

// ============================================================================
// 10. CUSTOMER NOTIFICATIONS
// ============================================================================
exports.notifyCustomer = async (order, status, trackingInfo = {}) => {
    console.log(`[SHIPROCKET NOTIFICATION] Dispatching alert to customer for Order ${order.order_number || order.id} (Status: ${status})`);
    
    // Optional integration with whatsappService & orderEmailService
    try {
        const whatsappService = require('./whatsappService');
        if (whatsappService && typeof whatsappService.sendOrderUpdateNotification === 'function') {
            await whatsappService.sendOrderUpdateNotification(order, status).catch(e => console.warn('WhatsApp alert skipped:', e.message));
        }
    } catch (_) {}

    return {
        success: true,
        status,
        notified_at: new Date().toISOString(),
        channels: ['whatsapp', 'email'],
        tracking_url: trackingInfo.awb_code ? `https://houseofurvaah.com/account?track=${trackingInfo.awb_code}` : null
    };
};

// ============================================================================
// 11. CREATE REVERSE PICKUP (Return / Exchange Approval)
// ============================================================================
exports.createReversePickup = async (order, itemsToReturn, reason = 'Customer Return') => {
    const payload = {
        order_id: String(order.order_number || order.id),
        order_date: order.created_at || order.createdate || new Date().toISOString().substring(0, 10),
        pickup_customer_name: `${order.shippingAddress?.firstName || order.recipient_name?.split(' ')[0] || 'Customer'} ${order.shippingAddress?.lastName || ''}`.trim(),
        pickup_last_name: order.shippingAddress?.lastName || '',
        pickup_address: order.shippingAddress?.address || order.shipping_address_line || 'Customer Address',
        pickup_city: order.shippingAddress?.city || order.city || 'City',
        pickup_state: order.shippingAddress?.state || order.state || 'State',
        pickup_country: order.shippingAddress?.country || 'India',
        pickup_pincode: String(order.shippingAddress?.pincode || order.pincode || '400001'),
        pickup_email: order.shippingAddress?.email || order.customer_email || 'customer@example.com',
        pickup_phone: String(order.shippingAddress?.phone || order.recipient_phone || '9999999999'),
        order_items: (itemsToReturn || []).map(item => ({
            name: item.name || item.title || 'Returned Item',
            sku: String(item.product_id || item.sku || 'REV-SKU-01'),
            units: parseInt(item.quantity || 1, 10),
            selling_price: parseFloat(item.price || item.unit_price || 0),
            qc_enable: true
        })),
        payment_method: 'Prepaid',
        total_discount: 0,
        sub_total: (itemsToReturn || []).reduce((sum, i) => sum + (parseFloat(i.price || 0) * parseInt(i.quantity || 1, 10)), 0),
        length: 10,
        breadth: 10,
        height: 10,
        weight: 0.5,
        reason
    };

    if (isMockMode()) {
        const mockRevShipmentId = `SR-MOCK-REV-${Date.now().toString().slice(-6)}`;
        const mockAwb = `REV${Math.floor(100000000 + Math.random() * 900000000)}`;
        console.log(`[SHIPROCKET MOCK] Created Reverse Pickup for Order ${order.order_number || order.id}. AWB=${mockAwb}`);
        return {
            success: true,
            shipment_id: mockRevShipmentId,
            awb_code: mockAwb,
            status: 'RETURN_INITIATED',
            message: 'Reverse pickup order registered in Shiprocket (MOCK)'
        };
    }

    try {
        const response = await apiClient('POST', '/orders/create/return', payload);
        return {
            success: true,
            ...response.data
        };
    } catch (err) {
        console.error('[Shiprocket Create Return Error]:', err.response?.data || err.message);
        throw new Error(`Failed to create return pickup: ${err.response?.data?.message || err.message}`);
    }
};

// ============================================================================
// 12. GENERATE RETURN AWB
// ============================================================================
exports.assignReturnAwb = async (shipmentId) => {
    if (isMockMode()) {
        const mockAwb = `REV${Math.floor(100000000 + Math.random() * 900000000)}IN`;
        console.log(`[SHIPROCKET MOCK] Assigned Reverse AWB: ${mockAwb} to shipment ${shipmentId}`);
        return {
            success: true,
            awb_assign_status: 1,
            response: {
                data: {
                    awb_code: mockAwb,
                    courier_name: 'Delhivery Reverse',
                    shipment_id: shipmentId
                }
            }
        };
    }

    try {
        const response = await apiClient('POST', '/courier/assign/awb', { shipment_id: shipmentId, is_return: 1 });
        return {
            success: true,
            ...response.data
        };
    } catch (err) {
        console.error('[Shiprocket Assign Return AWB Error]:', err.response?.data || err.message);
        throw new Error(`Failed to assign return AWB: ${err.response?.data?.message || err.message}`);
    }
};

// ============================================================================
// 13. SCHEDULE REVERSE PICKUP
// ============================================================================
exports.scheduleReversePickup = async (shipmentIds) => {
    const ids = Array.isArray(shipmentIds) ? shipmentIds : [shipmentIds];

    if (isMockMode()) {
        const pickupDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString().replace('T', ' ').substring(0, 16);
        console.log(`[SHIPROCKET MOCK] Scheduled Doorstep Reverse Pickup for: ${ids.join(', ')}`);
        return {
            success: true,
            pickup_status: 1,
            response: {
                pickup_token_number: `REV-PKP-${Math.floor(10000 + Math.random() * 90000)}`,
                pickup_scheduled_date: pickupDate,
                message: 'Reverse pickup scheduled from customer doorstep within 24-48 hours.'
            }
        };
    }

    try {
        const response = await apiClient('POST', '/courier/generate/pickup', { shipment_id: ids });
        return {
            success: true,
            ...response.data
        };
    } catch (err) {
        console.error('[Shiprocket Schedule Reverse Pickup Error]:', err.response?.data || err.message);
        throw new Error(`Failed to schedule reverse pickup: ${err.response?.data?.message || err.message}`);
    }
};

// ============================================================================
// 14. TRACK RETURN PARCEL
// ============================================================================
exports.trackReturnParcel = async (awbCode) => {
    const cleanAwb = String(awbCode || '').trim();

    if (isMockMode()) {
        console.log(`[SHIPROCKET MOCK] Tracking Return Parcel AWB: ${cleanAwb}`);
        return {
            success: true,
            tracking_data: {
                track_status: 1,
                shipment_status: 'RETURN_IN_TRANSIT',
                current_status: 'In Transit to Atelier',
                awb_code: cleanAwb,
                origin: 'Customer Doorstep',
                destination: 'House of Urvaah Atelier',
                scans: [
                    {
                        date: new Date(Date.now() - 24 * 3600000).toISOString().replace('T', ' ').substring(0, 19),
                        activity: 'Doorstep Quality Check Passed & Package Collected',
                        location: 'Customer Location'
                    },
                    {
                        date: new Date(Date.now() - 6 * 3600000).toISOString().replace('T', ' ').substring(0, 19),
                        activity: 'Arrived at Courier Return Hub',
                        location: 'Regional Hub'
                    }
                ]
            }
        };
    }

    try {
        const response = await apiClient('GET', `/courier/track/awb/${cleanAwb}`);
        return {
            success: true,
            ...response.data
        };
    } catch (err) {
        console.error('[Shiprocket Track Return Error]:', err.response?.data || err.message);
        throw new Error(`Failed to track return parcel: ${err.response?.data?.message || err.message}`);
    }
};

// ============================================================================
// 15. DISPATCH REPLACEMENT ITEM (Exchange Forward Leg)
// ============================================================================
exports.dispatchReplacement = async (originalOrder, replacementItems) => {
    const replacementOrderNumber = `${originalOrder.order_number || originalOrder.id}-REP`;
    
    const replacementOrderData = {
        ...originalOrder,
        order_number: replacementOrderNumber,
        items: replacementItems || originalOrder.items,
        payment_method: 'Prepaid',
        payment_type: 'Prepaid (Exchange)',
        subtotal: 0,
        total: 0
    };

    console.log(`[SHIPROCKET LOGISTICS] Creating Replacement Dispatch: ${replacementOrderNumber}`);
    
    // Step 1: Create Forward Shipment for replacement item
    const shipmentResult = await exports.createForwardShipment(replacementOrderData);
    
    // Step 2: Assign AWB
    let awbResult = null;
    if (shipmentResult.shipment_id) {
        awbResult = await exports.assignAwb(shipmentResult.shipment_id);
    }

    return {
        success: true,
        order_number: replacementOrderNumber,
        original_order_id: originalOrder.id || originalOrder.order_number,
        shipment_id: shipmentResult.shipment_id,
        awb_code: awbResult?.response?.data?.awb_code || null,
        courier_name: awbResult?.response?.data?.courier_name || 'Delhivery Express',
        status: 'Replacement Processing',
        message: 'Replacement shipment registered and AWB generated.'
    };
};

// ============================================================================
// 16. WEBHOOK EVENT HANDLER (Shiprocket -> Urvaah API Status Syncer)
// ============================================================================
exports.handleWebhookEvent = async (payload) => {
    const awb = payload.awb || payload.awb_code;
    const currentStatus = payload.current_status || payload.status;

    console.log(`[SHIPROCKET WEBHOOK] Received event for AWB ${awb}: Status = ${currentStatus}`);

    // Map Shiprocket status string to House of Urvaah order status
    let mappedStatus = null;
    const s = String(currentStatus || '').toUpperCase();

    if (s.includes('PICKED UP') || s.includes('PICKUP COMPLETED')) {
        mappedStatus = 'Dispatched';
    } else if (s.includes('IN TRANSIT') || s.includes('REACHED AT HUB')) {
        mappedStatus = 'Shipped';
    } else if (s.includes('OUT FOR DELIVERY')) {
        mappedStatus = 'Out for Delivery';
    } else if (s.includes('DELIVERED')) {
        mappedStatus = 'Delivered';
    } else if (s.includes('RTO DELIVERED') || s.includes('RETURN DELIVERED')) {
        mappedStatus = 'Received at Homved';
    } else if (s.includes('CANCELLED')) {
        mappedStatus = 'Cancelled';
    }

    return {
        received: true,
        awb,
        shiprocket_status: currentStatus,
        mapped_urvaah_status: mappedStatus,
        timestamp: new Date().toISOString()
    };
};
