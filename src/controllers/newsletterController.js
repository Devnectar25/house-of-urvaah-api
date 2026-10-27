const pool = require('../config/db');

/**
 * Strict and comprehensive RFC 5322 compliant email validator
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { isValid: false, error: 'Email address is required.' };
  }

  const trimmed = email.trim();

  if (trimmed.length === 0) {
    return { isValid: false, error: 'Email address cannot be empty.' };
  }

  if (trimmed.length > 254) {
    return { isValid: false, error: 'Email address exceeds maximum allowed length of 254 characters.' };
  }

  // Must contain exactly one '@'
  const parts = trimmed.split('@');
  if (parts.length !== 2) {
    return { isValid: false, error: 'Please enter a valid email address with a single @ symbol.' };
  }

  const [localPart, domainPart] = parts;

  if (!localPart || localPart.length === 0) {
    return { isValid: false, error: 'Please provide the username before the @ symbol.' };
  }

  if (localPart.length > 64) {
    return { isValid: false, error: 'Username portion of email cannot exceed 64 characters.' };
  }

  if (!domainPart || domainPart.length === 0) {
    return { isValid: false, error: 'Please provide a valid domain name after the @ symbol.' };
  }

  if (domainPart.length > 255) {
    return { isValid: false, error: 'Domain portion of email cannot exceed 255 characters.' };
  }

  // Check for double dots
  if (trimmed.includes('..')) {
    return { isValid: false, error: 'Email address cannot contain consecutive dots (..).' };
  }

  // Domain must contain at least one dot, and TLD must be >= 2 characters
  const domainParts = domainPart.split('.');
  if (domainParts.length < 2) {
    return { isValid: false, error: 'Please provide a complete domain name (e.g., example.com).' };
  }

  const tld = domainParts[domainParts.length - 1];
  if (!/^[a-zA-Z]{2,24}$/.test(tld)) {
    return { isValid: false, error: 'Please provide a valid top-level domain (e.g. .com, .in, .org).' };
  }

  // Comprehensive RFC 5322 regex
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(trimmed)) {
    return { isValid: false, error: 'Please enter a valid email address format (e.g. name@domain.com).' };
  }

  return { isValid: true, normalizedEmail: trimmed.toLowerCase() };
}

/**
 * Public: Subscribe to Newsletter
 * POST /api/newsletter/subscribe
 */
exports.subscribe = async (req, res) => {
  try {
    const { email, source = 'footer' } = req.body;
    const validation = validateEmail(email);

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    const cleanEmail = validation.normalizedEmail;
    const ipAddress = req.ip || req.connection?.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    // Check if subscriber already exists
    const existing = await pool.query(
      'SELECT id, email, status FROM public.newsletter_subscribers WHERE email = $1',
      [cleanEmail]
    );

    if (existing.rows.length > 0) {
      const subscriber = existing.rows[0];

      if (subscriber.status === 'subscribed') {
        return res.status(200).json({
          success: true,
          message: 'You are already subscribed to the House of Urvaah newsletter!',
          alreadySubscribed: true,
          data: subscriber
        });
      }

      // Re-activate previously unsubscribed user
      const updated = await pool.query(
        `UPDATE public.newsletter_subscribers 
         SET status = 'subscribed', source = $1, ip_address = $2, user_agent = $3, updated_at = CURRENT_TIMESTAMP
         WHERE email = $4 
         RETURNING id, email, status, source, created_at, updated_at`,
        [source || 'footer', ipAddress, userAgent, cleanEmail]
      );

      return res.status(200).json({
        success: true,
        message: 'Welcome back! You have successfully resubscribed to the House of Urvaah newsletter.',
        data: updated.rows[0]
      });
    }

    // Insert new subscriber
    const inserted = await pool.query(
      `INSERT INTO public.newsletter_subscribers (email, status, source, ip_address, user_agent)
       VALUES ($1, 'subscribed', $2, $3, $4)
       RETURNING id, email, status, source, created_at, updated_at`,
      [cleanEmail, source || 'footer', ipAddress, userAgent]
    );

    return res.status(201).json({
      success: true,
      message: 'Thank you for subscribing to House of Urvaah updates!',
      data: inserted.rows[0]
    });
  } catch (error) {
    console.error('Error subscribing to newsletter:', error);
    return res.status(500).json({
      success: false,
      error: 'An unexpected error occurred while saving your subscription. Please try again.'
    });
  }
};

/**
 * Admin: Get all subscribers with search, status filtering, and pagination
 * GET /api/admin/newsletter/subscribers
 */
exports.getAllSubscribers = async (req, res) => {
  try {
    const { search = '', status = 'all', page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      conditions.push(`LOWER(email) LIKE $${params.length}`);
    }

    if (status && status !== 'all') {
      params.push(status.trim().toLowerCase());
      conditions.push(`status = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total query
    const countQuery = `SELECT COUNT(*) AS total FROM public.newsletter_subscribers ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total, 10) || 0;

    // Fetch subscribers query
    const dataParams = [...params, limitNum, offset];
    const dataQuery = `
      SELECT id, email, status, source, ip_address, created_at, updated_at
      FROM public.newsletter_subscribers
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
    `;

    const dataResult = await pool.query(dataQuery, dataParams);

    return res.status(200).json({
      success: true,
      data: dataResult.rows,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1
      }
    });
  } catch (error) {
    console.error('Error fetching newsletter subscribers:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch newsletter subscribers.'
    });
  }
};

/**
 * Admin: Get Subscriber Statistics
 * GET /api/admin/newsletter/stats
 */
exports.getSubscriberStats = async (req, res) => {
  try {
    const statsQuery = `
      SELECT 
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'subscribed') AS active_count,
        COUNT(*) FILTER (WHERE status = 'unsubscribed') AS unsubscribed_count,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS today_count,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)) AS this_month_count
      FROM public.newsletter_subscribers
    `;

    const result = await pool.query(statsQuery);
    const row = result.rows[0] || {};

    return res.status(200).json({
      success: true,
      data: {
        total: parseInt(row.total || 0, 10),
        active: parseInt(row.active_count || 0, 10),
        unsubscribed: parseInt(row.unsubscribed_count || 0, 10),
        today: parseInt(row.today_count || 0, 10),
        this_month: parseInt(row.this_month_count || 0, 10)
      }
    });
  } catch (error) {
    console.error('Error fetching newsletter stats:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch newsletter statistics.'
    });
  }
};

/**
 * Admin: Add Subscriber Manually
 * POST /api/admin/newsletter/subscribers
 */
exports.addSubscriberManual = async (req, res) => {
  try {
    const { email, status = 'subscribed', source = 'admin' } = req.body;
    const validation = validateEmail(email);

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    const cleanEmail = validation.normalizedEmail;
    const cleanStatus = status === 'unsubscribed' ? 'unsubscribed' : 'subscribed';

    const existing = await pool.query(
      'SELECT id, email, status FROM public.newsletter_subscribers WHERE email = $1',
      [cleanEmail]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: `Subscriber with email '${cleanEmail}' already exists (Current status: ${existing.rows[0].status}).`
      });
    }

    const inserted = await pool.query(
      `INSERT INTO public.newsletter_subscribers (email, status, source)
       VALUES ($1, $2, $3)
       RETURNING id, email, status, source, created_at, updated_at`,
      [cleanEmail, cleanStatus, source || 'admin']
    );

    return res.status(201).json({
      success: true,
      message: 'Subscriber added successfully.',
      data: inserted.rows[0]
    });
  } catch (error) {
    console.error('Error adding subscriber manually:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create subscriber.'
    });
  }
};

/**
 * Admin: Update Subscriber Status
 * PATCH /api/admin/newsletter/subscribers/:id/status
 */
exports.updateSubscriberStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['subscribed', 'unsubscribed'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Status must be either 'subscribed' or 'unsubscribed'."
      });
    }

    const result = await pool.query(
      `UPDATE public.newsletter_subscribers
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, email, status, source, created_at, updated_at`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Subscriber not found.'
      });
    }

    return res.status(200).json({
      success: true,
      message: `Subscriber marked as ${status}.`,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating subscriber status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update subscriber status.'
    });
  }
};

/**
 * Admin: Delete Subscriber
 * DELETE /api/admin/newsletter/subscribers/:id
 */
exports.deleteSubscriber = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM public.newsletter_subscribers WHERE id = $1 RETURNING id, email',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Subscriber not found.'
      });
    }

    return res.status(200).json({
      success: true,
      message: `Subscriber '${result.rows[0].email}' removed successfully.`
    });
  } catch (error) {
    console.error('Error deleting subscriber:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete subscriber.'
    });
  }
};
