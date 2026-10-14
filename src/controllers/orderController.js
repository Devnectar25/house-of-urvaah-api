const orderService = require('../services/orderService');
const invoiceService = require('../services/invoiceService');

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
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const refundStatusFilter = req.query.refundStatusFilter || 'active';
        const searchTerm = req.query.searchTerm;

        const result = await orderService.getCancelledOrders({ limit, offset, refundStatusFilter, searchTerm });
        console.log(`[GET CANCELLED] Sending response with ${result.orders.length} orders (refundFilter: ${refundStatusFilter})`);
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
        const { status, cancelReason, bankDetails, paymentStatus, itemIds } = req.body;

        const order = await orderService.getOrderById(id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        // Security check
        const isAdmin = req.user?.role === 'admin';
        const isOwner = order.user_id == req.user?.id || order.user_id == req.user?.username || order.user_id == req.user?.emailid || order.customer_email == req.user?.emailid;

        let targetStatus = status;
        if (!isAdmin) {
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
            if (currentStatusLower === 'delivered') {
                // Post-delivery: check if replacement or cancel
                const isReplacement = (status || '').toLowerCase().includes('replace') || req.body.type === 'Replacement';
                targetStatus = isReplacement ? 'Replacement Request Processing' : 'Cancellation Requested';
            } else if (currentStatusLower === 'cancellation requested' || currentStatusLower === 'cancel_requested') {
                return res.status(400).json({ success: false, message: 'A cancellation request for this order is already pending admin approval.' });
            } else {
                // User cancellations before delivery must go for admin approval
                targetStatus = 'Cancellation Requested';
            }
        }

        // If order is COD and status is Delivered, payment is collected upon delivery and must be Paid
        const isCod = (order.payment_method || '').toLowerCase() === 'cod' || 
                      (order.payment_type || '').toLowerCase() === 'cod' ||
                      (order.payment_method || '').toLowerCase().includes('cash');

        let targetPaymentStatus = paymentStatus;
        if ((targetStatus === 'Delivered' || (order.status || '').toLowerCase() === 'delivered') && isCod) {
            targetPaymentStatus = 'Paid';
        }

        // Pass order.id (validated UUID) to ensure clean DB queries
        const updatedOrder = await orderService.updateOrderStatus(order.id, targetStatus, cancelReason, bankDetails, targetPaymentStatus, itemIds);
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
            res.setHeader('Content-Disposition', `attachment; filename="HOUSE_OF_URVAAH_INV_${order.order_number}.pdf"`);
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
        const userId = req.user.id;
        const result = await orderService.requestReturnReplace(id, userId, req.body);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.requestItemCancellation = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const isAdmin = req.user.role === 'admin';
        console.log(`[OrderController] requestItemCancellation: ID=${id}, User=${userId}, isAdmin=${isAdmin}`);
        const result = await orderService.requestItemCancellation(id, userId, req.body, isAdmin);
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


