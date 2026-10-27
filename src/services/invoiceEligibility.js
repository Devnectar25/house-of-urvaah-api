/**
 * Customer-facing invoice eligibility (item level).
 *
 * A product's invoice is visible to the customer only once that product has been delivered
 * (verified) and is not cancelled or in / through a return. Replacement pieces are separate
 * "-REP" orders, so they follow the same rule on their own order. Admin access and the
 * statutory invoice record are NOT affected: this only governs what a customer can see.
 */

// Item statuses that hide an item from the customer invoice
const HIDDEN_ITEM_STATUSES = [
    'cancelled', 'cancellation requested', 'cancel_requested', 'cancel_approved',
    'return requested', 'return request processing', 'return approved', 'return processing',
    'return collected', 'in transit to house of urvaah', 'received at house of urvaah',
    'received at homved', 'returned', 'refunded', 'restocked'
];

// Order statuses meaning the forward parcel has not (verifiably) reached the customer
const UNDELIVERED_ORDER_STATUSES = [
    'pending', 'placed', 'confirmed', 'processing', 'dispatched', 'shipped', 'in transit',
    'out for delivery', 'cancelled', 'canceled', 'cancellation requested', 'cancel_requested',
    'replacement processing', 'replacement shipped', 'replacement out for delivery'
];

const lower = (v) => String(v || '').trim().toLowerCase();

const isOrderDeliveryVerified = (order) => {
    const st = lower(order.status);
    if (UNDELIVERED_ORDER_STATUSES.includes(st)) return false;
    // An order whose return or replacement was rejected was delivered to the customer
    if (st === 'return qc rejected' || st === 'return rejected' || st === 'replace rejected' || st === 'replacement rejected') return true;
    if (lower(order.return_qc_status) === 'rejected') return true;
    return Boolean(order.delivered_at) || st === 'delivered' || lower(order.original_status) === 'delivered';
};

const isPaymentAcceptable = (order) => {
    const pay = lower(order.payment_status);
    const isCod = /cod|cash/.test(lower(order.payment_method)) || lower(order.payment_type) === 'cod';
    if (pay === 'failed') return false;
    // COD is settled on delivery; prepaid must not be pending/failed
    return isCod || (pay !== 'pending' && pay !== '');
};

const isItemInvoiceEligible = (item, order = null) => {
    const st = lower(item?.status);
    const orderSt = lower(order?.status);
    const isOrderQCRejected = orderSt === 'return qc rejected' || orderSt === 'return rejected' || lower(order?.return_qc_status) === 'rejected';

    // An item whose return was QC rejected or return rejected is retained by customer / not refunded,
    // so it remains invoiceable.
    if (st === 'return qc rejected' || st === 'return rejected' || st === 'replace rejected' || st === 'replacement rejected') {
        return true;
    }
    if (isOrderQCRejected && (st === 'delivered' || !HIDDEN_ITEM_STATUSES.includes(st))) {
        return true;
    }
    if (HIDDEN_ITEM_STATUSES.includes(st)) return false;
    if (!isOrderQCRejected && lower(item?.return_action) === 'return') return false;
    return true;
};

/**
 * @returns {{ eligible: boolean, eligibleItems: object[], reason: string }}
 */
const getInvoiceEligibility = (order) => {
    if (!order) return { eligible: false, eligibleItems: [], reason: 'Order not found' };
    if (!isPaymentAcceptable(order)) {
        return { eligible: false, eligibleItems: [], reason: 'Invoice is available once payment is confirmed.' };
    }
    if (!isOrderDeliveryVerified(order)) {
        return { eligible: false, eligibleItems: [], reason: 'Invoice is available once your order has been delivered.' };
    }
    const items = Array.isArray(order.items) ? order.items : [];
    const eligibleItems = items.filter(it => isItemInvoiceEligible(it, order));
    if (eligibleItems.length === 0) {
        return { eligible: false, eligibleItems: [], reason: 'No delivered items on this order are eligible for an invoice.' };
    }
    return { eligible: true, eligibleItems, reason: '' };
};

module.exports = { getInvoiceEligibility, isItemInvoiceEligible, isOrderDeliveryVerified };
