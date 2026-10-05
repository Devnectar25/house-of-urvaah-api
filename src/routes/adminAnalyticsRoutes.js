const express = require("express");
const router = express.Router();

const {
  getAdminAnalyticsSummary,
  getTopActiveUsers,
  getTopProducts,
  getTopCategories,
  getAnalyticsDrilldown,
  getDashboardStats,
  getDashboardSummary,
  getRevenueBreakdown
} = require("../controllers/analyticsController");

const { protect, authorize, checkPermission } = require("../middlewares/authMiddleware");

// All routes require admin role and analytics permission
router.use(protect, authorize('admin'), checkPermission('analytics'));

// GET /api/admin/analytics/summary
router.get("/summary", getAdminAnalyticsSummary);

// GET /api/admin/analytics/top-users
router.get("/top-users", getTopActiveUsers);

// GET /api/admin/analytics/top-products
router.get("/top-products", getTopProducts);

// GET /api/admin/analytics/top-categories
router.get("/top-categories", getTopCategories);

// GET /api/admin/analytics/revenue-breakdown
router.get("/revenue-breakdown", getRevenueBreakdown);

// GET /api/admin/analytics/drilldown
router.get("/drilldown", getAnalyticsDrilldown);

// GET /api/admin/analytics/dashboard-stats
router.get("/dashboard-stats", getDashboardStats);

// GET /api/admin/analytics/dashboard-summary
router.get("/dashboard-summary", getDashboardSummary);


module.exports = router;
