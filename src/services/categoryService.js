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
        SELECT c.*, (
            SELECT COUNT(*)::int 
            FROM products p 
            WHERE p.is_active = true 
              AND (
                  p.category_id = c.id 
                  OR c.slug = ANY(p.categories)
                  OR c.name = ANY(p.categories)
                  OR (c.slug = 'new-arrivals')
              )
        ) as product_count
        FROM categories c
        WHERE (c.active = true OR c.is_active = true)
        ORDER BY c.id ASC
    `);
    return result.rows.map(mapCategory);
};

exports.getCategoryById = async (id) => {
    const result = await pool.query("SELECT * FROM categories WHERE id = $1", [id]);
    return mapCategory(result.rows[0]);
};

exports.createCategory = async (data) => {
    const { name, description, active, is_active, category_image, image_url, slug } = data;
    const trimmedName = (name || '').trim();
    if (!trimmedName) {
        const error = new Error("Category name is required");
        error.statusCode = 400;
        throw error;
    }

    const generatedSlug = (slug || trimmedName).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    // Check if a category with this name or slug already exists (case-insensitive)
    const existingCheck = await pool.query(
        "SELECT id, name FROM categories WHERE LOWER(TRIM(name)) = LOWER($1) OR (slug IS NOT NULL AND slug = $2) LIMIT 1",
        [trimmedName, generatedSlug]
    );

    if (existingCheck.rows.length > 0) {
        const error = new Error(`Category "${existingCheck.rows[0].name}" already exists.`);
        error.statusCode = 409;
        throw error;
    }

    const activeVal = active !== undefined ? Boolean(active) : (is_active !== undefined ? Boolean(is_active) : true);
    const imgVal = category_image || image_url || null;

    const result = await pool.query(
        "INSERT INTO categories (name, description, active, is_active, category_image, image_url, slug, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *",
        [trimmedName, description, activeVal, activeVal, imgVal, imgVal, generatedSlug]
    );
    return mapCategory(result.rows[0]);
};

exports.updateCategory = async (id, data) => {
    const { name, description, active, is_active, category_image, image_url, slug } = data;
    const trimmedName = name !== undefined ? (name || '').trim() : null;

    if (trimmedName !== null && !trimmedName) {
        const error = new Error("Category name cannot be empty");
        error.statusCode = 400;
        throw error;
    }

    const generatedSlug = slug ? slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : (trimmedName ? trimmedName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : null);

    // If updating name or slug, check for duplicates excluding this category id
    if (trimmedName || generatedSlug) {
        const existingCheck = await pool.query(
            "SELECT id, name FROM categories WHERE (LOWER(TRIM(name)) = LOWER($1) OR (slug IS NOT NULL AND slug = $2)) AND id != $3 LIMIT 1",
            [trimmedName || '', generatedSlug || '', id]
        );

        if (existingCheck.rows.length > 0) {
            const error = new Error(`Category "${existingCheck.rows[0].name}" already exists.`);
            error.statusCode = 409;
            throw error;
        }
    }

    const activeVal = active !== undefined ? Boolean(active) : (is_active !== undefined ? Boolean(is_active) : null);
    const imgVal = category_image !== undefined ? category_image : (image_url !== undefined ? image_url : null);

    const result = await pool.query(
        "UPDATE categories SET name = COALESCE($1, name), description = COALESCE($2, description), active = COALESCE($3, active), is_active = COALESCE($3, is_active), category_image = COALESCE($4, category_image), image_url = COALESCE($4, image_url), slug = COALESCE($5, slug) WHERE id = $6 RETURNING *",
        [trimmedName, description, activeVal, imgVal, generatedSlug, id]
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
