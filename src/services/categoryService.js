const pool = require("../config/db");

const mapCategory = (cat) => {
    if (!cat) return null;
    const idVal = cat.id !== undefined ? cat.id : cat.category_id;
    const activeVal = cat.active !== undefined ? Boolean(cat.active) : (cat.is_active !== undefined ? Boolean(cat.is_active) : true);
    const imgVal = cat.category_image || cat.image_url || null;

    return {
        ...cat,
        id: idVal,
        category_id: idVal,
        active: activeVal,
        is_active: activeVal,
        category_image: imgVal,
        image_url: imgVal
    };
};

exports.getAllCategories = async (page, limit) => {
    if (page && limit) {
        const offset = (page - 1) * limit;
        const countResult = await pool.query("SELECT COUNT(*) FROM categories");
        const total = parseInt(countResult.rows[0].count);

        const result = await pool.query("SELECT * FROM categories ORDER BY id ASC LIMIT $1 OFFSET $2", [limit, offset]);

        return {
            data: result.rows.map(mapCategory),
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / limit)
        };
    }

    const result = await pool.query("SELECT * FROM categories ORDER BY id ASC");
    return result.rows.map(mapCategory);
};

exports.getActiveCategories = async () => {
    const result = await pool.query(`
        SELECT c.*, COUNT(p.product_id)::int as product_count
        FROM categories c
        LEFT JOIN products p ON (c.id = p.category_id OR c.id::text = p.category_id::text) AND (p.active = true OR p.is_active = true)
        WHERE c.active = true OR c.is_active = true
        GROUP BY c.id
        ORDER BY c.name ASC
    `);
    return result.rows.map(mapCategory);
};

exports.getCategoryById = async (id) => {
    const result = await pool.query("SELECT * FROM categories WHERE id = $1", [id]);
    return mapCategory(result.rows[0]);
};

exports.createCategory = async (data) => {
    const { name, description, active, is_active, category_image, image_url } = data;
    const activeVal = active !== undefined ? Boolean(active) : (is_active !== undefined ? Boolean(is_active) : true);
    const imgVal = category_image || image_url || null;

    const result = await pool.query(
        "INSERT INTO categories (name, description, active, is_active, category_image, image_url, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *",
        [name, description, activeVal, activeVal, imgVal, imgVal]
    );
    return mapCategory(result.rows[0]);
};

exports.updateCategory = async (id, data) => {
    const { name, description, active, is_active, category_image, image_url } = data;
    const activeVal = active !== undefined ? Boolean(active) : (is_active !== undefined ? Boolean(is_active) : null);
    const imgVal = category_image !== undefined ? category_image : (image_url !== undefined ? image_url : null);

    const result = await pool.query(
        "UPDATE categories SET name = COALESCE($1, name), description = COALESCE($2, description), active = COALESCE($3, active), is_active = COALESCE($3, is_active), category_image = COALESCE($4, category_image), image_url = COALESCE($4, image_url) WHERE id = $5 RETURNING *",
        [name, description, activeVal, imgVal, id]
    );
    return mapCategory(result.rows[0]);
};

exports.deleteCategory = async (id) => {
    const result = await pool.query("DELETE FROM categories WHERE id = $1 RETURNING *", [id]);
    return mapCategory(result.rows[0]);
};

exports.setActiveCategory = async (id) => {
    const result = await pool.query("UPDATE categories SET active = true, is_active = true WHERE id = $1 RETURNING *", [id]);
    return mapCategory(result.rows[0]);
};

exports.setInactiveCategory = async (id) => {
    const result = await pool.query("UPDATE categories SET active = false, is_active = false WHERE id = $1 RETURNING *", [id]);
    return mapCategory(result.rows[0]);
};
