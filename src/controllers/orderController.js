const orderService = require('../services/orderService');
const invoiceService = require('../services/invoiceService');
const { validateBankDetails } = require('../utils/bankValidator');
const pool = require('../config/db');

exports.createOrder = async (req, res) => {
    try {
        const userId = req.user.id;
        const orderData = { ...req.body, userId };
        const order = await orderService.createOrder(orderData);
        res.status(201).json({ success: true, data: order });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAllOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const status = req.query.status;
        const paymentStatus = req.query.paymentStatus;
        const paymentType = req.query.paymentType;
        const type = req.query.type;
        const userName = req.query.userName;
        const orderNumber = req.query.orderNumber;

        const result = await orderService.getAllOrders({ limit, offset, status, paymentStatus, paymentType, type, userName, orderNumber });
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.status(200).json({
            success: true,
            data: result.orders,
            pagination: {
                totalOrders: result.totalCount,
                currentPage: page,
                totalPages: Math.ceil(result.totalCount / limit),
                limit: limit
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getCancelledOrders = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const page = parseInt(req.query.page) || (req.query.offset !== undefined ? Math.floor(parseInt(req.query.offset) / limit) + 1 : 1);
        const offset = req.query.offset !== undefined ? parseInt(req.query.offset) : (page - 1) * limit;
        const refundStatusFilter = req.query.refundStatusFilter || 'active';
        const searchTerm = req.query.searchTerm;

        const result = await orderService.getCancelledOrders({ limit, offset, refundStatusFilter, searchTerm });
        console.log(`[GET CANCELLED] Sending response with ${result.orders.length} orders (refundFilter: ${refundStatusFilter})`);
        res.status(200).json({
            success: true,
            data: result.orders,
            orders: result.orders,
            totalCount: result.totalCount,
            pagination: {
                totalOrders: result.totalCount,
                currentPage: page,
                totalPages: Math.ceil(result.totalCount / limit),
                limit: limit
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getCancelledOrdersStats = async (req, res) => {
    try {
        const stats = await orderService.getCancelledOrdersStats();
        res.status(200).json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getOrderStats = async (req, res) => {
    try {
        const stats = await orderService.getOrderStats();
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.status(200).json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getOrdersByUser = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.username || req.user?.emailid || req.user?.email;
        if (!userId) {
            return res.status(200).json({ success: true, data: [] });
        }
        const orders = await orderService.getOrdersByUser(userId);
        res.status(200).json({ success: true, data: orders });
    } catch (error) {
        console.error('[getOrdersByUser Error]:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await orderService.getOrderById(id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        // Security check: only allow own user or admin
        const isAdmin = req.user?.role === 'admin';
        const reqUserId = String(req.user?.id || '').trim().toLowerCase();
        const reqUserEmail = String(req.user?.emailid || req.user?.email || '').trim().toLowerCase();
        const orderUserId = String(order.user_id || '').trim().toLowerCase();
        const orderCustEmail = String(order.customer_email || '').trim().toLowerCase();

        const isOwner =
            (reqUserId && (orderUserId === reqUserId || orderCustEmail === reqUserId)) ||
            (reqUserEmail && (orderUserId === reqUserEmail || orderCustEmail === reqUserEmail)) ||
            order.user_id == req.user?.id ||
            order.user_id == req.user?.username;

        if (!isOwner && !isAdmin) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        res.status(200).json({ success: true, data: order });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, cancelReason, bankDetails, paymentStatus, itemIds, return_qc_status, return_rejection_reason, is_product_received } = req.body;

        let sanitizedBankDetails = bankDetails;
        if (bankDetails) {
            const bankCheck = validateBankDetails(bankDetails);
            if (!bankCheck.isValid) {
                return res.status(400).json({ success: false, message: bankCheck.error });
            }
            sanitizedBankDetails = bankCheck.sanitized;
        }

        const order = await orderService.getOrderById(id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        // Security check: ONLY admins can approve returns, approve replacements, or advance post-delivery lifecycles!
        const isAdmin = req.user?.role === 'admin';
        const isOwner = order.user_id == req.user?.id || order.user_id == req.user?.username || order.user_id == req.user?.emailid || order.customer_email == req.user?.emailid;

        const targetStatusLower = String(status || '').trim().toLowerCase();
        const adminOnlyStatuses = [
            'return approved',
            'replace approved',
            'return & replacement approved',
            'in transit to house of urvaah',
            'return collected',
            'received at house of urvaah',
            'received at homved',
            'return qc rejected',
            'return rejected',
            'replace rejected',
            'returned',
            'replaced',
            'returned & replaced',
            'shipped',
            'dispatched',
            'out for delivery',
            'delivered',
            'refunded',
            'restored',
            'cancellation rejected'
        ];

        let targetStatus = status;

        // Post-Delivery Cancellation Guard: Neither admin nor customer can cancel after delivery
        const currentStatusLower = (order.status || '').toLowerCase().trim();
        const origStatusLower = (order.original_status || '').toLowerCase().trim();
        const isPostDeliveryOrder = (
            currentStatusLower === 'delivered' ||
            currentStatusLower === 'replacement delivered' ||
            origStatusLower === 'delivered' ||
            origStatusLower === 'replacement delivered' ||
            Boolean(order.delivered_at) ||
            Boolean(order.is_product_received) ||
            currentStatusLower.includes('return') ||
            currentStatusLower.includes('replace') ||
            currentStatusLower.includes('exchange')
        );

        const isCancelAction = (
            targetStatusLower === 'cancelled' ||
            targetStatusLower === 'cancellation requested' ||
            targetStatusLower === 'cancel_requested' ||
            targetStatusLower === 'cancellation rejected'
        );

        if (isPostDeliveryOrder && isCancelAction) {
            return res.status(400).json({
                success: false,
                message: 'Delivered orders cannot be cancelled. Once delivered, only return or replacement can be processed.'
            });
        }

        // Replacement Cancellation Guard:
        // When a user requests to replace a product, admin can ONLY cancel / reject the request UNTIL it is shipped.
        // Once the replacement is shipped, it CANNOT be cancelled or rejected by anyone.
        const isReplacementFlow = (
            (order.return_type || '').toLowerCase().includes('replace') ||
            (order.return_type || '').toLowerCase().includes('exchange') ||
            Boolean(order.replacement_size) ||
            Boolean(order.replacement_order_number) ||
            Boolean(order.original_order_number) ||
            (order.order_number || '').includes('-REP') ||
            currentStatusLower.includes('replace') ||
            currentStatusLower.includes('exchange')
        );

        let isReplacementShipped = (
            currentStatusLower === 'replacement shipped' ||
            currentStatusLower === 'replacement out for delivery' ||
            currentStatusLower === 'replacement delivered' ||
            (currentStatusLower === 'replaced' && Boolean(order.tracking_number || order.replacement_order_number))
        );

        if (!isReplacementShipped && order.replacement_order_number) {
            try {
                const repCheck = await pool.query(
                    `SELECT status, tracking_number FROM orders WHERE order_number = $1 OR id::text = $2 LIMIT 1`,
                    [order.replacement_order_number, order.replacement_order_id ? String(order.replacement_order_id) : '']
                );
                if (repCheck.rows.length > 0) {
                    const repStatus = (repCheck.rows[0].status || '').toLowerCase();
                    const hasRepAwb = Boolean(repCheck.rows[0].tracking_number);
                    if (['shipped', 'in transit', 'out for delivery', 'delivered', 'replacement shipped'].includes(repStatus) || hasRepAwb) {
                        isReplacementShipped = true;
                    }
                }
            } catch (err) {
                console.warn('[OrderController] Error checking replacement order shipment status:', err.message);
            }
        }

        const isRejectOrCancelAction = (
            targetStatusLower === 'replace rejected' ||
            targetStatusLower === 'return rejected' ||
            targetStatusLower === 'return & replacement rejected' ||
            targetStatusLower === 'cancelled' ||
            targetStatusLower === 'cancellation requested'
        );

        if (isReplacementFlow && isReplacementShipped && isRejectOrCancelAction) {
            return res.status(400).json({
                success: false,
                message: 'Replacement piece has already been shipped. The replacement request cannot be cancelled or rejected after dispatch.'
            });
        }

        if (!isAdmin) {
            if (adminOnlyStatuses.includes(targetStatusLower)) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied: Only administrators have permission to approve return requests or advance logistics statuses.'
                });
            }
            if (!isOwner) {
                return res.status(403).json({ success: false, message: 'Not authorized' });
            }
            const currentStatusLower = (order.status || '').toLowerCase();
            if (currentStatusLower === 'cancelled') {
                return res.status(400).json({ success: false, message: 'This order is already cancelled.' });
            }
            if (currentStatusLower === 'return requested' || currentStatusLower === 'return request processing') {
                return res.status(400).json({ success: false, message: 'A return request for this order is already pending admin approval.' });
            }
            if (currentStatusLower === 'replacement request processing' || currentStatusLower === 'replace requested' || currentStatusLower === 'replacement requested') {
                return res.status(400).json({ success: false, message: 'A replacement request for this order is already pending admin approval.' });
            }
            if (currentStatusLower === 'replace approved' || currentStatusLower === 'replacement processing' || currentStatusLower === 'replacement shipped') {
                return res.status(400).json({ success: false, message: 'A replacement for this order is already approved and in progress.' });
            }
            if (currentStatusLower === 'return approved') {
                return res.status(400).json({ success: false, message: 'Return is already approved and in transit to House of Urvaah.' });
            }
            if (currentStatusLower === 'received at house of urvaah' || currentStatusLower === 'returned' || currentStatusLower === 'replaced') {
                return res.status(400).json({ success: false, message: 'This order cycle has already been completed.' });
            }
            if (currentStatusLower === 'shipped' || currentStatusLower === 'dispatched' || currentStatusLower === 'out for delivery') {
                return res.status(400).json({
                    success: false,
                    message: `This order has already been ${order.status.toLowerCase()} and cannot be cancelled. Once delivered, you can initiate a return or replacement.`
                });
            }
            if (currentStatusLower === 'delivered') {
                // Post-delivery: check if replacement or return
                const isReplacement = (status || '').toLowerCase().includes('replace') || req.body.type === 'Replacement';
                targetStatus = isReplacement ? 'Replacement Request Processing' : 'Return Requested';
            } else if (currentStatusLower === 'cancellation requested' || currentStatusLower === 'cancel_requested') {
                return res.status(400).json({ success: false, message: 'A cancellation request for this order is already pending admin approval.' });
            } else {
                // User cancellations before delivery and before shipping must go for admin approval
                targetStatus = 'Cancellation Requested';
            }
        }

        // If order is COD and status is Delivered, payment is collected upon delivery and must be Paid
        const isCod = (order.payment_method || '').toLowerCase() === 'cod' ||
                      (order.payment_type || '').toLowerCase() === 'cod' ||
                      (order.payment_method || '').toLowerCase().includes('cash');

        let targetPaymentStatus = paymentStatus;
        const currentPaymentStatus = (order.payment_status || '').trim();
        const isAlreadyPaid = currentPaymentStatus.toLowerCase() === 'paid';
        const isDeliveredEver = (order.status || '').toLowerCase() === 'delivered' ||
                                targetStatus === 'Delivered' ||
                                Boolean(order.delivered_at) ||
                                (order.original_status || '').toLowerCase() === 'delivered';

        if (isAlreadyPaid || (isDeliveredEver && isCod)) {
            targetPaymentStatus = 'Paid';
        }
        if (!isCod) {
            const hasOnlineProof = Boolean(order.razorpay_payment_id) || 
                                   (order.payment_status || '').toLowerCase() === 'paid' || 
                                   (order.payment_type || '').toLowerCase() === 'upi' || 
                                   (order.payment_method || '').toLowerCase() === 'upi' ||
                                   (order.original_status || '').toLowerCase() === 'confirmed' ||
                                   (order.status || '').toLowerCase() === 'confirmed';
            if (hasOnlineProof && (!targetPaymentStatus || targetPaymentStatus.toLowerCase() === 'pending')) {
                targetPaymentStatus = 'Paid';
            }
        }

        const isCancelActionNow = (
            targetStatus === 'Cancellation Requested' ||
            targetStatus === 'Cancelled' ||
            status === 'Cancellation Requested' ||
            status === 'Cancelled'
        );

        if (isCancelActionNow && !isCod) {
            // Prepaid order cancellation requires bank details for refund
            if (!sanitizedBankDetails && order.user_id) {
                try {
                    const userBankRes = await pool.query(
                        `SELECT refund_bank_account, refund_ifsc_code, refund_holder_name FROM users WHERE emailid = $1 OR username = $1 LIMIT 1`,
                        [order.user_id]
                    );
                    if (userBankRes.rows.length > 0 && userBankRes.rows[0].refund_bank_account) {
                        const uBank = userBankRes.rows[0];
                        const bankCheck = validateBankDetails({
                            accountNumber: uBank.refund_bank_account,
                            ifscCode: uBank.refund_ifsc_code,
                            holderName: uBank.refund_holder_name
                        });
                        if (bankCheck.isValid) {
                            sanitizedBankDetails = bankCheck.sanitized;
                        }
                    }
                } catch (uErr) {
                    console.warn('[OrderController] User bank profile lookup warning:', uErr.message);
                }
            }

            if (!isAdmin && !sanitizedBankDetails && !order.refund_bank_account) {
                return res.status(400).json({
                    success: false,
                    message: 'Bank account details (Account Holder Name, IFSC Code, Account Number) are required to process a refund for prepaid order cancellations.'
                });
            }
        }

        // Pass order.id (validated UUID) and extraData to ensure clean DB queries
        const extraData = { return_qc_status, return_rejection_reason, is_product_received };
        const updatedOrder = await orderService.updateOrderStatus(order.id, targetStatus, cancelReason, sanitizedBankDetails, targetPaymentStatus, itemIds, extraData);

        // Synchronize with Shiprocket logistics only if order is cancelled before delivery
        const isReturnOrReplacement = String(targetStatus || status || '').toLowerCase().includes('return') || String(targetStatus || status || '').toLowerCase().includes('replace');
        if (!isReturnOrReplacement && (targetStatus === 'Cancelled' || targetStatus === 'Cancellation Requested' || status === 'Cancelled' || status === 'Cancellation Requested')) {
            try {
                const shiprocketService = require('../services/shiprocketService');
                const orderIdentifier = order.order_number || order.id || id;
                await shiprocketService.cancelShipment([orderIdentifier]);
                console.log(`[Shiprocket Sync] Shipment/Pickup voided successfully for order ${orderIdentifier}`);
            } catch (srErr) {
                console.warn('[Shiprocket Sync Warning]:', srErr.message);
            }
        }
        res.status(200).json({ success: true, data: updatedOrder });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.downloadInvoice = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await orderService.getOrderById(id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        // Security check: only allow own user or admin
        const isAdmin = req.user?.role === 'admin';
        const reqUserId = String(req.user?.id || '').trim().toLowerCase();
        const reqUserEmail = String(req.user?.emailid || req.user?.email || '').trim().toLowerCase();
        const orderUserId = String(order.user_id || '').trim().toLowerCase();
        const orderCustEmail = String(order.customer_email || '').trim().toLowerCase();

        const isOwner =
            (reqUserId && (orderUserId === reqUserId || orderCustEmail === reqUserId)) ||
            (reqUserEmail && (orderUserId === reqUserEmail || orderCustEmail === reqUserEmail)) ||
            order.user_id == req.user?.id ||
            order.user_id == req.user?.username;

        if (!isOwner && !isAdmin) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        // Business Rule: End users / customers should only get the invoice once the order or replacement is delivered
        if (!isAdmin) {
            const statusLower = String(order.status || '').toLowerCase();
            const originalStatusLower = String(order.original_status || '').toLowerCase();
            const isDelivered = statusLower.includes('delivered') ||
                                originalStatusLower.includes('delivered') ||
                                Boolean(order.delivered_at);

            if (!isDelivered) {
                return res.status(403).json({
                    success: false,
                    message: 'Official tax invoice is only accessible once your order or replacement piece has been delivered.'
                });
            }
        }

        const format = (req.query.format || '').toLowerCase();

        // 1. Return structured JSON data for frontend live invoice rendering
        if (format === 'json') {
            const data = await invoiceService.getInvoiceData(id);
            return res.status(200).json({ success: true, data });
        }

        // 2. Return standalone HTML invoice for print / in-browser viewing
        if (format === 'html' || req.headers.accept?.includes('text/html')) {
            const html = await invoiceService.generateInvoiceHTML(id);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(html);
        }

        // 3. Return binary PDF attachment
        try {
            const pdfBuffer = await invoiceService.generateInvoicePDF(id);

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="HOUSE_OF_URVAAH_INVOICE_${order.invoice_number || order.order_number}.pdf"`);
            res.setHeader('Content-Length', pdfBuffer.length);

            return res.end(pdfBuffer);
        } catch (pdfErr) {
            console.warn('[Invoice] PDF Generation error, serving printable HTML fallback:', pdfErr.message);
            const html = await invoiceService.generateInvoiceHTML(id);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(html);
        }
    } catch (error) {
        console.error('Invoice Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
};

exports.reorderOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { orderId } = req.body;
        const targetId = id || orderId;
        const userId = req.user.id;

        if (!targetId) {
            return res.status(400).json({ success: false, message: 'Order ID is required' });
        }

        // Security check: only allow own user or admin
        const order = await orderService.getOrderById(targetId);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        const isAdmin = req.user?.role === 'admin';
        const reqUserId = String(req.user?.id || '').trim().toLowerCase();
        const reqUserEmail = String(req.user?.emailid || req.user?.email || '').trim().toLowerCase();
        const orderUserId = String(order.user_id || '').trim().toLowerCase();
        const orderCustEmail = String(order.customer_email || '').trim().toLowerCase();

        const isOwner =
            (reqUserId && (orderUserId === reqUserId || orderCustEmail === reqUserId)) ||
            (reqUserEmail && (orderUserId === reqUserEmail || orderCustEmail === reqUserEmail)) ||
            order.user_id == req.user?.id ||
            order.user_id == req.user?.username;

        if (!isOwner && !isAdmin) {
            return res.status(403).json({ success: false, message: 'Not authorized to reorder this order' });
        }

        const result = await orderService.reorderOrder(targetId, userId);
        res.status(200).json(result);
    } catch (error) {
        console.error('Reorder Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateRefundStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const refundData = req.body;

        if (refundData?.bankDetails) {
            const bankCheck = validateBankDetails(refundData.bankDetails);
            if (!bankCheck.isValid) {
                return res.status(400).json({ success: false, message: bankCheck.error });
            }
            refundData.bankDetails = bankCheck.sanitized;
        }

        const updatedOrder = await orderService.updateRefundStatus(id, refundData);
        res.status(200).json({ success: true, data: updatedOrder });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.restockOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await orderService.restockOrder(id);
        res.status(200).json({ success: true, data: order, message: "Inventory successfully restocked" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.requestReturnReplace = async (req, res) => {
    try {
        const { id } = req.params;
        const { type, items, bankDetails } = req.body;

        const hasReturn = type === 'Return' || (items && items.some(it => it.action === 'Return' || it.type === 'Return'));
        if (hasReturn || bankDetails) {
            const bankCheck = validateBankDetails(bankDetails, { required: Boolean(hasReturn && type !== 'Replacement' && type !== 'Exchange') });
            if (!bankCheck.isValid) {
                return res.status(400).json({ success: false, message: bankCheck.error });
            }
            if (bankCheck.sanitized) {
                req.body.bankDetails = bankCheck.sanitized;
            }
        }

        const result = await orderService.requestReturnReplace(id, req.user, req.body);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.requestItemCancellation = async (req, res) => {
    try {
        const { id } = req.params;
        const isAdmin = req.user?.role === 'admin';
        console.log(`[OrderController] requestItemCancellation: ID=${id}, User=${req.user?.id || req.user?.emailid}, isAdmin=${isAdmin}`);

        if (req.body.bankDetails) {
            const bankCheck = validateBankDetails(req.body.bankDetails);
            if (!bankCheck.isValid) {
                return res.status(400).json({ success: false, message: bankCheck.error });
            }
            if (bankCheck.sanitized) {
                req.body.bankDetails = bankCheck.sanitized;
            }
        }

        const result = await orderService.requestItemCancellation(id, req.user, req.body, isAdmin);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error('[OrderController] requestItemCancellation error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateOrderItemStatus = async (req, res) => {
    try {
        const { id, itemId } = req.params;
        const { status } = req.body;

        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Only admins can update order items individually' });
        }

        const updatedItem = await orderService.updateOrderItemStatus(id, itemId, status);
        res.status(200).json({ success: true, data: updatedItem });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getRefundPaymentDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const details = await orderService.getRefundPaymentDetails(id);
        if (!details) {
            return res.status(404).json({ success: false, message: 'Order / payment record not found' });
        }
        res.status(200).json({ success: true, data: details });
    } catch (error) {
        console.error('[getRefundPaymentDetails] Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateOrderShippingAddress = async (req, res) => {
    try {
        const { id } = req.params;
        const addressData = req.body;

        const isAdmin = req.user?.role === 'admin';
        const userId = req.user?.username || req.user?.id || req.user?.emailid;

        const updatedOrder = await orderService.updateOrderShippingAddress(id, userId, addressData, isAdmin);
        res.status(200).json({
            success: true,
            message: 'Shipping address updated successfully',
            data: updatedOrder
        });
    } catch (error) {
        console.error('[updateOrderShippingAddress] Error:', error);
        res.status(error.status || 400).json({
            success: false,
            message: error.message || 'Failed to update shipping address'
        });
    }
};

exports.updateOrderBankDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const bankData = req.body;
        const isAdmin = req.user?.role === 'admin';
        const userOrId = req.user;

        const updatedOrder = await orderService.updateOrderBankDetails(id, userOrId, bankData, isAdmin);
        res.status(200).json({
            success: true,
            message: 'Bank details updated successfully',
            data: updatedOrder
        });
    } catch (error) {
        console.error('[updateOrderBankDetails] Error:', error);
        res.status(error.status || 400).json({
            success: false,
            message: error.message || 'Failed to update bank details'
        });
    }
};
