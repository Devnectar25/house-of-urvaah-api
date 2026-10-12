const stockNotificationService = require('../services/stockNotificationService');

// Simple in-memory rate limiter for subscriptions by IP (max 10 per 10 minutes)
const ipRateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 10;

function checkIpRateLimit(ip) {
    const now = Date.now();
    const record = ipRateLimitMap.get(ip) || { count: 0, firstRequest: now };

    if (now - record.firstRequest > RATE_LIMIT_WINDOW_MS) {
        record.count = 1;
        record.firstRequest = now;
        ipRateLimitMap.set(ip, record);
        return true;
    }

    if (record.count >= RATE_LIMIT_MAX) {
        return false;
    }

    record.count++;
    ipRateLimitMap.set(ip, record);
    return true;
}

// Clean up stale rate limit entries every 15 minutes
setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of ipRateLimitMap.entries()) {
        if (now - record.firstRequest > RATE_LIMIT_WINDOW_MS) {
            ipRateLimitMap.delete(ip);
        }
    }
}, 15 * 60 * 1000);

/**
 * Customer: Subscribe to out-of-stock notification
 */
exports.subscribe = async (req, res) => {
    try {
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
        if (!checkIpRateLimit(clientIp)) {
            return res.status(429).json({
                success: false,
                message: 'Too many subscription requests. Please try again in a few minutes.'
            });
        }

        const { productId, size, color, email, phone, channel } = req.body;

        if (!productId) {
            return res.status(400).json({
                success: false,
                message: 'Product ID is required.'
            });
        }

        const customerId = req.user?.id || null;

        const result = await stockNotificationService.subscribe({
            productId,
            size,
            color,
            email,
            phone,
            channel,
            customerId
        });

        return res.status(result.alreadySubscribed ? 200 : 201).json(result);
    } catch (err) {
        console.error('[StockNotificationController.subscribe] Error:', err.message);
        return res.status(400).json({
            success: false,
            message: err.message || 'Unable to register stock alert. Please try again.'
        });
    }
};

/**
 * Customer: Unsubscribe using link token
 */
exports.unsubscribe = async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Unsubscribe token is missing.'
            });
        }

        const result = await stockNotificationService.unsubscribe(token);
        return res.status(200).json(result);
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message || 'Unable to cancel notification subscription.'
        });
    }
};

/**
 * Customer: Verify contact subscription
 */
exports.verify = async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Verification token is missing.'
            });
        }

        const result = await stockNotificationService.verify(token);
        return res.status(200).json(result);
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message || 'Unable to verify notification subscription.'
        });
    }
};

/**
 * Admin: Get overview KPI metrics
 */
exports.getAdminMetrics = async (req, res) => {
    try {
        const metrics = await stockNotificationService.getAdminMetrics();
        return res.status(200).json({
            success: true,
            data: metrics
        });
    } catch (err) {
        console.error('[StockNotificationController.getAdminMetrics] Error:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch stock notification metrics.'
        });
    }
};

/**
 * Admin: Get paginated subscriptions list
 */
exports.getAdminSubscriptions = async (req, res) => {
    try {
        const { page = 1, limit = 20, status, search, channel } = req.query;
        const result = await stockNotificationService.getSubscriptions({
            page,
            limit,
            status,
            search,
            channel
        });

        return res.status(200).json({
            success: true,
            data: result.items,
            pagination: result.pagination
        });
    } catch (err) {
        console.error('[StockNotificationController.getAdminSubscriptions] Error:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch subscriptions.'
        });
    }
};

/**
 * Admin: Retry failed job
 */
exports.retryJob = async (req, res) => {
    try {
        const { jobId } = req.params;
        const result = await stockNotificationService.retryJob(jobId);
        return res.status(200).json(result);
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message || 'Failed to retry notification job.'
        });
    }
};

/**
 * Admin: Cancel subscription
 */
exports.cancelSubscription = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await stockNotificationService.cancelSubscription(id);
        return res.status(200).json(result);
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message || 'Failed to cancel subscription.'
        });
    }
};

/**
 * Admin: Trigger manual restock test / force notify
 */
exports.triggerManualRestockTest = async (req, res) => {
    try {
        const { productId, size, newStock = 10 } = req.body;
        if (!productId) {
            return res.status(400).json({ success: false, message: 'Product ID is required.' });
        }

        const result = await stockNotificationService.triggerRestockEvent({
            productId: parseInt(productId),
            previousStock: 0,
            newStock: parseInt(newStock),
            size: size || null
        });

        return res.status(200).json({
            success: true,
            message: `Restock event triggered successfully. Queued jobs: ${result.queuedCount || 0}`,
            result
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message || 'Failed to trigger test restock.'
        });
    }
};
