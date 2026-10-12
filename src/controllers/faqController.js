const pool = require('../config/db');

// In-memory cache for ultra-fast instantaneous FAQ loading
let faqsCache = null;
let faqsCacheTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour (auto-invalidated on admin mutations)

function invalidateFaqsCache() {
    faqsCache = null;
    faqsCacheTime = 0;
}

exports.invalidateFaqsCache = invalidateFaqsCache;

/**
 * Public: Get all active FAQs grouped by category
 * Used by the storefront Contact Us page & Urvaah Bot
 */
exports.getAllFAQs = async (req, res) => {
    try {
        const { category, search } = req.query;
        const isDefaultQuery = (!category || category === 'all') && (!search || !search.trim());

        // Fast-path: return cached response in <1ms
        if (isDefaultQuery && faqsCache && (Date.now() - faqsCacheTime < CACHE_TTL_MS)) {
            return res.status(200).json(faqsCache);
        }

        let query = `
            SELECT * FROM faqs 
            WHERE is_active = true 
        `;
        const params = [];

        if (category && category !== 'all') {
            params.push(category);
            query += ` AND category = $${params.length}`;
        }

        if (search && search.trim()) {
            params.push(`%${search.trim()}%`);
            query += ` AND (question ILIKE $${params.length} OR answer ILIKE $${params.length})`;
        }

        query += ` ORDER BY category ASC, display_order ASC, id ASC`;

        const result = await pool.query(query, params);

        // Group by category for structured luxury accordions
        const grouped = result.rows.reduce((acc, faq) => {
            const cat = faq.category || 'General';
            if (!acc[cat]) {
                acc[cat] = [];
            }
            acc[cat].push(faq);
            return acc;
        }, {});

        // Compute distinct categories in-memory instantly (avoids redundant 2nd DB query)
        const categories = Array.from(
            new Set(result.rows.map(r => r.category).filter(Boolean))
        ).sort();

        const payload = {
            success: true,
            count: result.rows.length,
            categories,
            data: grouped,
            all: result.rows
        };

        if (isDefaultQuery) {
            faqsCache = payload;
            faqsCacheTime = Date.now();
        }

        res.status(200).json(payload);
    } catch (err) {
        console.error("Error fetching FAQs:", err);
        res.status(500).json({
            success: false,
            error: "Failed to retrieve FAQs"
        });
    }
};

/**
 * Admin: Get all FAQs (active and inactive) with search/filter options
 */
exports.getAdminFAQs = async (req, res) => {
    try {
        const { search, category, status } = req.query;
        let query = `SELECT * FROM faqs WHERE 1=1`;
        const params = [];

        if (search && search.trim()) {
            params.push(`%${search.trim()}%`);
            query += ` AND (question ILIKE $${params.length} OR answer ILIKE $${params.length})`;
        }

        if (category && category !== 'all') {
            params.push(category);
            query += ` AND category = $${params.length}`;
        }

        if (status === 'active') {
            query += ` AND is_active = true`;
        } else if (status === 'inactive') {
            query += ` AND is_active = false`;
        }

        query += ` ORDER BY category ASC, display_order ASC, id ASC`;

        const result = await pool.query(query, params);

        // Distinct categories for filters
        const catResult = await pool.query(`
            SELECT DISTINCT category 
            FROM faqs 
            WHERE category IS NOT NULL AND category != '' 
            ORDER BY category ASC
        `);
        const categories = catResult.rows.map(r => r.category);

        res.status(200).json({
            success: true,
            count: result.rows.length,
            categories,
            data: result.rows
        });
    } catch (err) {
        console.error("Error fetching admin FAQs:", err);
        res.status(500).json({
            success: false,
            error: err.message || "Failed to load FAQs for admin"
        });
    }
};

/**
 * Admin: Create a new FAQ item
 */
exports.createFAQ = async (req, res) => {
    const { question, answer, category, display_order, is_active } = req.body;

    if (!question || !question.trim()) {
        return res.status(400).json({ success: false, message: "Question is required" });
    }
    if (!answer || !answer.trim()) {
        return res.status(400).json({ success: false, message: "Answer is required" });
    }

    try {
        const orderVal = (display_order !== undefined && display_order !== null && !isNaN(Number(display_order))) 
            ? Number(display_order) 
            : 0;
        const activeVal = is_active !== undefined ? Boolean(is_active) : true;
        const catVal = (category && category.trim()) ? category.trim() : 'General';

        const result = await pool.query(
            `INSERT INTO faqs (question, answer, category, display_order, is_active) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING *`,
            [question.trim(), answer.trim(), catVal, orderVal, activeVal]
        );

        invalidateFaqsCache();
        res.status(201).json({
            success: true,
            message: "FAQ created successfully",
            data: result.rows[0]
        });
    } catch (err) {
        console.error("Error creating FAQ:", err);
        res.status(500).json({ success: false, error: err.message || "Failed to create FAQ" });
    }
};

/**
 * Admin: Update an existing FAQ item
 */
exports.updateFAQ = async (req, res) => {
    const { id } = req.params;
    const { question, answer, category, display_order, is_active } = req.body;

    if (!question || !question.trim()) {
        return res.status(400).json({ success: false, message: "Question is required" });
    }
    if (!answer || !answer.trim()) {
        return res.status(400).json({ success: false, message: "Answer is required" });
    }

    try {
        const orderVal = (display_order !== undefined && display_order !== null && !isNaN(Number(display_order))) 
            ? Number(display_order) 
            : 0;
        const activeVal = is_active !== undefined ? Boolean(is_active) : true;
        const catVal = (category && category.trim()) ? category.trim() : 'General';

        const result = await pool.query(
            `UPDATE faqs 
             SET question = $1, answer = $2, category = $3, display_order = $4, is_active = $5 
             WHERE id = $6 
             RETURNING *`,
            [question.trim(), answer.trim(), catVal, orderVal, activeVal, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "FAQ not found" });
        }

        invalidateFaqsCache();
        res.status(200).json({
            success: true,
            message: "FAQ updated successfully",
            data: result.rows[0]
        });
    } catch (err) {
        console.error("Error updating FAQ:", err);
        res.status(500).json({ success: false, error: err.message || "Failed to update FAQ" });
    }
};

/**
 * Admin: Toggle FAQ active/inactive status
 */
exports.toggleFAQStatus = async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(
            `UPDATE faqs 
             SET is_active = NOT is_active 
             WHERE id = $1 
             RETURNING *`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "FAQ not found" });
        }

        invalidateFaqsCache();
        res.status(200).json({
            success: true,
            message: `FAQ ${result.rows[0].is_active ? 'activated' : 'deactivated'} successfully`,
            data: result.rows[0]
        });
    } catch (err) {
        console.error("Error toggling FAQ status:", err);
        res.status(500).json({ success: false, error: err.message || "Failed to toggle status" });
    }
};

/**
 * Admin: Delete an FAQ item
 */
exports.deleteFAQ = async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(`DELETE FROM faqs WHERE id = $1 RETURNING *`, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "FAQ not found" });
        }

        invalidateFaqsCache();
        res.status(200).json({
            success: true,
            message: "FAQ deleted successfully",
            data: result.rows[0]
        });
    } catch (err) {
        console.error("Error deleting FAQ:", err);
        res.status(500).json({ success: false, error: err.message || "Failed to delete FAQ" });
    }
};
