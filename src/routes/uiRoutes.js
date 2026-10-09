const express = require('express');
const router = express.Router();
const uiController = require('../controllers/uiController');
const { protect, authorize } = require('../middlewares/authMiddleware');

const adminGuard = [protect, authorize('admin', 'super_admin')];

// ==========================================
// PUBLIC READ-ONLY ROUTES
// ==========================================
router.get('/hero', uiController.getPublicHeroSlides);
router.get('/dual-campaign', uiController.getPublicDualCampaign);
router.get('/trending-gram', uiController.getPublicTrendingGram);
router.get('/fabric-video', uiController.getPublicFabricVideo);

// ==========================================
// SECURED ADMIN ROUTES
// ==========================================

// 1. Hero Slides
router.get('/admin/hero', ...adminGuard, uiController.getAdminHeroSlides);
router.post('/admin/hero', ...adminGuard, uiController.createHeroSlide);
router.put('/admin/hero/reorder', ...adminGuard, uiController.reorderHeroSlides);
router.put('/admin/hero/:id', ...adminGuard, uiController.updateHeroSlide);
router.delete('/admin/hero/:id', ...adminGuard, uiController.deleteHeroSlide);

// 2. Dual Campaign Banner
router.get('/admin/dual-campaign', ...adminGuard, uiController.getAdminDualCampaign);
router.put('/admin/dual-campaign/:position', ...adminGuard, uiController.updateDualCampaignCard);

// 3. Trending on the Gram
router.get('/admin/trending-gram', ...adminGuard, uiController.getAdminTrendingGram);
router.post('/admin/trending-gram', ...adminGuard, uiController.createTrendingGramPost);
router.put('/admin/trending-gram/reorder', ...adminGuard, uiController.reorderTrendingGramPosts);
router.put('/admin/trending-gram/:id', ...adminGuard, uiController.updateTrendingGramPost);
router.delete('/admin/trending-gram/:id', ...adminGuard, uiController.deleteTrendingGramPost);

// 4. Fabric Video
router.get('/admin/fabric-video', ...adminGuard, uiController.getAdminFabricVideo);
router.put('/admin/fabric-video', ...adminGuard, uiController.updateFabricVideo);

module.exports = router;
