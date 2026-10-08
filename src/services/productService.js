const pool = require("../config/db");
const storageService = require("./storageService");

// Helper to map DB columns to camelCase frontend fields
const mapProduct = (p) => {
    if (!p) return null;

    if (p.product_id == 101 || p.product_id == 105 || (p.title && (p.title.toLowerCase().includes('oversized blazer') || p.title.toLowerCase().includes('chestnut bloom set')))) {
        p.product_id = 101;
        p.title = 'CHESTNUT BLOOM SET';
        p.image_url = 'products/Brown02.png';
        p.images = ['products/Brown02.png', 'products/Brown03.png', 'products/Brown04.png', 'products/Brown01.png'];
    }

    if (p.product_id == 102 && (!p.title || p.title.toLowerCase().includes('dark blue'))) {
        p.title = 'CERULEAN GARDEN SET';
    }

    if (p.product_id == 104 && (!p.title || p.title.toLowerCase().includes('ribbed silk'))) {
        p.title = 'ROSEWOOD BLOOM SET';
        p.description = 'A cap-sleeve top and mini skirt set in a soft peach-pink floral embroidered fabric with delicate sequin work throughout. The skirt hem finishes in a hand-detailed potli trim, and a corset-style lace-up back on the top gives it a fitted, flattering silhouette.\nFully lined, with a side-zip closure on the skirt for easy wear.\nSoft enough for daytime, sharp enough for evening.';
    }

    if (p.product_id == 106 || p.product_id == 103 || (p.title && p.title.toLowerCase().includes('asymmetrical')) || (p.title && p.title.toLowerCase().includes('peach bloom')) || (p.title && p.title.toLowerCase().includes('gilded mist'))) {
        p.product_id = 103;
        p.title = 'GILDED MIST CORSET';
        p.description = 'A statement corset top in raw tissue silk, hand-embroidered with rich golden zari work and delicate sequin detailing throughout. Boned below the bust for structure, with soft padding for comfort and shape no additional support needed underneath.\nDesigned to be worn endlessly: pair it over a saree for a modern draped look, with a skirt for evening, or dress it down with jeans or palazzos for a statement daytime moment. One corset, however many ways you want to style it.\nClosure: adjustable lace-up back.';
        p.image_url = 'products/Corset01.png';
        p.images = ['products/Corset01.png', 'products/Corset02.png', 'products/Corset03.png', 'products/Corset04.png'];
    }

    if (p.product_id == 109 || (p.title && (p.title.toLowerCase().includes('embroidered silk kurti') || p.title.toLowerCase().includes('ivory corset kurti')))) {
        p.title = 'Ivory Corset Kurti';
        p.description = 'A everyday-easy piece that works two ways wear it buttoned up as a mini dress, or unbutton the front placket for a more relaxed, styled-open kurti look over jeans. Made in breathable cora cotton, designed for all-day comfort in humid, Indian-summer weather.\nFinished with a square neckline trimmed in delicate floral lace, a corset-style lace-up back for a snatched, tailored fit, and all-over heart-shaped butti embroidery in a soft ivory tone. Fully lined in cotton for added comfort and opacity.\nFrom college to the office to a weekend occasion — one piece, three ways to wear it.';
        p.additional_info = 'Fabric: Cora cotton (breathable, all-day wear)\nLining: Cotton lining\nNeckline: Square neck with floral lace trim\nClosure: Front button placket, corset-style lace-up back\nEmbroidery: All-over heart-shaped butti embroidery\nStyling: Wear buttoned as a dress, or open-front as a kurti\nAvailable sizes: XS, S, M, L';
    }

    const rawImage = p.image_url || p.image || '';
    const mainImageUrl = rawImage ? storageService.getPublicMediaUrl(rawImage) : 'https://via.placeholder.com/300';

    const rawImagesArray = (p.images && p.images.length > 0)
        ? p.images
        : ((p.product_images && p.product_images.length > 0)
            ? p.product_images
            : [rawImage].filter(Boolean));

    const galleryUrls = rawImagesArray.map(img => storageService.getPublicMediaUrl(img));
    const hoverImageUrl = galleryUrls.length > 1 ? galleryUrls[1] : mainImageUrl;

    const currPrice = parseFloat(p.price) || 0;
    const origPrice = parseFloat(p.sale_price || p.originalprice) || currPrice;
    const calcDiscount = (origPrice > currPrice && origPrice > 0)
        ? Math.round(((origPrice - currPrice) / origPrice) * 100)
        : (parseFloat(p.discount) || 0);

    let parsedSpecs = p.specifications || [];
    if (typeof parsedSpecs === 'string') {
        try { parsedSpecs = JSON.parse(parsedSpecs); } catch (e) { parsedSpecs = []; }
    }

    let parsedNameOpts = p.name_options || p.nameoptions || [];
    if (typeof parsedNameOpts === 'string') {
        try { parsedNameOpts = JSON.parse(parsedNameOpts); } catch (e) { parsedNameOpts = []; }
    }
    if (!Array.isArray(parsedNameOpts)) parsedNameOpts = [];

    let parsedProdDetails = p.product_details || p.productdetails || [];
    if (typeof parsedProdDetails === 'string') {
        try { parsedProdDetails = JSON.parse(parsedProdDetails); } catch (e) { parsedProdDetails = []; }
    }
    if (!Array.isArray(parsedProdDetails)) parsedProdDetails = [];

    return {
        id: p.product_id?.toString() || p.id?.toString() || '',
        name: p.title || p.productname || '',
        title: p.title || p.productname || '',
        brand: p.brand_name || p.brand || 'House of Urvaah',
        category: p.category_name || 'CLOTHING',
        categoryId: p.category_id || '',
        category_id: p.category_id || '',
        shortDescription: p.short_description || p.shortdescription || '',
        short_description: p.short_description || p.shortdescription || '',
        description: p.description || '',
        price: currPrice,
        originalPrice: origPrice,
        discount: calcDiscount,
        discountPercent: calcDiscount,
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
        sizes: Array.isArray(p.sizes) ? p.sizes : (typeof p.sizes === 'string' ? [p.sizes] : ['XS', 'S', 'M', 'L']),
        colors: Array.isArray(p.colors) ? p.colors : (typeof p.colors === 'string' ? [p.colors] : ['Default']),
        fabric: p.fabric || '',
        fitType: p.fit_type || '',
        careInstructions: p.care_instructions || '',
        care_instructions: p.care_instructions || '',
        additionalInfo: p.additional_info || p.additionalInfo || p.additionalInfoText || '',
        additionalInfoText: p.additional_info || p.additionalInfo || p.additionalInfoText || '',
        additional_info: p.additional_info || p.additionalInfo || p.additionalInfoText || '',
        sizeChartUrl: p.size_chart_url || '',
        styleCode: p.style_code || '',
        subCategory: p.subcategory_name || '',
        subCategoryId: p.subcategory_id || '',
        specifications: parsedSpecs,
        nameOptions: parsedNameOpts,
        name_options: parsedNameOpts,
        productDetails: parsedProdDetails,
        product_details: parsedProdDetails,
        promoted: p.promoted || p.is_featured || false,
        is_recommended: p.is_recommended !== undefined ? Boolean(p.is_recommended) : Boolean(p.isrecommended),
        isRecommended: p.is_recommended !== undefined ? Boolean(p.is_recommended) : Boolean(p.isrecommended),
        active: p.active !== false && p.is_active !== false,
        is_active: p.active !== false && p.is_active !== false
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
    // Best Sellers: Computed strictly from actual sales volume in order_items (or rating / created_at fallback)
    const result = await pool.query(`
        ${BASE_PRODUCT_QUERY}
        LEFT JOIN (
            SELECT product_id, SUM(quantity) as total_sales
            FROM order_items
            GROUP BY product_id
        ) oi ON (p.product_id = oi.product_id OR p.id = oi.product_id)
        WHERE COALESCE(p.is_active, true) = true
        ORDER BY COALESCE(oi.total_sales, 0) DESC, COALESCE(p.rating, 0) DESC, p.product_id DESC
        LIMIT 5
    `);
    return result.rows.map(mapProduct);
};

exports.getRecommendations = async ({ userId, recentlyViewedIds = [], cartProductIds = [], limit = 5 } = {}) => {
    const seenIds = new Set();
    const recommendedList = [];

    // Exclusion rule: Exclude products already purchased by logged-in user if userId provided
    let purchasedProductIds = new Set();
    if (userId) {
        try {
            const purchasedRes = await pool.query(`
                SELECT DISTINCT oi.product_id::text
                FROM order_items oi
                JOIN orders o ON oi.order_id = o.order_id
                WHERE (o.user_id = $1::integer OR o.user_id::text = $1::text)
                  AND o.order_status NOT IN ('cancelled', 'Cancelled')
            `, [userId]);
            purchasedRes.rows.forEach(r => {
                if (r.product_id) purchasedProductIds.add(r.product_id.toString());
            });
        } catch (e) {
            console.error('Error checking purchased products for user:', e);
        }
    }

    const addProducts = (rows) => {
        for (const rawP of rows) {
            if (recommendedList.length >= limit) break;
            const mapped = mapProduct(rawP);
            const pId = mapped?.id;
            if (pId && !seenIds.has(pId) && !purchasedProductIds.has(pId) && mapped.active !== false && mapped.inStock !== false && mapped.price > 0 && mapped.name) {
                seenIds.add(pId);
                recommendedList.push(mapped);
            }
        }
    };

    // Tier 1: Wishlist
    if (userId && recommendedList.length < limit) {
        try {
            const wishlistRes = await pool.query(`
                ${BASE_PRODUCT_QUERY}
                JOIN wishlist w ON (p.product_id = w.product_id OR p.id = w.product_id)
                WHERE (w.user_id = $1::integer OR w.user_id::text = $1::text)
                  AND COALESCE(p.is_active, true) = true
                ORDER BY w.created_at DESC
            `, [userId]);
            addProducts(wishlistRes.rows);
        } catch (e) {
            // Wishlist table error or empty
        }
    }

    // Tier 2: Admin Recommended & Admin Added/Active Products
    if (recommendedList.length < limit) {
        try {
            const adminRecRes = await pool.query(`
                ${BASE_PRODUCT_QUERY}
                WHERE COALESCE(p.is_active, true) = true
                ORDER BY 
                  CASE WHEN COALESCE(p.is_recommended, false) = true THEN 1 ELSE 2 END,
                  p.updated_at DESC NULLS LAST,
                  p.created_at DESC NULLS LAST,
                  p.product_id DESC
                LIMIT 15
            `);
            addProducts(adminRecRes.rows);
        } catch (e) {
            console.error('Error fetching Admin Recommended / Active products:', e);
        }
    }

    // Tier 3: Recently Viewed products
    if (recentlyViewedIds && recentlyViewedIds.length > 0 && recommendedList.length < limit) {
        try {
            const validIds = recentlyViewedIds.map(id => parseInt(id)).filter(id => !isNaN(id));
            if (validIds.length > 0) {
                const recViewedRes = await pool.query(`
                    ${BASE_PRODUCT_QUERY}
                    WHERE (p.product_id = ANY($1::int[]) OR p.id = ANY($1::int[]))
                      AND COALESCE(p.is_active, true) = true
                `, [validIds]);
                addProducts(recViewedRes.rows);
            }
        } catch (e) {
            console.error('Error fetching Recently Viewed products:', e);
        }
    }

    // Tier 4: Add-to-Cart products
    if (cartProductIds && cartProductIds.length > 0 && recommendedList.length < limit) {
        try {
            const validIds = cartProductIds.map(id => parseInt(id)).filter(id => !isNaN(id));
            if (validIds.length > 0) {
                const cartRes = await pool.query(`
                    ${BASE_PRODUCT_QUERY}
                    WHERE (p.product_id = ANY($1::int[]) OR p.id = ANY($1::int[]))
                      AND COALESCE(p.is_active, true) = true
                `, [validIds]);
                addProducts(cartRes.rows);
            }
        } catch (e) {
            console.error('Error fetching Cart products:', e);
        }
    }

    // Tier 5: Best Sellers (actual order_items sales volume)
    if (recommendedList.length < limit) {
        try {
            const bestSellerRes = await pool.query(`
                ${BASE_PRODUCT_QUERY}
                LEFT JOIN (
                    SELECT product_id, SUM(quantity) as total_sales
                    FROM order_items
                    GROUP BY product_id
                ) oi ON (p.product_id = oi.product_id OR p.id = oi.product_id)
                WHERE COALESCE(p.is_active, true) = true
                ORDER BY COALESCE(oi.total_sales, 0) DESC, COALESCE(p.rating, 0) DESC, p.product_id DESC
                LIMIT 10
            `);
            addProducts(bestSellerRes.rows);
        } catch (e) {
            console.error('Error fetching Best Sellers in recommendations:', e);
        }
    }

    // Tier 6: Most Viewed / Highest Rated
    if (recommendedList.length < limit) {
        try {
            const mostViewedRes = await pool.query(`
                ${BASE_PRODUCT_QUERY}
                WHERE COALESCE(p.is_active, true) = true
                ORDER BY COALESCE(p.rating, 0) DESC, p.reviews_count DESC NULLS LAST, p.product_id DESC
                LIMIT 10
            `);
            addProducts(mostViewedRes.rows);
        } catch (e) {
            console.error('Error fetching Most Viewed in recommendations:', e);
        }
    }

    // Tier 7: Other Available Catalog fallback
    if (recommendedList.length < limit) {
        try {
            const fallbackRes = await pool.query(`
                ${BASE_PRODUCT_QUERY}
                WHERE COALESCE(p.is_active, true) = true
                ORDER BY p.updated_at DESC, p.product_id DESC
                LIMIT 10
            `);
            addProducts(fallbackRes.rows);
        } catch (e) {
            console.error('Error fetching Catalog fallback in recommendations:', e);
        }
    }

    return recommendedList.slice(0, limit);
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
        productname, title, description, shortDescription, short_description, shortdescription,
        price, originalprice, originalPrice, sale_price,
        category_id, brand, image, image_url, images, promoted, is_featured, is_recommended, isRecommended,
        quantity, stock_quantity, stock, active, is_active, sizes, colors,
        fabric, fit_type, care_instructions, careInstructions, style_code, subcategory_id,
        specifications, name_options, nameOptions, product_details, productDetails
    } = product;

    const productTitle = title || productname || '';
    const activeVal = active !== undefined ? active : (is_active !== undefined ? is_active : true);
    const recVal = is_recommended !== undefined ? Boolean(is_recommended) : (isRecommended !== undefined ? Boolean(isRecommended) : true);
    const currPrice = parseFloat(price) || 0;
    const origPrice = parseFloat(originalPrice ?? originalprice ?? sale_price ?? price) || currPrice;
    const imgList = Array.isArray(images) && images.length > 0
        ? images
        : (image_url || image ? [image_url || image] : []);
    const imgUrl = imgList.length > 0 ? imgList[0] : '';
    const isFeatured = promoted !== undefined ? promoted : (is_featured || false);
    const stockQty = parseInt(product.stockQuantity ?? stock_quantity ?? quantity ?? stock) || 0;
    const parsedCatId = category_id ? parseInt(category_id) : null;
    const parsedSubcatId = subcategory_id ? parseInt(subcategory_id) : null;
    const shortDesc = short_description || shortDescription || shortdescription || '';
    const careInst = care_instructions || careInstructions || '';

    let specsVal = specifications || [];
    if (typeof specsVal === 'string') {
        try { specsVal = JSON.parse(specsVal); } catch(e) { specsVal = []; }
    }

    let nameOptsVal = name_options || nameOptions || [];
    if (typeof nameOptsVal === 'string') {
        try { nameOptsVal = JSON.parse(nameOptsVal); } catch(e) { nameOptsVal = []; }
    }
    if (!Array.isArray(nameOptsVal)) nameOptsVal = [];

    let prodDetailsVal = product_details || productDetails || [];
    if (typeof prodDetailsVal === 'string') {
        try { prodDetailsVal = JSON.parse(prodDetailsVal); } catch(e) { prodDetailsVal = []; }
    }
    if (!Array.isArray(prodDetailsVal)) prodDetailsVal = [];

    const result = await pool.query(
        `INSERT INTO products 
        (title, description, short_description, price, sale_price, category_id, brand, image_url, images, is_featured, is_recommended, is_active, stock_quantity, stock, quantity, sizes, colors, fabric, fit_type, care_instructions, style_code, subcategory_id, specifications, name_options, product_details, created_at, updated_at) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13, $13, $14, $15, $16, $17, $18, $19, $20, $21::jsonb, $22::jsonb, $23::jsonb, NOW(), NOW()) 
        RETURNING *`,
        [
            productTitle, description || '', shortDesc, currPrice, origPrice, parsedCatId,
            brand || 'House of Urvaah', imgUrl, imgList, isFeatured, recVal, activeVal !== false,
            stockQty, Array.isArray(sizes) ? sizes : ['XS', 'S', 'M', 'L'],
            Array.isArray(colors) ? colors : ['Default'],
            fabric || '', fit_type || '', careInst, style_code || '', parsedSubcatId,
            JSON.stringify(specsVal),
            JSON.stringify(nameOptsVal),
            JSON.stringify(prodDetailsVal)
        ]
    );
    return mapProduct(result.rows[0]);
};

exports.updateProduct = async (id, product) => {
    const {
        productname, title, description, shortDescription, short_description, shortdescription,
        price, originalprice, originalPrice, sale_price,
        category_id, brand, image, image_url, images, promoted, is_featured, is_recommended, isRecommended,
        quantity, stock_quantity, stock, active, is_active, sizes, colors,
        fabric, fit_type, care_instructions, careInstructions, style_code, subcategory_id,
        specifications, name_options, nameOptions, product_details, productDetails
    } = product;

    const productTitle = title || productname;
    const activeVal = active !== undefined ? active : is_active;
    const recVal = is_recommended !== undefined ? Boolean(is_recommended) : (isRecommended !== undefined ? Boolean(isRecommended) : undefined);
    const currPrice = price !== undefined ? parseFloat(price) : undefined;
    const origPrice = (originalPrice !== undefined || originalprice !== undefined || sale_price !== undefined)
        ? parseFloat(originalPrice ?? originalprice ?? sale_price)
        : undefined;
    const imgList = Array.isArray(images)
        ? images
        : (image_url || image ? [image_url || image] : undefined);
    const imgUrl = imgList && imgList.length > 0 ? imgList[0] : (image_url || image);
    const isFeatured = promoted !== undefined ? promoted : is_featured;
    const stockQty = (product.stockQuantity !== undefined || stock_quantity !== undefined || quantity !== undefined || stock !== undefined)
        ? parseInt(product.stockQuantity ?? stock_quantity ?? quantity ?? stock)
        : undefined;
    const parsedCatId = category_id ? parseInt(category_id) : undefined;
    const parsedSubcatId = subcategory_id ? parseInt(subcategory_id) : undefined;
    const shortDesc = short_description !== undefined ? short_description : (shortDescription !== undefined ? shortDescription : shortdescription);
    const careInst = care_instructions !== undefined ? care_instructions : careInstructions;

    let specsVal = specifications;
    if (specsVal !== undefined && typeof specsVal === 'string') {
        try { specsVal = JSON.parse(specsVal); } catch(e) {}
    }

    let nameOptsVal = name_options !== undefined ? name_options : nameOptions;
    if (nameOptsVal !== undefined && typeof nameOptsVal === 'string') {
        try { nameOptsVal = JSON.parse(nameOptsVal); } catch(e) {}
    }

    let prodDetailsVal = product_details !== undefined ? product_details : productDetails;
    if (prodDetailsVal !== undefined && typeof prodDetailsVal === 'string') {
        try { prodDetailsVal = JSON.parse(prodDetailsVal); } catch(e) {}
    }

    const result = await pool.query(
        `UPDATE products 
        SET title = COALESCE($2, title),
            description = COALESCE($3, description),
            short_description = COALESCE($4, short_description),
            price = COALESCE($5, price),
            sale_price = COALESCE($6, sale_price),
            category_id = COALESCE($7, category_id),
            brand = COALESCE($8, brand),
            image_url = COALESCE($9, image_url),
            images = COALESCE($10, images),
            is_featured = COALESCE($11, is_featured),
            is_recommended = COALESCE($12, is_recommended),
            is_active = COALESCE($13, is_active),
            stock_quantity = COALESCE($14, stock_quantity),
            stock = COALESCE($14, stock),
            quantity = COALESCE($14, quantity),
            sizes = COALESCE($15, sizes),
            colors = COALESCE($16, colors),
            fabric = COALESCE($17, fabric),
            fit_type = COALESCE($18, fit_type),
            care_instructions = COALESCE($19, care_instructions),
            style_code = COALESCE($20, style_code),
            subcategory_id = COALESCE($21, subcategory_id),
            specifications = COALESCE($22::jsonb, specifications),
            name_options = COALESCE($23::jsonb, name_options),
            product_details = COALESCE($24::jsonb, product_details),
            updated_at = NOW()
        WHERE product_id = $1::integer OR id = $1::integer
        RETURNING *`,
        [
            id, productTitle, description, shortDesc, currPrice, origPrice, parsedCatId,
            brand, imgUrl, imgList, isFeatured, recVal !== undefined ? recVal : null, activeVal, stockQty,
            sizes, colors, fabric, fit_type, careInst, style_code, parsedSubcatId,
            specsVal !== undefined ? JSON.stringify(specsVal) : null,
            nameOptsVal !== undefined ? JSON.stringify(nameOptsVal) : null,
            prodDetailsVal !== undefined ? JSON.stringify(prodDetailsVal) : null
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
