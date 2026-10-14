const pool = require('../config/db');

// Simple user-agent parser helper
function parseUserAgent(ua = '') {
    let browser = 'Unknown';
    let os = 'Unknown';
    let deviceType = 'Desktop';

    if (/mobile/i.test(ua)) deviceType = 'Mobile';
    if (/tablet|ipad/i.test(ua)) deviceType = 'Tablet';

    if (/windows/i.test(ua)) os = 'Windows';
    else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
    else if (/android/i.test(ua)) os = 'Android';
    else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
    else if (/linux/i.test(ua)) os = 'Linux';

    if (/edg\//i.test(ua)) browser = 'Edge';
    else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
    else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
    else if (/safari/i.test(ua)) browser = 'Safari';
    else if (/opera|opr\//i.test(ua)) browser = 'Opera';

    return { browser, os, deviceType };
}

// In-memory rate limiter per IP / URL to prevent report flood
const reportRateLimitCache = new Map();
const RATE_LIMIT_WINDOW_MS = 10000; // 10 seconds
const MAX_REPORTS_PER_WINDOW = 30;

// 1. Report Error (Public endpoint called by frontend error tracker)
exports.reportError = async (req, res) => {
    try {
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const now = Date.now();

        // Rate limit check
        const clientCache = reportRateLimitCache.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
        if (now > clientCache.resetTime) {
            clientCache.count = 0;
            clientCache.resetTime = now + RATE_LIMIT_WINDOW_MS;
        }
        clientCache.count += 1;
        reportRateLimitCache.set(ip, clientCache);

        if (clientCache.count > MAX_REPORTS_PER_WINDOW) {
            return res.status(429).json({ success: false, message: 'Too many error reports. Throttled.' });
        }

        const {
            errorMessage,
            errorName = 'Error',
            errorStack = '',
            errorType = 'ui', // 'ui', 'functional', 'console', 'unhandled_rejection', 'network'
            severity = 'error', // 'error', 'warn', 'fatal', 'info'
            url = '',
            componentStack = '',
            userId = null,
            userEmail = null,
            browser: clientBrowser,
            os: clientOs,
            deviceType: clientDeviceType,
            metadata = null
        } = req.body;

        if (!errorMessage || typeof errorMessage !== 'string' || errorMessage.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'errorMessage is required.' });
        }

        const rawUa = req.headers['user-agent'] || '';
        const parsedUa = parseUserAgent(rawUa);

        const browser = clientBrowser || parsedUa.browser;
        const os = clientOs || parsedUa.os;
        const deviceType = clientDeviceType || parsedUa.deviceType;

        // Truncate ultra-long stacks to protect DB size
        const safeMessage = errorMessage.slice(0, 2000);
        const safeName = (errorName || 'Error').slice(0, 150);
        const safeStack = errorStack ? String(errorStack).slice(0, 15000) : null;
        const safeComponentStack = componentStack ? String(componentStack).slice(0, 15000) : null;
        const safeUrl = url ? String(url).slice(0, 2000) : null;

        const query = `
            INSERT INTO public.client_error_logs (
                error_message,
                error_name,
                error_stack,
                error_type,
                severity,
                url,
                component_stack,
                user_id,
                user_email,
                user_agent,
                browser,
                os,
                device_type,
                status,
                created_at,
                updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'unresolved', NOW(), NOW()
            ) RETURNING id, created_at;
        `;

        const values = [
            safeMessage,
            safeName,
            safeStack,
            errorType || 'ui',
            severity || 'error',
            safeUrl,
            safeComponentStack,
            userId ? String(userId).slice(0, 100) : null,
            userEmail ? String(userEmail).slice(0, 255) : null,
            rawUa.slice(0, 1000),
            browser,
            os,
            deviceType
        ];

        const result = await pool.query(query, values);
        return res.status(201).json({
            success: true,
            id: result.rows[0].id,
            created_at: result.rows[0].created_at
        });
    } catch (err) {
        console.error('[ErrorLogController.reportError] Failed to insert error log:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to record error log.' });
    }
};

// 2. Get All Error Logs (Admin protected - Grouped by error signature)
exports.getErrorLogs = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 15));
        const offset = (page - 1) * limit;

        const { search, status, severity, errorType, timeRange } = req.query;

        let baseConditions = [];
        let params = [];
        let paramIdx = 1;

        if (severity && severity !== 'all') {
            baseConditions.push(`severity = $${paramIdx++}`);
            params.push(severity);
        }

        if (errorType && errorType !== 'all') {
            baseConditions.push(`error_type = $${paramIdx++}`);
            params.push(errorType);
        }

        if (search && search.trim().length > 0) {
            baseConditions.push(`(
                error_message ILIKE $${paramIdx} OR
                error_name ILIKE $${paramIdx} OR
                url ILIKE $${paramIdx} OR
                user_email ILIKE $${paramIdx}
            )`);
            params.push(`%${search.trim()}%`);
            paramIdx++;
        }

        if (timeRange && timeRange !== 'all') {
            if (timeRange === '24h') {
                baseConditions.push(`created_at >= NOW() - INTERVAL '24 hours'`);
            } else if (timeRange === '7d') {
                baseConditions.push(`created_at >= NOW() - INTERVAL '7 days'`);
            } else if (timeRange === '30d') {
                baseConditions.push(`created_at >= NOW() - INTERVAL '30 days'`);
            }
        }

        const baseWhereClause = baseConditions.length > 0 ? `WHERE ${baseConditions.join(' AND ')}` : '';

        // Status filter applies to the grouped triage status
        let groupConditions = [];
        if (status && status !== 'all') {
            groupConditions.push(`status = $${paramIdx++}`);
            params.push(status);
        }
        const groupWhereClause = groupConditions.length > 0 ? `WHERE ${groupConditions.join(' AND ')}` : '';

        const cte = `
            WITH grouped_errors AS (
                SELECT 
                    MAX(id) AS id,
                    error_message,
                    error_name,
                    error_type,
                    MAX(severity) AS severity,
                    (ARRAY_AGG(url ORDER BY created_at DESC))[1] AS url,
                    (ARRAY_AGG(component_stack ORDER BY created_at DESC))[1] AS component_stack,
                    (ARRAY_AGG(error_stack ORDER BY created_at DESC))[1] AS error_stack,
                    (ARRAY_AGG(browser ORDER BY created_at DESC))[1] AS browser,
                    (ARRAY_AGG(os ORDER BY created_at DESC))[1] AS os,
                    (ARRAY_AGG(device_type ORDER BY created_at DESC))[1] AS device_type,
                    (ARRAY_AGG(user_email ORDER BY created_at DESC))[1] AS user_email,
                    (ARRAY_AGG(user_id ORDER BY created_at DESC))[1] AS user_id,
                    CASE 
                        WHEN bool_or(status = 'unresolved') THEN 'unresolved'
                        WHEN bool_or(status = 'investigating') THEN 'investigating'
                        ELSE (ARRAY_AGG(status ORDER BY created_at DESC))[1]
                    END AS status,
                    (ARRAY_AGG(resolved_at ORDER BY created_at DESC))[1] AS resolved_at,
                    (ARRAY_AGG(resolved_by ORDER BY created_at DESC))[1] AS resolved_by,
                    (ARRAY_AGG(notes ORDER BY created_at DESC))[1] AS notes,
                    MAX(created_at) AS created_at,
                    MIN(created_at) AS first_seen_at,
                    COUNT(*)::int AS occurrence_count,
                    ARRAY_AGG(id ORDER BY created_at DESC) AS grouped_ids
                FROM public.client_error_logs
                ${baseWhereClause}
                GROUP BY error_message, error_name, error_type
            )
        `;

        // Count total unique error groups for pagination
        const countQuery = `
            ${cte}
            SELECT COUNT(*)::int AS total FROM grouped_errors ${groupWhereClause};
        `;
        const countResult = await pool.query(countQuery, params);
        const total = parseInt(countResult.rows[0]?.total || 0, 10);

        // Fetch paginated error groups
        const dataQuery = `
            ${cte}
            SELECT * FROM grouped_errors
            ${groupWhereClause}
            ORDER BY created_at DESC
            LIMIT $${paramIdx++} OFFSET $${paramIdx++};
        `;

        const dataResult = await pool.query(dataQuery, [...params, limit, offset]);

        return res.json({
            success: true,
            data: dataResult.rows,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit) || 1
            }
        });
    } catch (err) {
        console.error('[ErrorLogController.getErrorLogs] Error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to retrieve error logs.' });
    }
};

// 3. Get Error Stats (Admin protected)
exports.getErrorStats = async (req, res) => {
    try {
        const statsQuery = `
            SELECT
                COUNT(*) AS total_errors,
                COUNT(*) FILTER (WHERE status = 'unresolved') AS unresolved_errors,
                COUNT(*) FILTER (WHERE status = 'investigating') AS investigating_errors,
                COUNT(*) FILTER (WHERE status = 'resolved') AS resolved_errors,
                COUNT(*) FILTER (WHERE severity IN ('fatal', 'error')) AS critical_errors,
                COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS errors_last_24h,
                COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS errors_last_7d
            FROM public.client_error_logs;
        `;

        const uniqueStatsQuery = `
            WITH grouped_errors AS (
                SELECT 
                    error_message, 
                    error_name, 
                    error_type,
                    CASE 
                        WHEN bool_or(status = 'unresolved') THEN 'unresolved'
                        WHEN bool_or(status = 'investigating') THEN 'investigating'
                        ELSE 'resolved'
                    END AS group_status
                FROM public.client_error_logs
                GROUP BY error_message, error_name, error_type
            )
            SELECT 
                COUNT(*)::int AS unique_errors,
                COUNT(*) FILTER (WHERE group_status = 'unresolved')::int AS unique_unresolved
            FROM grouped_errors;
        `;

        const typeBreakdownQuery = `
            SELECT error_type, COUNT(*) AS count
            FROM public.client_error_logs
            GROUP BY error_type
            ORDER BY count DESC;
        `;

        const severityBreakdownQuery = `
            SELECT severity, COUNT(*) AS count
            FROM public.client_error_logs
            GROUP BY severity
            ORDER BY count DESC;
        `;

        const [statsResult, uniqueResult, typeResult, severityResult] = await Promise.all([
            pool.query(statsQuery),
            pool.query(uniqueStatsQuery),
            pool.query(typeBreakdownQuery),
            pool.query(severityBreakdownQuery)
        ]);

        const stats = statsResult.rows[0] || {};
        const uniqueStats = uniqueResult.rows[0] || {};

        return res.json({
            success: true,
            data: {
                totalErrors: parseInt(stats.total_errors, 10) || 0,
                uniqueErrors: parseInt(uniqueStats.unique_errors, 10) || 0,
                uniqueUnresolved: parseInt(uniqueStats.unique_unresolved, 10) || 0,
                unresolvedErrors: parseInt(stats.unresolved_errors, 10) || 0,
                investigatingErrors: parseInt(stats.investigating_errors, 10) || 0,
                resolvedErrors: parseInt(stats.resolved_errors, 10) || 0,
                criticalErrors: parseInt(stats.critical_errors, 10) || 0,
                errorsLast24h: parseInt(stats.errors_last_24h, 10) || 0,
                errorsLast7d: parseInt(stats.errors_last_7d, 10) || 0,
                byType: typeResult.rows,
                bySeverity: severityResult.rows
            }
        });
    } catch (err) {
        console.error('[ErrorLogController.getErrorStats] Error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to retrieve error statistics.' });
    }
};

// 4. Update Error Log (Status, Notes - Supports updating all grouped IDs)
exports.updateErrorLog = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes, ids } = req.body;

        const targetIds = Array.isArray(ids) && ids.length > 0 
            ? ids.map(n => parseInt(n, 10)).filter(Boolean)
            : [parseInt(id, 10)].filter(Boolean);

        const adminName = req.user?.username || req.user?.email || 'Admin';

        let updateFields = ['updated_at = NOW()'];
        let params = [targetIds];
        let idx = 2;

        if (status) {
            updateFields.push(`status = $${idx++}`);
            params.push(status);

            if (status === 'resolved') {
                updateFields.push(`resolved_at = NOW()`);
                updateFields.push(`resolved_by = $${idx++}`);
                params.push(adminName);
            } else {
                updateFields.push(`resolved_at = NULL`);
                updateFields.push(`resolved_by = NULL`);
            }
        }

        if (notes !== undefined) {
            updateFields.push(`notes = $${idx++}`);
            params.push(notes);
        }

        const query = `
            UPDATE public.client_error_logs
            SET ${updateFields.join(', ')}
            WHERE id = ANY($1::int[])
            RETURNING *;
        `;

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Error log not found.' });
        }

        return res.json({
            success: true,
            data: result.rows[0],
            affectedCount: result.rows.length,
            message: 'Error log updated successfully.'
        });
    } catch (err) {
        console.error('[ErrorLogController.updateErrorLog] Error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to update error log.' });
    }
};

// 5. Delete Error Log (Supports deleting all grouped IDs)
exports.deleteErrorLog = async (req, res) => {
    try {
        const { id } = req.params;
        const { ids } = req.body || {};
        const queryIds = req.query.ids ? req.query.ids.split(',').map(n => parseInt(n, 10)).filter(Boolean) : null;

        const targetIds = Array.isArray(ids) && ids.length > 0
            ? ids.map(n => parseInt(n, 10)).filter(Boolean)
            : (Array.isArray(queryIds) && queryIds.length > 0
                ? queryIds
                : [parseInt(id, 10)].filter(Boolean));

        const result = await pool.query(`DELETE FROM public.client_error_logs WHERE id = ANY($1::int[]) RETURNING id;`, [targetIds]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Error log not found.' });
        }

        return res.json({ success: true, message: `Successfully deleted ${result.rows.length} error record(s).` });
    } catch (err) {
        console.error('[ErrorLogController.deleteErrorLog] Error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to delete error log.' });
    }
};

// 6. Bulk Clear / Purge Logs
exports.clearErrorLogs = async (req, res) => {
    try {
        const { mode } = req.body || {}; // 'all', 'resolved', 'older_30d'

        let query = `DELETE FROM public.client_error_logs`;
        if (mode === 'resolved') {
            query += ` WHERE status = 'resolved'`;
        } else if (mode === 'older_30d') {
            query += ` WHERE created_at < NOW() - INTERVAL '30 days'`;
        }

        const result = await pool.query(query);

        return res.json({
            success: true,
            deletedCount: result.rowCount,
            message: `Successfully cleared ${result.rowCount} error logs.`
        });
    } catch (err) {
        console.error('[ErrorLogController.clearErrorLogs] Error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to clear error logs.' });
    }
};
