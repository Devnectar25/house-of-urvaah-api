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
        originalPrice: parseFloat(p.originalprice || p.sale_price) || 0,
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

    if (active === 'true' || active === true || active === '1') {
        whereClauses.push(`COALESCE(p.is_active, true) = true`);
    } else if (active === 'false' || active === false || active === '0') {
        whereClauses.push(`COALESCE(p.is_active, true) = false`);
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
        : `${BASE_PRODUCT_QUERY} WHERE p.style_code = $1 OR p.title ILIKE $1`;

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
        ORDER BY p.product_id ASC
        LIMIT 5
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
        productname, title, description, price, originalprice, sale_price,
        category_id, brand, image, image_url, images, promoted, is_featured,
        quantity, stock_quantity, stock, active, is_active, sizes, colors,
        fabric, fit_type, care_instructions, style_code, subcategory_id
    } = product;

    const productTitle = title || productname || '';
    const activeVal = active !== undefined ? active : (is_active !== undefined ? is_active : true);
    const origPrice = originalprice ?? sale_price ?? price;
    const imgUrl = image_url || image || (Array.isArray(images) ? images[0] : '');
    const isFeatured = promoted !== undefined ? promoted : (is_featured || false);
    const stockQty = stock_quantity ?? quantity ?? stock ?? 0;
    const parsedCatId = category_id ? parseInt(category_id) : null;
    const parsedSubcatId = subcategory_id ? parseInt(subcategory_id) : null;

    const result = await pool.query(
        `INSERT INTO products 
        (title, description, price, sale_price, category_id, brand, image_url, images, is_featured, is_active, stock_quantity, stock, sizes, colors, fabric, fit_type, care_instructions, style_code, subcategory_id, created_at, updated_at) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW()) 
        RETURNING *`,
        [
            productTitle, description || '', price || 0, origPrice, parsedCatId,
            brand || 'House of Urvaah', imgUrl, images || [], isFeatured, activeVal !== false,
            stockQty, sizes || ['XS', 'S', 'M', 'L'], colors || ['Default'],
            fabric || '', fit_type || '', care_instructions || '', style_code || '', parsedSubcatId
        ]
    );
    return mapProduct(result.rows[0]);
};

exports.updateProduct = async (id, product) => {
    const {
        productname, title, description, price, originalprice, sale_price,
        category_id, brand, image, image_url, images, promoted, is_featured,
        quantity, stock_quantity, stock, active, is_active, sizes, colors,
        fabric, fit_type, care_instructions, style_code, subcategory_id
    } = product;

    const productTitle = title || productname;
    const activeVal = active !== undefined ? active : is_active;
    const origPrice = originalprice ?? sale_price;
    const imgUrl = image_url || image;
    const isFeatured = promoted !== undefined ? promoted : is_featured;
    const stockQty = stock_quantity ?? quantity ?? stock;
    const parsedCatId = category_id ? parseInt(category_id) : null;
    const parsedSubcatId = subcategory_id ? parseInt(subcategory_id) : null;

    const result = await pool.query(
        `UPDATE products 
        SET title = COALESCE($2, title),
            description = COALESCE($3, description),
            price = COALESCE($4, price),
            sale_price = COALESCE($5, sale_price),
            category_id = COALESCE($6, category_id),
            brand = COALESCE($7, brand),
            image_url = COALESCE($8, image_url),
            images = COALESCE($9, images),
            is_featured = COALESCE($10, is_featured),
            is_active = COALESCE($11, is_active),
            stock_quantity = COALESCE($12, stock_quantity),
            stock = COALESCE($12, stock),
            sizes = COALESCE($13, sizes),
            colors = COALESCE($14, colors),
            fabric = COALESCE($15, fabric),
            fit_type = COALESCE($16, fit_type),
            care_instructions = COALESCE($17, care_instructions),
            style_code = COALESCE($18, style_code),
            subcategory_id = COALESCE($19, subcategory_id),
            updated_at = NOW()
        WHERE product_id = $1::integer OR id = $1::integer
        RETURNING *`,
        [
            id, productTitle, description, price, origPrice, parsedCatId,
            brand, imgUrl, images, isFeatured, activeVal, stockQty,
            sizes, colors, fabric, fit_type, care_instructions, style_code, parsedSubcatId
        ]
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
        SET is_active = NOT COALESCE(is_active, true), updated_at = NOW() 
        WHERE product_id = $1::integer OR id = $1::integer 
        RETURNING *
    `, [id]);
    return result.rows[0] ? mapProduct(result.rows[0]) : null;
};
