const pool = require('../config/db');

// ==========================================
// 1. HERO SLIDES
// ==========================================

// Public GET
exports.getPublicHeroSlides = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, heading, subheading, desktop_image, mobile_image, media_type, button_text, button_link, display_order 
       FROM ui_hero_slides 
       WHERE is_active = true 
       ORDER BY display_order ASC, id ASC`
    );
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    console.error('[UI] Error fetching public hero slides:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch hero slides', error: error.message });
  }
};

// Admin GET all
exports.getAdminHeroSlides = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM ui_hero_slides ORDER BY display_order ASC, id ASC`
    );
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    console.error('[UI] Error fetching admin hero slides:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch hero slides', error: error.message });
  }
};

// Admin Create
exports.createHeroSlide = async (req, res) => {
  try {
    const { heading, subheading, desktop_image, mobile_image, media_type, button_text, button_link, display_order, is_active } = req.body;

    if (!desktop_image) {
      return res.status(400).json({ success: false, message: 'Media (desktop_image) is required' });
    }

    const orderVal = Number.isInteger(display_order) ? display_order : 0;
    const activeVal = is_active !== undefined ? Boolean(is_active) : true;
    const mType = media_type || (desktop_image.endsWith('.mp4') ? 'video' : 'image');

    const result = await pool.query(
      `INSERT INTO ui_hero_slides 
        (heading, subheading, desktop_image, mobile_image, media_type, button_text, button_link, display_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [heading || '', subheading || '', desktop_image, mobile_image || '', mType, button_text || 'EXPLORE NOW', button_link || '/clothing', orderVal, activeVal]
    );

    res.status(201).json({ success: true, message: 'Hero slide created successfully', data: result.rows[0] });
  } catch (error) {
    console.error('[UI] Error creating hero slide:', error);
    res.status(500).json({ success: false, message: 'Failed to create hero slide', error: error.message });
  }
};

// Admin Update
exports.updateHeroSlide = async (req, res) => {
  try {
    const { id } = req.params;
    const { heading, subheading, desktop_image, mobile_image, media_type, button_text, button_link, display_order, is_active } = req.body;

    const existing = await pool.query('SELECT * FROM ui_hero_slides WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Hero slide not found' });
    }

    const current = existing.rows[0];
    const newDesktopImage = desktop_image !== undefined ? desktop_image : current.desktop_image;
    const newMediaType = media_type !== undefined ? media_type : (newDesktopImage.endsWith('.mp4') ? 'video' : current.media_type);

    const result = await pool.query(
      `UPDATE ui_hero_slides 
       SET heading = $1, 
           subheading = $2, 
           desktop_image = $3, 
           mobile_image = $4, 
           media_type = $5,
           button_text = $6, 
           button_link = $7, 
           display_order = $8, 
           is_active = $9,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $10
       RETURNING *`,
      [
        heading !== undefined ? heading : current.heading,
        subheading !== undefined ? subheading : current.subheading,
        newDesktopImage,
        mobile_image !== undefined ? mobile_image : current.mobile_image,
        newMediaType,
        button_text !== undefined ? button_text : current.button_text,
        button_link !== undefined ? button_link : current.button_link,
        display_order !== undefined ? display_order : current.display_order,
        is_active !== undefined ? is_active : current.is_active,
        id
      ]
    );

    res.json({ success: true, message: 'Hero slide updated successfully', data: result.rows[0] });
  } catch (error) {
    console.error('[UI] Error updating hero slide:', error);
    res.status(500).json({ success: false, message: 'Failed to update hero slide', error: error.message });
  }
};

// Admin Delete
exports.deleteHeroSlide = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM ui_hero_slides WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Hero slide not found' });
    }
    res.json({ success: true, message: 'Hero slide deleted successfully' });
  } catch (error) {
    console.error('[UI] Error deleting hero slide:', error);
    res.status(500).json({ success: false, message: 'Failed to delete hero slide', error: error.message });
  }
};

// Admin Reorder Slides
exports.reorderHeroSlides = async (req, res) => {
  try {
    const { items } = req.body; // array of { id, display_order }
    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'items array is required' });
    }

    for (const item of items) {
      await pool.query('UPDATE ui_hero_slides SET display_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
        item.display_order,
        item.id
      ]);
    }

    res.json({ success: true, message: 'Hero slides reordered successfully' });
  } catch (error) {
    console.error('[UI] Error reordering hero slides:', error);
    res.status(500).json({ success: false, message: 'Failed to reorder hero slides', error: error.message });
  }
};


// ==========================================
// 2. DUAL CAMPAIGN BANNER
// ==========================================

// Public GET
exports.getPublicDualCampaign = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, position, image, images, title, subtitle, button_text, link, is_active 
       FROM ui_dual_campaign 
       WHERE is_active = true 
       ORDER BY id ASC`
    );
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    console.error('[UI] Error fetching public dual campaign:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dual campaign banners', error: error.message });
  }
};

// Admin GET all
exports.getAdminDualCampaign = async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM ui_dual_campaign ORDER BY id ASC`);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    console.error('[UI] Error fetching admin dual campaign:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dual campaign banners', error: error.message });
  }
};

// Admin Update Banner Card (by position: 'top_left', 'bottom_left', 'top_right', 'bottom_right', or aliases 'left', 'right')
exports.updateDualCampaignCard = async (req, res) => {
  try {
    const { position } = req.params;
    let cleanPos = (position || '').toLowerCase().trim();

    // Map legacy positions if used
    if (cleanPos === 'left') cleanPos = 'top_left';
    if (cleanPos === 'right') cleanPos = 'top_right';

    const validPositions = ['top_left', 'bottom_left', 'top_right', 'bottom_right'];
    if (!validPositions.includes(cleanPos)) {
      return res.status(400).json({
        success: false,
        message: `Position must be one of: ${validPositions.join(', ')}`
      });
    }

    const { image, images, title, subtitle, button_text, link, is_active } = req.body;

    // Normalize images array (max 3 images)
    let imagesArr = null;
    if (Array.isArray(images)) {
      imagesArr = images.map((img) => (typeof img === 'string' ? img.trim() : '')).filter(Boolean).slice(0, 3);
    } else if (image) {
      imagesArr = [image.trim()];
    }

    const primaryImage = (imagesArr && imagesArr.length > 0) ? imagesArr[0] : (image || '');

    const result = await pool.query(
      `INSERT INTO ui_dual_campaign (position, image, images, title, subtitle, button_text, link, is_active, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
       ON CONFLICT (position) DO UPDATE
       SET image = COALESCE(NULLIF($2, ''), ui_dual_campaign.image),
           images = COALESCE($3::jsonb, ui_dual_campaign.images),
           title = COALESCE($4, ui_dual_campaign.title),
           subtitle = COALESCE($5, ui_dual_campaign.subtitle),
           button_text = COALESCE($6, ui_dual_campaign.button_text),
           link = COALESCE($7, ui_dual_campaign.link),
           is_active = COALESCE($8, ui_dual_campaign.is_active),
           updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        cleanPos,
        primaryImage,
        imagesArr ? JSON.stringify(imagesArr) : null,
        title,
        subtitle,
        button_text,
        link,
        is_active
      ]
    );

    res.json({
      success: true,
      message: `Dual campaign ${cleanPos} banner updated successfully`,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('[UI] Error updating dual campaign card:', error);
    res.status(500).json({ success: false, message: 'Failed to update dual campaign banner', error: error.message });
  }
};


// ==========================================
// 3. TRENDING ON THE GRAM
// ==========================================

// Public GET
exports.getPublicTrendingGram = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, image, media_type, caption, post_link, display_order,
              product_image, product_id, product_name, product_price, product_gallery
       FROM ui_trending_gram 
       WHERE is_active = true 
       ORDER BY display_order ASC, id ASC`
    );
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    console.error('[UI] Error fetching public trending gram:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch Trending on the Gram posts', error: error.message });
  }
};

// Admin GET all
exports.getAdminTrendingGram = async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM ui_trending_gram ORDER BY display_order ASC, id ASC`);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    console.error('[UI] Error fetching admin trending gram:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch Trending on the Gram posts', error: error.message });
  }
};

// Admin Create Post
exports.createTrendingGramPost = async (req, res) => {
  try {
    const {
      title,
      image,
      media_type,
      caption,
      post_link,
      display_order,
      is_active,
      product_image,
      product_id,
      product_name,
      product_price,
      product_gallery
    } = req.body;

    if (!image) {
      return res.status(400).json({ success: false, message: 'Image or video URL is required' });
    }

    let mType = media_type;
    if (image && typeof image === 'string') {
      const cleanImg = image.split('?')[0].toLowerCase();
      if (cleanImg.endsWith('.mp4') || cleanImg.endsWith('.webm') || cleanImg.endsWith('.mov') || cleanImg.includes('/videos/') || cleanImg.includes('/video/')) {
        mType = 'video';
      } else if (cleanImg.endsWith('.jpg') || cleanImg.endsWith('.jpeg') || cleanImg.endsWith('.png') || cleanImg.endsWith('.webp') || cleanImg.endsWith('.avif')) {
        mType = 'image';
      }
    }
    if (!mType) mType = 'video';
    const orderVal = Number.isInteger(display_order) ? display_order : 0;
    const activeVal = is_active !== undefined ? Boolean(is_active) : true;
    const galleryVal = Array.isArray(product_gallery)
      ? JSON.stringify(product_gallery)
      : (product_gallery ? JSON.stringify([product_gallery]) : null);

    const result = await pool.query(
      `INSERT INTO ui_trending_gram (
         title, image, media_type, caption, post_link, display_order, is_active,
         product_image, product_id, product_name, product_price, product_gallery
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
       RETURNING *`,
      [
        title || '',
        image,
        mType,
        caption || '',
        post_link || 'https://www.instagram.com/houseofurvaah/',
        orderVal,
        activeVal,
        product_image || null,
        product_id || null,
        product_name || null,
        product_price || null,
        galleryVal
      ]
    );

    res.status(201).json({ success: true, message: 'Post added successfully', data: result.rows[0] });
  } catch (error) {
    console.error('[UI] Error creating trending gram post:', error);
    res.status(500).json({ success: false, message: 'Failed to add post', error: error.message });
  }
};

// Admin Update Post
exports.updateTrendingGramPost = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      image,
      media_type,
      caption,
      post_link,
      display_order,
      is_active,
      product_image,
      product_id,
      product_name,
      product_price,
      product_gallery
    } = req.body;

    const existing = await pool.query('SELECT * FROM ui_trending_gram WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const current = existing.rows[0];
    const newImage = image !== undefined ? image : current.image;
    let newMediaType = media_type !== undefined ? media_type : current.media_type;

    if (newImage && typeof newImage === 'string') {
      const cleanImg = newImage.split('?')[0].toLowerCase();
      if (cleanImg.endsWith('.mp4') || cleanImg.endsWith('.webm') || cleanImg.endsWith('.mov') || cleanImg.includes('/videos/') || cleanImg.includes('/video/')) {
        newMediaType = 'video';
      } else if (cleanImg.endsWith('.jpg') || cleanImg.endsWith('.jpeg') || cleanImg.endsWith('.png') || cleanImg.endsWith('.webp') || cleanImg.endsWith('.avif')) {
        newMediaType = 'image';
      }
    }
    if (!newMediaType) newMediaType = 'video';

    const newProductImage = product_image !== undefined ? product_image : current.product_image;
    const newProductId = product_id !== undefined ? product_id : current.product_id;
    const newProductName = product_name !== undefined ? product_name : current.product_name;
    const newProductPrice = product_price !== undefined ? product_price : current.product_price;
    const newProductGallery = product_gallery !== undefined
      ? (Array.isArray(product_gallery) ? JSON.stringify(product_gallery) : (product_gallery ? JSON.stringify([product_gallery]) : null))
      : (current.product_gallery ? JSON.stringify(current.product_gallery) : null);

    const result = await pool.query(
      `UPDATE ui_trending_gram
       SET title = $1,
           image = $2,
           media_type = $3,
           caption = $4,
           post_link = $5,
           display_order = $6,
           is_active = $7,
           product_image = $8,
           product_id = $9,
           product_name = $10,
           product_price = $11,
           product_gallery = $12::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $13
       RETURNING *`,
      [
        title !== undefined ? title : current.title,
        newImage,
        newMediaType,
        caption !== undefined ? caption : current.caption,
        post_link !== undefined ? post_link : current.post_link,
        display_order !== undefined ? display_order : current.display_order,
        is_active !== undefined ? is_active : current.is_active,
        newProductImage,
        newProductId,
        newProductName,
        newProductPrice,
        newProductGallery,
        id
      ]
    );

    res.json({ success: true, message: 'Post updated successfully', data: result.rows[0] });
  } catch (error) {
    console.error('[UI] Error updating trending gram post:', error);
    res.status(500).json({ success: false, message: 'Failed to update post', error: error.message });
  }
};

// Admin Delete Post
exports.deleteTrendingGramPost = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM ui_trending_gram WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }
    res.json({ success: true, message: 'Post deleted successfully' });
  } catch (error) {
    console.error('[UI] Error deleting trending gram post:', error);
    res.status(500).json({ success: false, message: 'Failed to delete post', error: error.message });
  }
};

// Admin Reorder Posts
exports.reorderTrendingGramPosts = async (req, res) => {
  try {
    const { items } = req.body; // array of { id, display_order }
    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'items array is required' });
    }

    for (const item of items) {
      await pool.query('UPDATE ui_trending_gram SET display_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
        item.display_order,
        item.id
      ]);
    }

    res.json({ success: true, message: 'Posts reordered successfully' });
  } catch (error) {
    console.error('[UI] Error reordering trending gram posts:', error);
    res.status(500).json({ success: false, message: 'Failed to reorder posts', error: error.message });
  }
};


// ==========================================
// 4. FABRIC VIDEO
// ==========================================

// Public GET
exports.getPublicFabricVideo = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT video_url, poster_url, heading, subheading, description, button_text, button_link, 
              secondary_button_text, secondary_button_link, autoplay, muted, loop_video, videos 
       FROM ui_fabric_video 
       WHERE is_active = true 
       ORDER BY id ASC 
       LIMIT 1`
    );
    res.json({ success: true, data: result.rows[0] || null });
  } catch (error) {
    console.error('[UI] Error fetching public fabric video:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch fabric video configuration', error: error.message });
  }
};

// Admin GET
exports.getAdminFabricVideo = async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM ui_fabric_video ORDER BY id ASC LIMIT 1`);
    res.json({ success: true, data: result.rows[0] || null });
  } catch (error) {
    console.error('[UI] Error fetching admin fabric video:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch fabric video configuration', error: error.message });
  }
};

// Admin Update (single row configuration)
exports.updateFabricVideo = async (req, res) => {
  try {
    const {
      video_url,
      poster_url,
      heading,
      subheading,
      description,
      button_text,
      button_link,
      secondary_button_text,
      secondary_button_link,
      autoplay,
      muted,
      loop_video,
      is_active,
      videos
    } = req.body;

    let sanitizedVideos = null;
    if (Array.isArray(videos)) {
      sanitizedVideos = videos.slice(0, 10).map((v, idx) => {
        const tag = typeof v?.tag === 'string' ? v.tag.trim() : '';
        const derivedSlug = tag ? tag.toLowerCase().replace(/[^a-z0-9]+/g, '-') : (v?.id || `video-${idx + 1}`);
        return {
          id: v?.id || `video-${idx + 1}`,
          tag,
          title: typeof v?.title === 'string' ? v.title.trim() : (typeof v?.name === 'string' ? v.name.trim() : ''),
          slug: v?.slug || v?.fabric_slug || derivedSlug,
          fabric_slug: v?.fabric_slug || v?.slug || derivedSlug,
          description: typeof v?.description === 'string' ? v.description.trim() : '',
          video_url: typeof v?.video_url === 'string' ? v.video_url.trim() : (typeof v?.url === 'string' ? v.url.trim() : ''),
          poster_url: typeof v?.poster_url === 'string' ? v.poster_url.trim() : ''
        };
      });
    }

    const existing = await pool.query('SELECT * FROM ui_fabric_video ORDER BY id ASC LIMIT 1');

    let result;
    if (existing.rows.length === 0) {
      result = await pool.query(
        `INSERT INTO ui_fabric_video 
          (video_url, poster_url, heading, subheading, description, button_text, button_link, 
           secondary_button_text, secondary_button_link, autoplay, muted, loop_video, is_active, videos)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
         RETURNING *`,
        [
          video_url || '',
          poster_url || '',
          heading || 'LUXURY TEXTILE ARTISTRY',
          subheading || 'EDITORIAL VISION',
          description || 'Discover the sensory elegance of our mastercrafted fabrics: mulberry silk, structured linens, and couture jacquards.',
          button_text || 'EXPLORE FABRICS',
          button_link || '/clothing',
          secondary_button_text || 'VIEW CAMPAIGN FILM',
          secondary_button_link || '#campaign',
          autoplay !== undefined ? autoplay : true,
          muted !== undefined ? muted : true,
          loop_video !== undefined ? loop_video : true,
          is_active !== undefined ? is_active : true,
          sanitizedVideos ? JSON.stringify(sanitizedVideos) : '[]'
        ]
      );
    } else {
      const current = existing.rows[0];
      result = await pool.query(
        `UPDATE ui_fabric_video
         SET video_url = COALESCE($1, video_url),
             poster_url = COALESCE($2, poster_url),
             heading = COALESCE($3, heading),
             subheading = COALESCE($4, subheading),
             description = COALESCE($5, description),
             button_text = COALESCE($6, button_text),
             button_link = COALESCE($7, button_link),
             secondary_button_text = COALESCE($8, secondary_button_text),
             secondary_button_link = COALESCE($9, secondary_button_link),
             autoplay = COALESCE($10, autoplay),
             muted = COALESCE($11, muted),
             loop_video = COALESCE($12, loop_video),
             is_active = COALESCE($13, is_active),
             videos = COALESCE($14::jsonb, videos),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $15
         RETURNING *`,
        [
          video_url !== undefined ? video_url : current.video_url,
          poster_url !== undefined ? poster_url : current.poster_url,
          heading !== undefined ? heading : current.heading,
          subheading !== undefined ? subheading : current.subheading,
          description !== undefined ? description : current.description,
          button_text !== undefined ? button_text : current.button_text,
          button_link !== undefined ? button_link : current.button_link,
          secondary_button_text !== undefined ? secondary_button_text : current.secondary_button_text,
          secondary_button_link !== undefined ? secondary_button_link : current.secondary_button_link,
          autoplay !== undefined ? autoplay : current.autoplay,
          muted !== undefined ? muted : current.muted,
          loop_video !== undefined ? loop_video : current.loop_video,
          is_active !== undefined ? is_active : current.is_active,
          sanitizedVideos ? JSON.stringify(sanitizedVideos) : null,
          current.id
        ]
      );
    }

    res.json({ success: true, message: 'Fabric video configuration updated successfully', data: result.rows[0] });
  } catch (error) {
    console.error('[UI] Error updating fabric video:', error);
    res.status(500).json({ success: false, message: 'Failed to update fabric video', error: error.message });
  }
};

// ==========================================
// 5. CUSTOMER CARE & BOUTIQUE LOCATIONS
// ==========================================

// Public GET: Contact Info (Customer Care + Active Boutiques)
exports.getPublicContactInfo = async (req, res) => {
  try {
    // Independent reads: run in parallel (one DB round trip of latency instead of two)
    const [conciergeResult, boutiquesResult] = await Promise.all([
      pool.query(
        `SELECT section_badge, section_title, email, phone, hours FROM ui_concierge_settings ORDER BY id ASC LIMIT 1`
      ),
      pool.query(
        `SELECT id, section_badge, section_title, name, address, phone, is_primary, display_order
         FROM ui_boutique_locations
         WHERE is_active = true
         ORDER BY display_order ASC, id ASC`
      )
    ]);

    let concierge = conciergeResult.rows[0];
    if (!concierge) {
      concierge = {
        section_badge: 'CLIENT SERVICES',
        section_title: 'CUSTOMER CARE',
        email: 'houseofurvaah@gmail.com',
        phone: '+91 98333 25657',
        hours: 'Monday – Saturday: 10:00 AM – 8:00 PM IST'
      };
    }

    const locations = boutiquesResult.rows;
    const headerInfo = locations[0] || {
      section_badge: 'FLAGSHIP BOUTIQUES',
      section_title: 'STORE LOCATIONS'
    };

    const primaryLocation = locations.find(l => l.is_primary) || locations[0] || null;

    res.json({
      success: true,
      data: {
        concierge,
        boutiques: {
          section_badge: headerInfo.section_badge || 'FLAGSHIP BOUTIQUES',
          section_title: headerInfo.section_title || 'STORE LOCATIONS',
          locations
        },
        primary_location: primaryLocation
      }
    });
  } catch (error) {
    console.error('[UI] Error fetching public contact info:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch contact details', error: error.message });
  }
};

// Admin GET: Contact Info (Customer Care + All Boutiques)
exports.getAdminContactInfo = async (req, res) => {
  try {
    let conciergeResult = await pool.query(
      `SELECT * FROM ui_concierge_settings ORDER BY id ASC LIMIT 1`
    );

    let concierge = conciergeResult.rows[0];
    if (!concierge) {
      const inserted = await pool.query(
        `INSERT INTO ui_concierge_settings (section_badge, section_title, email, phone, hours)
         VALUES ('CLIENT SERVICES', 'CUSTOMER CARE', 'houseofurvaah@gmail.com', '+91 98333 25657', 'Monday – Saturday: 10:00 AM – 8:00 PM IST')
         RETURNING *`
      );
      concierge = inserted.rows[0];
    }

    const boutiquesResult = await pool.query(
      `SELECT * FROM ui_boutique_locations ORDER BY display_order ASC, id ASC`
    );

    const locations = boutiquesResult.rows;
    const headerInfo = locations[0] || {
      section_badge: 'FLAGSHIP BOUTIQUES',
      section_title: 'STORE LOCATIONS'
    };

    res.json({
      success: true,
      data: {
        concierge,
        boutiques: {
          section_badge: headerInfo.section_badge || 'FLAGSHIP BOUTIQUES',
          section_title: headerInfo.section_title || 'STORE LOCATIONS',
          locations
        }
      }
    });
  } catch (error) {
    console.error('[UI] Error fetching admin contact info:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch contact info', error: error.message });
  }
};

// Admin PUT: Update Customer Care Settings
exports.updateConciergeSettings = async (req, res) => {
  try {
    const { section_badge, section_title, email, phone, hours } = req.body;

    const currentCheck = await pool.query(`SELECT id FROM ui_concierge_settings ORDER BY id ASC LIMIT 1`);
    let result;

    if (currentCheck.rows.length === 0) {
      result = await pool.query(
        `INSERT INTO ui_concierge_settings (section_badge, section_title, email, phone, hours)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          section_badge || 'CLIENT SERVICES',
          section_title || 'CUSTOMER CARE',
          email || 'houseofurvaah@gmail.com',
          phone || '+91 98333 25657',
          hours || 'Monday – Saturday: 10:00 AM – 8:00 PM IST'
        ]
      );
    } else {
      const id = currentCheck.rows[0].id;
      result = await pool.query(
        `UPDATE ui_concierge_settings
         SET section_badge = COALESCE($1, section_badge),
             section_title = COALESCE($2, section_title),
             email = COALESCE($3, email),
             phone = COALESCE($4, phone),
             hours = COALESCE($5, hours),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $6
         RETURNING *`,
        [section_badge, section_title, email, phone, hours, id]
      );
    }

    res.json({
      success: true,
      message: 'Customer Care services updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('[UI] Error updating customer care settings:', error);
    res.status(500).json({ success: false, message: 'Failed to update customer care settings', error: error.message });
  }
};

// Admin PUT: Update Boutiques Section Headers (Badge & Title)
exports.updateBoutiquesHeader = async (req, res) => {
  try {
    const { section_badge, section_title } = req.body;

    await pool.query(
      `UPDATE ui_boutique_locations
       SET section_badge = COALESCE($1, section_badge),
           section_title = COALESCE($2, section_title),
           updated_at = CURRENT_TIMESTAMP`,
      [section_badge, section_title]
    );

    res.json({
      success: true,
      message: 'Boutique locations header updated successfully'
    });
  } catch (error) {
    console.error('[UI] Error updating boutiques header:', error);
    res.status(500).json({ success: false, message: 'Failed to update boutique header', error: error.message });
  }
};

// Admin POST: Add New Boutique Location
exports.createBoutiqueLocation = async (req, res) => {
  try {
    const { name, address, phone, is_primary, display_order, is_active, section_badge, section_title } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Location name is required' });
    }
    if (!address || !address.trim()) {
      return res.status(400).json({ success: false, message: 'Location address is required' });
    }

    const isPrimaryVal = Boolean(is_primary);

    // If marked as primary, unmark other locations
    if (isPrimaryVal) {
      await pool.query(`UPDATE ui_boutique_locations SET is_primary = false`);
    }

    // Default display order to max + 1
    let orderVal = display_order;
    if (orderVal === undefined || orderVal === null) {
      const maxOrderRes = await pool.query(`SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM ui_boutique_locations`);
      orderVal = maxOrderRes.rows[0].next_order;
    }

    // Use existing badge & title if not provided
    const existingHeaderRes = await pool.query(`SELECT section_badge, section_title FROM ui_boutique_locations LIMIT 1`);
    const badgeVal = section_badge || (existingHeaderRes.rows[0]?.section_badge) || 'FLAGSHIP BOUTIQUES';
    const titleVal = section_title || (existingHeaderRes.rows[0]?.section_title) || 'STORE LOCATIONS';

    const result = await pool.query(
      `INSERT INTO ui_boutique_locations 
        (section_badge, section_title, name, address, phone, is_primary, display_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [badgeVal, titleVal, name.trim(), address.trim(), phone ? phone.trim() : '', isPrimaryVal, orderVal, is_active !== undefined ? Boolean(is_active) : true]
    );

    res.status(201).json({
      success: true,
      message: 'Boutique location created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('[UI] Error creating boutique location:', error);
    res.status(500).json({ success: false, message: 'Failed to create boutique location', error: error.message });
  }
};

// Admin PUT: Update Boutique Location
exports.updateBoutiqueLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, phone, is_primary, display_order, is_active } = req.body;

    const existingCheck = await pool.query(`SELECT * FROM ui_boutique_locations WHERE id = $1`, [id]);
    if (existingCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Boutique location not found' });
    }

    const isPrimaryVal = is_primary !== undefined ? Boolean(is_primary) : existingCheck.rows[0].is_primary;

    if (isPrimaryVal) {
      await pool.query(`UPDATE ui_boutique_locations SET is_primary = false WHERE id != $1`, [id]);
    }

    const result = await pool.query(
      `UPDATE ui_boutique_locations
       SET name = COALESCE($1, name),
           address = COALESCE($2, address),
           phone = COALESCE($3, phone),
           is_primary = $4,
           display_order = COALESCE($5, display_order),
           is_active = COALESCE($6, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [
        name !== undefined ? name.trim() : null,
        address !== undefined ? address.trim() : null,
        phone !== undefined ? phone.trim() : null,
        isPrimaryVal,
        display_order !== undefined ? Number(display_order) : null,
        is_active !== undefined ? Boolean(is_active) : null,
        id
      ]
    );

    res.json({
      success: true,
      message: 'Boutique location updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('[UI] Error updating boutique location:', error);
    res.status(500).json({ success: false, message: 'Failed to update boutique location', error: error.message });
  }
};

// Admin DELETE: Delete Boutique Location
exports.deleteBoutiqueLocation = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await pool.query(`DELETE FROM ui_boutique_locations WHERE id = $1 RETURNING *`, [id]);
    if (deleted.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Boutique location not found' });
    }

    // If the deleted location was primary, make the first remaining location primary
    if (deleted.rows[0].is_primary) {
      const remaining = await pool.query(`SELECT id FROM ui_boutique_locations ORDER BY display_order ASC, id ASC LIMIT 1`);
      if (remaining.rows.length > 0) {
        await pool.query(`UPDATE ui_boutique_locations SET is_primary = true WHERE id = $1`, [remaining.rows[0].id]);
      }
    }

    res.json({
      success: true,
      message: 'Boutique location deleted successfully'
    });
  } catch (error) {
    console.error('[UI] Error deleting boutique location:', error);
    res.status(500).json({ success: false, message: 'Failed to delete boutique location', error: error.message });
  }
};

// Admin PUT: Reorder Boutique Locations
exports.reorderBoutiqueLocations = async (req, res) => {
  try {
    const { orders } = req.body; // Array of { id, display_order }
    if (!Array.isArray(orders)) {
      return res.status(400).json({ success: false, message: 'Invalid reorder payload. Array expected.' });
    }

    for (const item of orders) {
      if (item.id && typeof item.display_order === 'number') {
        await pool.query(
          `UPDATE ui_boutique_locations SET display_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [item.display_order, item.id]
        );
      }
    }

    res.json({ success: true, message: 'Boutique locations reordered successfully' });
  } catch (error) {
    console.error('[UI] Error reordering boutique locations:', error);
    res.status(500).json({ success: false, message: 'Failed to reorder boutique locations', error: error.message });
  }
};

