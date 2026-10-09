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
      `SELECT id, title, image, media_type, caption, post_link, display_order 
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
    const { title, image, media_type, caption, post_link, display_order, is_active } = req.body;

    if (!image) {
      return res.status(400).json({ success: false, message: 'Image or video URL is required' });
    }

    const mType = media_type || (image.endsWith('.mp4') ? 'video' : 'image');
    const orderVal = Number.isInteger(display_order) ? display_order : 0;
    const activeVal = is_active !== undefined ? Boolean(is_active) : true;

    const result = await pool.query(
      `INSERT INTO ui_trending_gram (title, image, media_type, caption, post_link, display_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [title || '', image, mType, caption || '', post_link || 'https://www.instagram.com/houseofurvaah/', orderVal, activeVal]
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
    const { title, image, media_type, caption, post_link, display_order, is_active } = req.body;

    const existing = await pool.query('SELECT * FROM ui_trending_gram WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const current = existing.rows[0];
    const newImage = image !== undefined ? image : current.image;
    const newMediaType = media_type !== undefined ? media_type : (newImage.endsWith('.mp4') ? 'video' : current.media_type);

    const result = await pool.query(
      `UPDATE ui_trending_gram
       SET title = $1,
           image = $2,
           media_type = $3,
           caption = $4,
           post_link = $5,
           display_order = $6,
           is_active = $7,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [
        title !== undefined ? title : current.title,
        newImage,
        newMediaType,
        caption !== undefined ? caption : current.caption,
        post_link !== undefined ? post_link : current.post_link,
        display_order !== undefined ? display_order : current.display_order,
        is_active !== undefined ? is_active : current.is_active,
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
      `SELECT video_url, poster_url, heading, description, button_text, button_link, autoplay, muted, loop_video 
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
    const { video_url, poster_url, heading, description, button_text, button_link, autoplay, muted, loop_video, is_active } = req.body;

    const existing = await pool.query('SELECT * FROM ui_fabric_video ORDER BY id ASC LIMIT 1');

    let result;
    if (existing.rows.length === 0) {
      result = await pool.query(
        `INSERT INTO ui_fabric_video 
          (video_url, poster_url, heading, description, button_text, button_link, autoplay, muted, loop_video, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          video_url || '',
          poster_url || '',
          heading || 'THE ART OF REFINED TAILORING',
          description || '',
          button_text || 'DISCOVER THE COLLECTION',
          button_link || '#lookbook',
          autoplay !== undefined ? autoplay : true,
          muted !== undefined ? muted : true,
          loop_video !== undefined ? loop_video : true,
          is_active !== undefined ? is_active : true
        ]
      );
    } else {
      const current = existing.rows[0];
      result = await pool.query(
        `UPDATE ui_fabric_video
         SET video_url = COALESCE($1, video_url),
             poster_url = COALESCE($2, poster_url),
             heading = COALESCE($3, heading),
             description = COALESCE($4, description),
             button_text = COALESCE($5, button_text),
             button_link = COALESCE($6, button_link),
             autoplay = COALESCE($7, autoplay),
             muted = COALESCE($8, muted),
             loop_video = COALESCE($9, loop_video),
             is_active = COALESCE($10, is_active),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $11
         RETURNING *`,
        [
          video_url,
          poster_url,
          heading,
          description,
          button_text,
          button_link,
          autoplay,
          muted,
          loop_video,
          is_active,
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
