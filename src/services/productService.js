const pool = require("../config/db");
const storageService = require("./storageService");

// Helper to map DB columns to camelCase frontend fields
const mapProduct = (p) => {
    if (!p) return null;

    const rawImage = p.image_url || p.image || '';
    const mainImageUrl = rawImage ? storageService.getPublicMediaUrl(rawImage) : 'https://via.placeholder.com/300';

    const rawImagesArray = (p.images && p.images.length > 0)
        ? p.images
        : ((p.product_images && p.product_images.length > 0)
            ? p.product_images
            : [rawImage].filter(Boolean));

    const galleryUrls = rawImagesArray.map(img => storageService.getPublicMediaUrl(img));
    const hoverImageUrl = galleryUrls.length > 1 ? galleryUrls[1] : mainImageUrl;

    return {
        id: p.product_id?.toString() || p.id?.toString() || '',
        name: p.productname || p.title || '',
        brand: p.brand_name || p.brand || 'House of Urvaah',
        category: p.category_name || 'CLOTHING',
        categoryId: p.category_id || '',
        shortDescription: p.shortdescription || '',
        description: p.description || '',
        price: parseFloat(p.price) || 0,
        originalPrice: parseFloat(p.originalprice) || 0,
        discount: parseFloat(p.discount) || 0,
        rating: parseFloat(p.rating) || 0,
        reviews: parseInt(p.reviews_count || p.reviews) || 0,
        image: mainImageUrl,
        hoverImage: hoverImageUrl,
        gallery: galleryUrls.length > 0 ? galleryUrls : [mainImageUrl],
        images: galleryUrls.length > 0 ? galleryUrls : [mainImageUrl],
        inStock: p.instock !== false && p.is_active !== false && (p.stock_quantity === undefined || p.stock_quantity === null || p.stock_quantity > 0),
        stockQuantity: p.stock_quantity !== undefined && p.stock_quantity !== null ? p.stock_quantity : (p.quantity || 0),
        benefits: p.benefits,
        ingredients: p.ingredients,
        usage: p.usage,
        directions: p.directions,
        supports: p.supports || [],
        expiryInfo: p.expiryinfo,
        sizes: p.sizes || ['XS', 'S', 'M', 'L'],
        colors: p.colors || ['Default'],
        fabric: p.fabric || '',
        fitType: p.fit_type || '',
        careInstructions: p.care_instructions || '',
        sizeChartUrl: p.size_chart_url || '',
        styleCode: p.style_code || '',
        subCategory: p.subcategory_name || '',
        subCategoryId: p.subcategory_id || '',
        specifications: p.specifications,
        promoted: p.promoted || p.is_featured || false,
        active: p.active !== false && p.is_active !== false
    };
};

const BASE_PRODUCT_QUERY = `
    SELECT p.*, c.name as category_name, b.name as brand_name, sc.name as subcategory_name
    FROM products p
    LEFT JOIN category c ON p.category_id = c.category_id
    LEFT JOIN brand b ON (p.brand_id = b.brand_id OR p.brand = b.name OR p.brand = b.brand_id::text)
    LEFT JOIN subcategory sc ON p.subcategory_id = sc.srno
`;

exports.getAllProducts = async (page, limit, active, search, category_id, brand_id) => {
    let whereClauses = [];
    let params = [];
    let paramIdx = 1;

    if (active === 'true') {
        whereClauses.push(`COALESCE(p.is_active, true) = true`);
    }

    if (search) {
        whereClauses.push(`(p.title ILIKE $${paramIdx} OR p.description ILIKE $${paramIdx})`);
        params.push(`%${search}%`);
        paramIdx++;
    }

    if (category_id) {
        if (!isNaN(category_id)) {
            whereClauses.push(`p.category_id = $${paramIdx}`);
            params.push(parseInt(category_id));
        } else {
            whereClauses.push(`(c.name ILIKE $${paramIdx} OR p.category_id::text = $${paramIdx})`);
            params.push(category_id);
        }
        paramIdx++;
    }

    if (brand_id) {
        if (!isNaN(brand_id)) {
            whereClauses.push(`(p.brand_id = $${paramIdx} OR p.brand = $${paramIdx}::text)`);
            params.push(parseInt(brand_id));
        } else {
            whereClauses.push(`(b.name ILIKE $${paramIdx} OR p.brand ILIKE $${paramIdx})`);
            params.push(brand_id);
        }
        paramIdx++;
    }

    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    if (page && limit) {
        const offset = (page - 1) * limit;
        const countQuery = `SELECT COUNT(*) FROM products p LEFT JOIN category c ON p.category_id = c.category_id LEFT JOIN brand b ON (p.brand_id = b.brand_id OR p.brand = b.name OR p.brand = b.brand_id::text) ${whereString}`;
        const countResult = await pool.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);

        const dataQuery = `
            ${BASE_PRODUCT_QUERY}
            ${whereString}
            ORDER BY p.updated_at DESC, p.product_id DESC
            LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
        `;

        const dataParams = [...params, limit, offset];
        const result = await pool.query(dataQuery, dataParams);

        return {
            data: result.rows.map(mapProduct),
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / limit)
        };
    }

    const result = await pool.query(`
        ${BASE_PRODUCT_QUERY}
        ${whereString}
        ORDER BY p.updated_at DESC, p.product_id DESC
    `, params);
    return result.rows.map(mapProduct);
};

exports.getProductById = async (id) => {
    if (!id || (isNaN(id) && typeof id !== 'string')) {
        return null;
    }
    
    // Check numeric vs text ID search
    const isNum = !isNaN(id);
    const query = isNum
        ? `${BASE_PRODUCT_QUERY} WHERE p.product_id = $1::integer OR p.id = $1::integer`
        : `${BASE_PRODUCT_QUERY} WHERE p.style_code = $1 OR p.productname ILIKE $1`;

    const result = await pool.query(query, [id]);
    return result.rows[0] ? mapProduct(result.rows[0]) : null;
};

exports.getActiveProducts = async () => {
    const result = await pool.query(`
        ${BASE_PRODUCT_QUERY}
        WHERE COALESCE(p.is_active, true) = true
        ORDER BY p.updated_at DESC, p.product_id DESC
    `);
    return result.rows.map(mapProduct);
};

exports.getFeaturedProducts = async (query) => {
    const result = await pool.query(`
        ${BASE_PRODUCT_QUERY}
        WHERE COALESCE(p.is_featured, false) = true AND COALESCE(p.is_active, true) = true
        ORDER BY p.updated_at DESC, p.product_id DESC
        LIMIT 8
    `);
    return result.rows.map(mapProduct);
};

exports.getRelatedProducts = async (productId, category, limit = 4) => {
    const isNum = !isNaN(productId);
    let query = `${BASE_PRODUCT_QUERY} WHERE COALESCE(p.is_active, true) = true`;
    const params = [];

    if (isNum) {
        query += ` AND p.product_id != $1::integer`;
        params.push(parseInt(productId));
    }

    if (category) {
        const catIdx = params.length + 1;
        query += ` AND (c.name ILIKE $${catIdx} OR p.category_id::text = $${catIdx})`;
        params.push(category);
    }

    query += ` ORDER BY p.rating DESC NULLS LAST LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);
    return result.rows.map(mapProduct);
};

exports.createProduct = async (product) => {
    const {
        productname, description, shortdescription, price, originalprice,
        discount, category_id, brand, image, instock, promoted,
        benefits, ingredients, usage, directions, quantity, supports, images,
        expiryinfo, subcategory_id, specifications, active, sizes, colors, fabric, fit_type, style_code
    } = product;

    const result = await pool.query(
        `INSERT INTO products 
        (productname, description, shortdescription, price, originalprice, discount, category_id, brand, image, image_url, instock, promoted, benefits, ingredients, usage, directions, quantity, stock_quantity, supports, product_images, images, expiryinfo, subcategory_id, specifications, active, is_active, sizes, colors, fabric, fit_type, style_code, created_at, updated_at) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $11, $12, $13, $14, $15, $16, $16, $17, $18, $18, $19, $20, $21, $22, $22, $23, $24, $25, $26, $27, NOW(), NOW()) 
        RETURNING *`,
        [
            productname, description, shortdescription, price, originalprice, discount, category_id, brand, image,
            instock !== false, promoted || false, benefits, ingredients, usage, directions, quantity || 0,
            supports || [], images || [], expiryinfo, subcategory_id, specifications, active !== false,
            sizes || ['XS', 'S', 'M', 'L'], colors || ['Default'], fabric || '', fit_type || '', style_code || ''
        ]
    );
    return mapProduct(result.rows[0]);
};

exports.updateProduct = async (id, product) => {
    const {
        productname, description, shortdescription, price, originalprice,
        discount, category_id, brand, image, instock, promoted,
        benefits, ingredients, usage, directions, quantity, supports, images,
        expiryinfo, subcategory_id, specifications, active, sizes, colors, fabric, fit_type, style_code
    } = product;

    const result = await pool.query(
        `UPDATE products 
        SET productname = COALESCE($2, productname), description = COALESCE($3, description), shortdescription = COALESCE($4, shortdescription), price = COALESCE($5, price), originalprice = COALESCE($6, originalprice), 
            discount = COALESCE($7, discount), category_id = COALESCE($8, category_id), brand = COALESCE($9, brand), image = COALESCE($10, image), image_url = COALESCE($10, image_url), instock = COALESCE($11, instock), promoted = COALESCE($12, promoted),
            benefits = COALESCE($13, benefits), ingredients = COALESCE($14, ingredients), 
            usage = COALESCE($15, usage), directions = COALESCE($16, directions),
            quantity = COALESCE($17, quantity), stock_quantity = COALESCE($17, stock_quantity),
            supports = COALESCE($18, supports), product_images = COALESCE($19, product_images), images = COALESCE($19, images),
            expiryinfo = COALESCE($20, expiryinfo), subcategory_id = COALESCE($21, subcategory_id), specifications = COALESCE($22, specifications),
            active = COALESCE($23, active), is_active = COALESCE($23, is_active),
            sizes = COALESCE($24, sizes), colors = COALESCE($25, colors), fabric = COALESCE($26, fabric), fit_type = COALESCE($27, fit_type), style_code = COALESCE($28, style_code),
            updated_at = NOW()
        WHERE product_id = $1::integer OR id = $1::integer
        RETURNING *`,
        [id, productname, description, shortdescription, price, originalprice, discount, category_id, brand, image, instock, promoted, benefits, ingredients, usage, directions, quantity, supports, images, expiryinfo, subcategory_id, specifications, active, sizes, colors, fabric, fit_type, style_code]
    );
    return result.rows[0] ? mapProduct(result.rows[0]) : null;
};

exports.deleteProduct = async (id) => {
    const result = await pool.query("DELETE FROM products WHERE product_id = $1::integer OR id = $1::integer RETURNING *", [id]);
    return result.rows[0];
};

exports.toggleProductStatus = async (id) => {
    const result = await pool.query(`
        UPDATE products 
        SET active = NOT active, is_active = NOT is_active, updated_at = NOW() 
        WHERE product_id = $1::integer OR id = $1::integer 
        RETURNING *
    `, [id]);
    return result.rows[0] ? mapProduct(result.rows[0]) : null;
};
