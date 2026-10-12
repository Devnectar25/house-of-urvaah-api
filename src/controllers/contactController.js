const pool = require('../config/db');

exports.submitContactForm = async (req, res) => {
    const { name, email, phone, subject, message } = req.body;

    if (!name || !email || !message) {
        return res.status(400).json({
            success: false,
            error: "Name, email, and message are required"
        });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({
            success: false,
            error: "Invalid email format"
        });
    }

    try {
        const query = `
            INSERT INTO contact_submissions (name, email, phone, subject, message, status)
            VALUES ($1, $2, $3, $4, $5, 'new')
            RETURNING id, name, email, phone, subject, message, status, created_at
        `;

        const result = await pool.query(query, [
            name.trim(),
            email.trim().toLowerCase(),
            phone ? phone.trim() : null,
            (subject || 'General Inquiry').trim(),
            message.trim()
        ]);

        res.status(201).json({
            success: true,
            message: "Enquiry submitted successfully",
            data: result.rows[0]
        });

    } catch (err) {
        console.error("Error submitting contact form:", err);
        res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
};

exports.getAllLeads = async (req, res) => {
    try {
        const { status, search } = req.query;
        let query = `
            SELECT id, name, email, phone, subject, message, COALESCE(status, 'new') AS status, notes, created_at
            FROM contact_submissions
            WHERE 1=1
        `;
        const params = [];

        if (status && status !== 'all') {
            params.push(status.toLowerCase());
            query += ` AND LOWER(COALESCE(status, 'new')) = $${params.length}`;
        }

        if (search && search.trim()) {
            params.push(`%${search.trim().toLowerCase()}%`);
            query += ` AND (
                LOWER(name) LIKE $${params.length} 
                OR LOWER(email) LIKE $${params.length} 
                OR COALESCE(phone, '') LIKE $${params.length} 
                OR LOWER(COALESCE(subject, '')) LIKE $${params.length} 
                OR LOWER(message) LIKE $${params.length}
            )`;
        }

        query += ` ORDER BY created_at DESC`;

        const result = await pool.query(query, params);

        res.status(200).json({
            success: true,
            data: result.rows
        });
    } catch (err) {
        console.error("Error fetching leads:", err);
        res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
};

exports.getLeadsStats = async (req, res) => {
    try {
        const query = `
            SELECT 
                COUNT(*)::int AS total,
                COUNT(CASE WHEN status = 'new' OR status IS NULL THEN 1 END)::int AS new_count,
                COUNT(CASE WHEN status = 'contacted' THEN 1 END)::int AS contacted_count,
                COUNT(CASE WHEN status = 'resolved' THEN 1 END)::int AS resolved_count
            FROM contact_submissions
        `;
        const result = await pool.query(query);

        res.status(200).json({
            success: true,
            data: result.rows[0] || { total: 0, new_count: 0, contacted_count: 0, resolved_count: 0 }
        });
    } catch (err) {
        console.error("Error fetching leads stats:", err);
        res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
};

exports.updateLeadStatus = async (req, res) => {
    const { id } = req.params;
    const { status, notes } = req.body;

    try {
        const query = `
            UPDATE contact_submissions
            SET status = COALESCE($1, status),
                notes = COALESCE($2, notes)
            WHERE id = $3
            RETURNING id, name, email, phone, subject, message, status, notes, created_at
        `;
        const result = await pool.query(query, [status, notes, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: "Lead not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Lead updated successfully",
            data: result.rows[0]
        });
    } catch (err) {
        console.error("Error updating lead status:", err);
        res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
};

exports.deleteLead = async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query('DELETE FROM contact_submissions WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: "Lead not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Lead deleted successfully"
        });
    } catch (err) {
        console.error("Error deleting lead:", err);
        res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
};
