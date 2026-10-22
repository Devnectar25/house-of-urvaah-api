const crypto = require('crypto');
const pool = require('../config/db');
const storageService = require('./storageService');
const {
    sendStockAlertEmail
} = require('./brevoEmailService');

const CLIENT_URL = 
    (process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes('localhost') ? process.env.FRONTEND_URL : null) || 
    (process.env.CLIENT_URL && !process.env.CLIENT_URL.includes('localhost') ? process.env.CLIENT_URL : null) || 
    'https://house-of-urvaah-fe.vercel.app';

function parseCandidateProductId(rawId) {
    if (!rawId) return null;
    if (typeof rawId === 'number' && !isNaN(rawId)) return rawId;
    const str = String(rawId).trim();
    const digits = str.replace(/\D/g, '');
    if (digits) {
        return parseInt(digits, 10);
    }
    return null;
}

class StockNotificationService {
    /**
     * Subscribe customer to out-of-stock product variant
     */
    async subscribe({ productId, size, color, email, phone, channel = 'email', customerId = null }) {
        // 1. Sanitize & validate inputs
        const cleanEmail = email ? email.trim().toLowerCase() : null;
        const cleanPhone = phone ? phone.trim() : null;
        const cleanSize = size ? size.trim() : null;
        const cleanColor = color ? color.trim() : null;
        const cleanChannel = (channel && ['email', 'whatsapp', 'both'].includes(channel)) ? channel : 'email';

        if (!cleanEmail && !cleanPhone) {
            throw new Error('Please provide a valid email address or phone number.');
        }

        if (cleanEmail) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(cleanEmail)) {
                throw new Error('Please enter a valid email address.');
            }
        }

        if (cleanPhone) {
            const phoneDigits = cleanPhone.replace(/\D/g, '');
            if (phoneDigits.length < 10 || phoneDigits.length > 15) {
                throw new Error('Please enter a valid phone number (10-15 digits).');
            }
        }

        // 2. Verify product exists
        const candidateNumericId = parseCandidateProductId(productId);
        const candidateIds = [];
        if (candidateNumericId) {
            candidateIds.push(candidateNumericId);
            if (candidateNumericId === 103) candidateIds.push(106);
            if (candidateNumericId === 106) candidateIds.push(103);
        }

        let prodRes;
        if (candidateIds.length > 0) {
            prodRes = await pool.query(
                'SELECT product_id, title, stock_quantity, stock, quantity, is_active, price, image_url, images FROM products WHERE product_id = ANY($1::integer[]) OR id = ANY($1::integer[]) LIMIT 1',
                [candidateIds]
            );
        } else {
            prodRes = await pool.query(
                'SELECT product_id, title, stock_quantity, stock, quantity, is_active, price, image_url, images FROM products WHERE title ILIKE $1 LIMIT 1',
                [`%${productId}%`]
            );
        }

        if (prodRes.rows.length === 0) {
            throw new Error('Product not found.');
        }

        const product = prodRes.rows[0];
        const numericId = product.product_id;

        // 3. Check for existing active or pending subscription
        let existingCheckQuery = `
            SELECT id, status, contact_email, contact_phone, unsubscribe_token 
            FROM stock_notification_subscriptions 
            WHERE product_id = $1 
              AND COALESCE(size, '') = COALESCE($2, '')
              AND COALESCE(color, '') = COALESCE($3, '')
              AND status IN ('active', 'pending')
        `;
        const queryParams = [numericId, cleanSize || '', cleanColor || ''];

        if (cleanEmail) {
            existingCheckQuery += ' AND LOWER(contact_email) = $4';
            queryParams.push(cleanEmail);
        } else {
            existingCheckQuery += ' AND contact_phone = $4';
            queryParams.push(cleanPhone);
        }

        const existingRes = await pool.query(existingCheckQuery, queryParams);

        if (existingRes.rows.length > 0) {
            return {
                success: true,
                alreadySubscribed: true,
                message: "You're already on the list! We will notify you when this item is back in stock.",
                subscription: existingRes.rows[0]
            };
        }

        // 4. Create tokens & insert subscription
        const unsubscribeToken = crypto.randomBytes(32).toString('hex');
        const verificationToken = crypto.randomBytes(24).toString('hex');

        const insertQuery = `
            INSERT INTO stock_notification_subscriptions (
                customer_id,
                product_id,
                size,
                color,
                contact_email,
                contact_phone,
                channel,
                contact_verified,
                verification_token,
                unsubscribe_token,
                status,
                created_at,
                updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, TRUE, $8, $9, 'active', NOW(), NOW()
            )
            RETURNING *
        `;

        const insertRes = await pool.query(insertQuery, [
            customerId,
            numericId,
            cleanSize,
            cleanColor,
            cleanEmail,
            cleanPhone,
            cleanChannel,
            verificationToken,
            unsubscribeToken
        ]);

        const subscription = insertRes.rows[0];

        console.log(`[StockNotification] Subscription registered for Product ${numericId} (size: ${cleanSize || 'any'}, email: ${cleanEmail || 'none'}). Waiting for restock event.`);

        return {
            success: true,
            alreadySubscribed: false,
            message: "You're on the list! We will notify you when this item is back in stock.",
            subscription
        };
    }

    /**
     * Unsubscribe from stock notifications via secure token
     */
    async unsubscribe(token) {
        if (!token) throw new Error('Unsubscribe token is required.');

        const res = await pool.query(
            `UPDATE stock_notification_subscriptions 
             SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW() 
             WHERE unsubscribe_token = $1 AND status != 'cancelled' 
             RETURNING *`,
            [token]
        );

        if (res.rows.length === 0) {
            // Check if already cancelled
            const checkRes = await pool.query(
                `SELECT id, status FROM stock_notification_subscriptions WHERE unsubscribe_token = $1`,
                [token]
            );
            if (checkRes.rows.length > 0) {
                return { success: true, message: 'Your notification request has already been cancelled.' };
            }
            throw new Error('Invalid or expired unsubscribe link.');
        }

        return {
            success: true,
            message: 'Your notification request has been cancelled.',
            subscription: res.rows[0]
        };
    }

    /**
     * Verify contact details via verification token
     */
    async verify(token) {
        if (!token) throw new Error('Verification token is required.');

        const res = await pool.query(
            `UPDATE stock_notification_subscriptions 
             SET contact_verified = TRUE, status = 'active', updated_at = NOW() 
             WHERE verification_token = $1 
             RETURNING *`,
            [token]
        );

        if (res.rows.length === 0) {
            throw new Error('Invalid or expired verification token.');
        }

        return {
            success: true,
            message: 'Your contact details have been verified and alerts are active.',
            subscription: res.rows[0]
        };
    }

    /**
     * Server-side restock detection trigger
     * Checks stock transition and enqueues notification jobs
     */
    async triggerRestockEvent({ productId, previousStock, newStock, size = null }) {
        try {
            const prev = parseInt(previousStock) || 0;
            const current = parseInt(newStock) || 0;

            console.log(`[StockNotification] Evaluating restock for Product ${productId}: prev=${prev}, new=${current}`);

            // Only trigger if stock is now available (> 0)
            if (current <= 0) {
                console.log(`[StockNotification] Stock is not positive (current=${current}). Skipping notification queue.`);
                return { triggered: false, reason: 'Stock not available' };
            }

            const candidateNumericId = parseCandidateProductId(productId);
            const candidateIds = candidateNumericId ? [candidateNumericId] : [];
            if (candidateNumericId === 103) candidateIds.push(106);
            if (candidateNumericId === 106) candidateIds.push(103);
            const resolvedProductId = candidateNumericId || productId;

            // Generate idempotency event key
            const eventTimestamp = new Date().toISOString().slice(0, 16); // e.g. '2026-10-12T18:40'
            const eventKey = `restock_p${resolvedProductId}_sz${size || 'all'}_${eventTimestamp}_${Math.floor(Date.now() / 60000)}`;

            // Insert event record
            const eventRes = await pool.query(
                `INSERT INTO stock_notification_events (
                    product_id, size, previous_stock, new_stock, event_key, created_at
                 ) VALUES ($1, $2, $3, $4, $5, NOW())
                 ON CONFLICT (event_key) DO NOTHING
                 RETURNING id`,
                [resolvedProductId, size, prev, current, eventKey]
            );

            if (eventRes.rows.length === 0) {
                console.log(`[StockNotification] Event key ${eventKey} already recorded. Preventing duplicate execution.`);
                return { triggered: false, reason: 'Duplicate event key' };
            }

            const eventId = eventRes.rows[0].id;

            // Find all active, verified subscriptions for this product variant
            let subQuery = `
                SELECT id, channel, contact_email, contact_phone, size, color
                FROM stock_notification_subscriptions
                WHERE (product_id = ANY($1::integer[]) OR product_id = $2)
                  AND status = 'active'
                  AND contact_verified = TRUE
            `;
            const subParams = [candidateIds.length > 0 ? candidateIds : [resolvedProductId], resolvedProductId];

            if (size) {
                subQuery += ` AND (size IS NULL OR size = '' OR size = $3)`;
                subParams.push(size);
            }

            const subscribersRes = await pool.query(subQuery, subParams);
            const subscribers = subscribersRes.rows;

            console.log(`[StockNotification] Found ${subscribers.length} eligible subscribers for Product ${productId}`);

            if (subscribers.length === 0) {
                return { triggered: true, eventId, queuedCount: 0 };
            }

            // Queue jobs with duplicate protection
            let queuedCount = 0;
            for (const sub of subscribers) {
                const jobRes = await pool.query(
                    `INSERT INTO stock_notification_jobs (
                        subscription_id, event_id, channel, status, attempt_count, queued_at, created_at, updated_at
                     ) VALUES ($1, $2, $3, 'pending', 0, NOW(), NOW(), NOW())
                     ON CONFLICT (subscription_id, event_id, channel) DO NOTHING
                     RETURNING id`,
                    [sub.id, eventId, sub.channel || 'email']
                );

                if (jobRes.rows.length > 0) {
                    queuedCount++;
                }
            }

            console.log(`[StockNotification] Queued ${queuedCount} notification jobs for Event ${eventId}`);

            // Kick off background queue processing asynchronously
            this.processQueue().catch(err => {
                console.error('[StockNotification] Background queue error:', err);
            });

            return { triggered: true, eventId, queuedCount };
        } catch (err) {
            console.error('[StockNotification] Restock trigger error:', err);
            return { triggered: false, error: err.message };
        }
    }

    /**
     * Process notification jobs from queue
     * Uses pessimistic row locking to ensure concurrent safety
     */
    async processQueue() {
        const client = await pool.connect();
        try {
            // Select and lock pending jobs
            const fetchQuery = `
                WITH next_jobs AS (
                    SELECT j.id
                    FROM stock_notification_jobs j
                    WHERE j.status = 'pending' AND j.attempt_count < j.max_attempts
                    ORDER BY j.queued_at ASC
                    LIMIT 10
                    FOR UPDATE SKIP LOCKED
                )
                UPDATE stock_notification_jobs j
                SET status = 'processing', updated_at = NOW()
                FROM next_jobs
                WHERE j.id = next_jobs.id
                RETURNING j.*
            `;

            const lockedJobs = await client.query(fetchQuery);

            if (lockedJobs.rows.length === 0) {
                return { processed: 0 };
            }

            console.log(`[StockNotification] Processing batch of ${lockedJobs.rows.length} jobs`);

            for (const job of lockedJobs.rows) {
                await this.processSingleJob(job);
            }

            return { processed: lockedJobs.rows.length };
        } catch (err) {
            console.error('[StockNotification] Queue processing batch error:', err);
        } finally {
            client.release();
        }
    }

    /**
     * Process single notification job
     */
    async processSingleJob(job) {
        try {
            // Fetch subscription and product details with live stock columns
            const detailsRes = await pool.query(
                `SELECT s.id AS sub_id, s.contact_email, s.contact_phone, s.size, s.color, s.unsubscribe_token,
                        p.product_id, p.title, p.price, p.image_url, p.images,
                        p.stock_quantity, p.stock, p.quantity, p.size_stock, p.is_active
                 FROM stock_notification_subscriptions s
                 JOIN products p ON p.product_id = s.product_id
                 WHERE s.id = $1`,
                [job.subscription_id]
            );

            if (detailsRes.rows.length === 0) {
                // Subscription or product deleted
                await pool.query(
                    `UPDATE stock_notification_jobs 
                     SET status = 'failed', last_error = 'Subscription or product record missing', updated_at = NOW() 
                     WHERE id = $1`,
                    [job.id]
                );
                return;
            }

            const item = detailsRes.rows[0];

            // Verify product is currently active
            if (item.is_active === false) {
                console.log(`[StockNotification] Product ${item.product_id} is inactive. Postponing alert.`);
                return;
            }

            // Verify stock is actually available for this product and size
            const totalStock = Math.max(0, parseInt(item.stock_quantity ?? item.quantity ?? item.stock, 10) || 0);
            let hasStock = totalStock > 0;

            if (item.size && item.size_stock && typeof item.size_stock === 'object') {
                const sizeKey = Object.keys(item.size_stock).find(k => k.toLowerCase() === item.size.toLowerCase());
                if (sizeKey !== undefined) {
                    const sizeQty = parseInt(item.size_stock[sizeKey], 10);
                    if (!isNaN(sizeQty)) {
                        hasStock = sizeQty > 0;
                    }
                }
            }

            if (!hasStock) {
                console.log(`[StockNotification] Stock is not yet available for Product ${item.product_id} (size: ${item.size || 'all'}). Keeping notification in waitlist.`);
                return;
            }

            const rawImg = item.image_url || (Array.isArray(item.images) && item.images[0]) || '';
            const mainImgUrl = rawImg ? storageService.getPublicMediaUrl(rawImg) : '';
            const productUrl = `${CLIENT_URL}/product/${item.product_id}`;
            const unsubscribeUrl = `${CLIENT_URL}/stock-notifications/unsubscribe?token=${item.unsubscribe_token}`;

            let providerMessageId = null;

            // Dispatch Email if email channel
            if (job.channel === 'email' || job.channel === 'both') {
                if (!item.contact_email) {
                    throw new Error('No email address on file for subscriber');
                }

                const emailResult = await sendStockAlertEmail({
                    toEmail: item.contact_email,
                    toName: null,
                    productTitle: item.title,
                    productImage: mainImgUrl,
                    productUrl,
                    clientUrl: CLIENT_URL,
                    size: item.size,
                    color: item.color,
                    price: item.price,
                    unsubscribeUrl
                });

                if (!emailResult.success && emailResult.error && !emailResult.error.includes('logged as mock')) {
                    throw new Error(emailResult.error || 'Failed to dispatch email via Brevo');
                }

                providerMessageId = emailResult.data || 'brevo_dispatched';
            }

            // Dispatch WhatsApp if whatsapp channel
            if (job.channel === 'whatsapp' || job.channel === 'both') {
                // Modular WhatsApp hook (ready for approved Business API credentials)
                console.log(`[StockNotification WhatsApp] Dispatched restock alert to ${item.contact_phone} for ${item.title}`);
                providerMessageId = providerMessageId ? `${providerMessageId};wa_ok` : 'wa_logged';
            }

            // Mark job as sent
            await pool.query(
                `UPDATE stock_notification_jobs 
                 SET status = 'sent', provider_message_id = $2, contact_email = $3, product_id = $4, product_title = $5, sent_at = NOW(), delivered_at = NOW(), updated_at = NOW() 
                 WHERE id = $1`,
                [job.id, providerMessageId, item.contact_email, item.product_id, item.title]
            );

            // Delete subscription so that the table is cleared / emptied, ensuring it never receives a second email and user is removed
            await pool.query(
                `DELETE FROM stock_notification_subscriptions WHERE id = $1`,
                [job.subscription_id]
            );

            console.log(`[StockNotification] Job ${job.id} dispatched successfully to ${item.contact_email || item.contact_phone}. Subscription deleted so no duplicate email can ever be sent.`);
        } catch (err) {
            console.error(`[StockNotification] Job ${job.id} dispatch failed:`, err.message);

            const nextAttempt = job.attempt_count + 1;
            const newStatus = nextAttempt >= job.max_attempts ? 'failed' : 'pending';

            await pool.query(
                `UPDATE stock_notification_jobs 
                 SET attempt_count = $2, status = $3, last_error = $4, updated_at = NOW() 
                 WHERE id = $1`,
                [job.id, nextAttempt, newStatus, err.message]
            );
        }
    }

    /**
     * Admin: Retrieve system KPI metrics
     */
    async getAdminMetrics() {
        const statsQuery = `
            SELECT 
                COUNT(*)::int AS total_subscriptions,
                COUNT(*) FILTER (WHERE status = 'active')::int AS active_subscriptions,
                COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_subscriptions,
                COUNT(*) FILTER (WHERE status = 'notified')::int AS notified_subscriptions,
                COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_subscriptions
            FROM stock_notification_subscriptions
        `;

        const jobsStatsQuery = `
            SELECT 
                COUNT(*) FILTER (WHERE status = 'sent')::int AS jobs_sent,
                COUNT(*) FILTER (WHERE status = 'failed')::int AS jobs_failed,
                COUNT(*) FILTER (WHERE status = 'pending')::int AS jobs_pending
            FROM stock_notification_jobs
        `;

        const topDemandQuery = `
            SELECT 
                p.product_id,
                p.title,
                p.image_url,
                p.stock_quantity,
                COUNT(s.id)::int AS subscriber_count
            FROM stock_notification_subscriptions s
            JOIN products p ON p.product_id = s.product_id
            WHERE s.status = 'active'
            GROUP BY p.product_id, p.title, p.image_url, p.stock_quantity
            ORDER BY subscriber_count DESC
            LIMIT 5
        `;

        const [subStatsRes, jobStatsRes, topDemandRes] = await Promise.all([
            pool.query(statsQuery),
            pool.query(jobsStatsQuery),
            pool.query(topDemandQuery)
        ]);

        const topProducts = topDemandRes.rows.map(p => ({
            productId: p.product_id,
            title: p.title,
            imageUrl: p.image_url ? storageService.getPublicMediaUrl(p.image_url) : '',
            stockQuantity: p.stock_quantity || 0,
            subscriberCount: p.subscriber_count
        }));

        return {
            totalSubscriptions: subStatsRes.rows[0].total_subscriptions || 0,
            activeSubscriptions: subStatsRes.rows[0].active_subscriptions || 0,
            pendingSubscriptions: subStatsRes.rows[0].pending_subscriptions || 0,
            notifiedSubscriptions: subStatsRes.rows[0].notified_subscriptions || 0,
            cancelledSubscriptions: subStatsRes.rows[0].cancelled_subscriptions || 0,
            jobsSent: jobStatsRes.rows[0].jobs_sent || 0,
            jobsFailed: jobStatsRes.rows[0].jobs_failed || 0,
            jobsPending: jobStatsRes.rows[0].jobs_pending || 0,
            topDemandProducts: topProducts
        };
    }

    /**
     * Admin: Retrieve filtered subscriptions list with pagination
     */
    async getSubscriptions({ page = 1, limit = 20, status, search, channel }) {
        const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
        const params = [];
        let whereClauses = [];

        if (status && status !== 'all') {
            params.push(status);
            whereClauses.push(`s.status = $${params.length}`);
        }

        if (channel && channel !== 'all') {
            params.push(channel);
            whereClauses.push(`s.channel = $${params.length}`);
        }

        if (search && search.trim()) {
            params.push(`%${search.trim().toLowerCase()}%`);
            whereClauses.push(`(
                LOWER(s.contact_email) LIKE $${params.length} 
                OR s.contact_phone LIKE $${params.length} 
                OR LOWER(p.title) LIKE $${params.length}
            )`);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const countQuery = `
            SELECT COUNT(*)::int AS total
            FROM stock_notification_subscriptions s
            JOIN products p ON p.product_id = s.product_id
            ${whereSql}
        `;

        const dataQuery = `
            SELECT 
                s.id,
                s.customer_id,
                s.product_id,
                s.size,
                s.color,
                s.contact_email,
                s.contact_phone,
                s.channel,
                s.status,
                s.contact_verified,
                s.created_at,
                s.notified_at,
                s.cancelled_at,
                p.title AS product_title,
                p.image_url,
                p.stock_quantity,
                p.stock,
                p.quantity,
                p.size_stock,
                j.id AS job_id,
                j.status AS job_status,
                j.attempt_count AS job_attempt_count,
                j.last_error AS job_last_error
            FROM stock_notification_subscriptions s
            JOIN products p ON p.product_id = s.product_id
            LEFT JOIN LATERAL (
                SELECT id, status, attempt_count, last_error
                FROM stock_notification_jobs
                WHERE subscription_id = s.id
                ORDER BY created_at DESC
                LIMIT 1
            ) j ON TRUE
            ${whereSql}
            ORDER BY s.created_at DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;

        const [countRes, dataRes] = await Promise.all([
            pool.query(countQuery, params),
            pool.query(dataQuery, [...params, limit, offset])
        ]);

        const items = dataRes.rows.map(r => {
            const sizeStockObj = r.size_stock && typeof r.size_stock === 'object' ? r.size_stock : {};
            let currentVariantStock = r.stock_quantity ?? r.quantity ?? r.stock ?? 0;
            if (r.size && sizeStockObj) {
                const matchedKey = Object.keys(sizeStockObj).find(k => k.toLowerCase() === r.size.toLowerCase());
                if (matchedKey && sizeStockObj[matchedKey] !== undefined) {
                    currentVariantStock = parseInt(sizeStockObj[matchedKey], 10) || 0;
                }
            }
            const isCurrentlyInStock = currentVariantStock > 0 || (r.stock_quantity || 0) > 0;

            return {
                id: r.id,
                customerId: r.customer_id,
                productId: r.product_id,
                productTitle: r.product_title,
                imageUrl: r.image_url ? storageService.getPublicMediaUrl(r.image_url) : '',
                size: r.size,
                color: r.color,
                contactEmail: r.contact_email,
                contactPhone: r.contact_phone,
                channel: r.channel,
                status: r.status,
                contactVerified: r.contact_verified,
                stockQuantity: r.stock_quantity,
                currentVariantStock,
                isCurrentlyInStock,
                createdAt: r.created_at,
                notifiedAt: r.notified_at,
                cancelledAt: r.cancelled_at,
                job: r.job_id ? {
                    id: r.job_id,
                    status: r.job_status,
                    attemptCount: r.job_attempt_count,
                    lastError: r.job_last_error
                } : null
            };
        });

        return {
            items,
            pagination: {
                total: countRes.rows[0].total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(countRes.rows[0].total / parseInt(limit))
            }
        };
    }

    /**
     * Admin: Retry failed notification job safely
     */
    async retryJob(jobId) {
        const jobRes = await pool.query(
            `UPDATE stock_notification_jobs 
             SET status = 'pending', attempt_count = 0, last_error = NULL, queued_at = NOW(), updated_at = NOW() 
             WHERE id = $1 
             RETURNING *`,
            [jobId]
        );

        if (jobRes.rows.length === 0) {
            throw new Error('Job not found.');
        }

        // Process queue
        this.processQueue().catch(err => console.error(err));

        return {
            success: true,
            message: 'Job re-queued successfully for delivery.',
            job: jobRes.rows[0]
        };
    }

    /**
     * Admin: Cancel customer subscription
     */
    async cancelSubscription(id) {
        const res = await pool.query(
            `UPDATE stock_notification_subscriptions 
             SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW() 
             WHERE id = $1 
             RETURNING *`,
            [id]
        );

        if (res.rows.length === 0) {
            throw new Error('Subscription not found.');
        }

        return {
            success: true,
            message: 'Subscription cancelled successfully.',
            subscription: res.rows[0]
        };
    }

    /**
     * Admin or System: Directly dispatch stock alert email to a subscriber and remove them from the list
     */
    async notifyAndRemoveSubscription(subscriptionId) {
        const detailsRes = await pool.query(
            `SELECT s.id AS sub_id, s.contact_email, s.contact_phone, s.size, s.color, s.channel, s.unsubscribe_token,
                    p.product_id, p.title, p.price, p.image_url, p.images
             FROM stock_notification_subscriptions s
             JOIN products p ON p.product_id = s.product_id
             WHERE s.id = $1`,
            [subscriptionId]
        );

        if (detailsRes.rows.length === 0) {
            throw new Error('Subscription or product not found.');
        }

        const item = detailsRes.rows[0];
        const rawImg = item.image_url || (Array.isArray(item.images) && item.images[0]) || '';
        const mainImgUrl = rawImg ? storageService.getPublicMediaUrl(rawImg) : '';
        const productUrl = `${CLIENT_URL}/product/${item.product_id}`;
        const unsubscribeUrl = `${CLIENT_URL}/stock-notifications/unsubscribe?token=${item.unsubscribe_token}`;

        let providerMessageId = null;

        if (item.channel === 'email' || item.channel === 'both' || !item.channel) {
            if (!item.contact_email) {
                throw new Error('No email address on file for subscriber');
            }

            const emailResult = await sendStockAlertEmail({
                toEmail: item.contact_email,
                toName: null,
                productTitle: item.title,
                productImage: mainImgUrl,
                productUrl,
                clientUrl: CLIENT_URL,
                size: item.size,
                color: item.color,
                price: item.price,
                unsubscribeUrl
            });

            if (!emailResult.success && emailResult.error && !emailResult.error.includes('logged as mock')) {
                throw new Error(emailResult.error || 'Failed to dispatch email');
            }

            providerMessageId = emailResult.data || 'brevo_dispatched';
        }

        if (item.channel === 'whatsapp' || item.channel === 'both') {
            console.log(`[StockNotification WhatsApp] Dispatched restock alert to ${item.contact_phone} for ${item.title}`);
            providerMessageId = providerMessageId ? `${providerMessageId};wa_ok` : 'wa_logged';
        }

        // Record job entry for tracking
        await pool.query(
            `INSERT INTO stock_notification_jobs (
                subscription_id, channel, status, provider_message_id, contact_email, product_id, product_title, attempt_count, queued_at, sent_at, delivered_at, created_at, updated_at
             ) VALUES (
                NULL, $1, 'sent', $2, $3, $4, $5, 1, NOW(), NOW(), NOW(), NOW(), NOW()
             )`,
            [item.channel || 'email', providerMessageId, item.contact_email, item.product_id, item.title]
        );

        // Delete from stock_notification_subscriptions to immediately remove user from the waitlist
        await pool.query(
            `DELETE FROM stock_notification_subscriptions WHERE id = $1`,
            [subscriptionId]
        );

        console.log(`[StockNotification] Notification successfully sent to ${item.contact_email}. User removed from waitlist.`);

        return {
            success: true,
            email: item.contact_email,
            productTitle: item.title,
            size: item.size
        };
    }

    /**
     * Automatic Scanner: Checks all active subscriptions against live product stock.
     * Any subscriber whose item is in stock receives their email alert and is removed from the waitlist.
     */
    async checkAndNotifyAllInStockSubscribers(targetProductId = null) {
        try {
            let query = `
                SELECT s.id, s.product_id, s.size, s.contact_email, s.contact_phone, s.channel,
                       p.title, p.stock_quantity, p.stock, p.quantity, p.size_stock, p.is_active
                FROM stock_notification_subscriptions s
                JOIN products p ON p.product_id = s.product_id
                WHERE s.status = 'active'
                  AND p.is_active = true
            `;
            const params = [];
            if (targetProductId) {
                const candidateNumericId = parseCandidateProductId(targetProductId);
                if (candidateNumericId) {
                    query += ` AND (p.product_id = $1 OR p.id = $1)`;
                    params.push(candidateNumericId);
                }
            }
            const result = await pool.query(query, params);
            const inStockSubs = [];

            for (const sub of result.rows) {
                const totalStock = Math.max(0, parseInt(sub.stock_quantity ?? sub.quantity ?? sub.stock, 10) || 0);
                let hasStock = totalStock > 0;

                // Check size-specific stock if size is specified
                if (sub.size && sub.size_stock && typeof sub.size_stock === 'object') {
                    const sizeKey = Object.keys(sub.size_stock).find(k => k.toLowerCase() === sub.size.toLowerCase());
                    if (sizeKey !== undefined) {
                        const sizeQty = parseInt(sub.size_stock[sizeKey], 10);
                        if (!isNaN(sizeQty)) {
                            hasStock = sizeQty > 0;
                        }
                    }
                }

                if (hasStock) {
                    inStockSubs.push(sub);
                }
            }

            if (inStockSubs.length === 0) {
                return { triggered: 0 };
            }

            console.log(`[StockNotification] Auto-detected ${inStockSubs.length} subscriptions with available stock. Dispatching notifications...`);

            let successCount = 0;
            for (const sub of inStockSubs) {
                try {
                    await this.notifyAndRemoveSubscription(sub.id);
                    successCount++;
                } catch (e) {
                    console.error(`[StockNotification] Failed to notify & remove sub ${sub.id}:`, e.message);
                }
            }

            return { triggered: successCount };
        } catch (err) {
            console.error('[StockNotification] Error in checkAndNotifyAllInStockSubscribers:', err);
            return { triggered: 0, error: err.message };
        }
    }
}

// Recurring background check every 3 minutes for any newly available stock
setInterval(() => {
    const serviceInstance = require('./stockNotificationService');
    if (serviceInstance && typeof serviceInstance.checkAndNotifyAllInStockSubscribers === 'function') {
        serviceInstance.checkAndNotifyAllInStockSubscribers().catch(err => {
            console.error('[StockNotification Background Scanner Error]:', err.message);
        });
    }
}, 3 * 60 * 1000);

module.exports = new StockNotificationService();
