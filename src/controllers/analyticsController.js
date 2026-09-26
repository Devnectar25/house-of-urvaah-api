const analyticsService = require("../ga/analyticsService.cjs");

/**
 * GET /api/admin/analytics/summary
 * Returns basic GA analytics for admin dashboard
 */
async function getAdminAnalyticsSummary(req, res) {
  try {
    const { period } = req.query;
    const summary = await analyticsService.getAdminAnalyticsSummary(period);

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Analytics Controller Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch analytics data",
      error: error.message
    });
  }
}

/**
 * GET /api/admin/analytics/top-users
 * Returns top active users by sessions
 */
async function getTopActiveUsers(req, res) {
  try {
    const { period, limit } = req.query;
    const users = await analyticsService.getTopActiveUsers(
      period || '7d',
      limit ? parseInt(limit) : 15
    );

    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error("Top Users Controller Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch top users data",
    });
  }
}

/**
 * GET /api/admin/analytics/top-products
 * Returns top products by revenue or orders
 */
async function getTopProducts(req, res) {
  try {
    const { period, limit, sortBy } = req.query;
    const products = await analyticsService.getTopProducts(
      period || '7d',
      limit ? parseInt(limit) : 5,
      sortBy || 'revenue'
    );

    res.status(200).json({
      success: true,
      data: products,
    });
  } catch (error) {
    console.error("Top Products Controller Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch top products data",
    });
  }
}

/**
 * GET /api/admin/analytics/top-categories
 * Returns top categories by revenue or orders
 */
async function getTopCategories(req, res) {
  try {
    const { period, limit, sortBy } = req.query;
    const categories = await analyticsService.getTopCategories(
      period || '7d',
      limit ? parseInt(limit) : 5,
      sortBy || 'revenue'
    );

    res.status(200).json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error("Top Categories Controller Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch top categories data",
    });
  }
}

/**
 * GET /api/admin/analytics/drilldown
 * Returns detailed list for KPI cards (Users, Orders, Revenue)
 */
async function getAnalyticsDrilldown(req, res) {
  try {
    const { type, period, sortBy } = req.query;
    let data = [];

    switch (type) {
      case 'total_users':
        data = await analyticsService.getAllAnalyticsUsers(100);
        break;
      case 'active_users':
        data = await analyticsService.getTopActiveUsers(period || '7d', 100);
        break;
      case 'orders':
      case 'total_orders':
      case 'total_revenue':
      case 'revenue':
        data = await analyticsService.getAnalyticsOrders(period || '7d', 100);
        break;
      case 'top_products':
        data = await analyticsService.getTopProducts(period || '7d', 50, sortBy || 'revenue');
        break;
      case 'potential_users':
        data = await analyticsService.getPotentialUsers(period || '7d', 100);
        break;
      case 'top_categories':
        data = await analyticsService.getTopCategories(period || '7d', 50, sortBy || 'revenue');
        break;
      default:
        return res.status(400).json({ success: false, message: 'Invalid drilldown type' });
    }

    res.status(200).json({
      success: true,
      data: data,
    });
  } catch (error) {
    console.error("Drilldown Controller Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch drilldown data",
    });
  }
}

/**
 * GET /api/admin/analytics/dashboard-stats
 * Returns counts for Brands, Categories, Products, Tips, Orders
 */
async function getDashboardStats(req, res) {
  try {
    const stats = await analyticsService.getDashboardEntityCounts();
    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Dashboard Stats Controller Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard stats",
      error: error.message
    });
  }
}

/**
 * POST /api/analytics/track
 * Track an analytics event
 */
async function trackEvent(req, res) {
  try {
    const { eventName, userId, sessionId, metadata } = req.body;

    if (!eventName) {
      return res.status(400).json({ success: false, message: "Event name is required" });
    }

    await analyticsService.trackEvent(eventName, userId, sessionId, metadata);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Track Event Controller Error:", error);
    res.status(500).json({ success: false, message: "Failed to track event" });
  }
}

/**
 * GET /api/admin/dashboard-summary
 * Returns aggregated entity counts tailored for House of Urvaah fashion catalog
 */
async function getDashboardSummary(req, res) {
  try {
    const pool = require("../config/db");
    const [
      products,
      categories,
      subcategories,
      orders,
      delivered,
      pending,
      processing,
      cancelled,
      users,
      coupons,
      reviews
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM products').catch(() => ({ rows: [{ count: 0 }] })),
      pool.query('SELECT COUNT(*) as count FROM category').catch(() => ({ rows: [{ count: 0 }] })),
      pool.query('SELECT COUNT(*) as count FROM subcategories').catch(() => ({ rows: [{ count: 0 }] })),
      pool.query('SELECT COUNT(*) as count FROM orders').catch(() => ({ rows: [{ count: 0 }] })),
      pool.query("SELECT COUNT(*) as count FROM orders WHERE (payment_method = 'cod' OR payment_status != 'Pending') AND status = 'Delivered'").catch(() => ({ rows: [{ count: 0 }] })),
      pool.query("SELECT COUNT(*) as count FROM orders WHERE (payment_method = 'cod' OR payment_status != 'Pending') AND status = 'Pending'").catch(() => ({ rows: [{ count: 0 }] })),
      pool.query("SELECT COUNT(*) as count FROM orders WHERE (payment_method = 'cod' OR payment_status != 'Pending') AND status = 'Processing'").catch(() => ({ rows: [{ count: 0 }] })),
      pool.query("SELECT COUNT(*) as count FROM orders WHERE status IN ('Cancelled', 'Cancellation Requested', 'Refunded')").catch(() => ({ rows: [{ count: 0 }] })),
      pool.query('SELECT COUNT(*) as count FROM public.users').catch(() => ({ rows: [{ count: 0 }] })),
      pool.query("SELECT COUNT(*) as count FROM coupons WHERE active = true").catch(() => ({ rows: [{ count: 0 }] })),
      pool.query('SELECT COUNT(*) as count FROM reviews').catch(() => ({ rows: [{ count: 0 }] }))
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalProducts: parseInt(products.rows[0]?.count) || 0,
        totalCategories: parseInt(categories.rows[0]?.count) || 0,
        totalSubcategories: parseInt(subcategories.rows[0]?.count) || 0,
        totalOrders: parseInt(orders.rows[0]?.count) || 0,
        deliveredOrders: parseInt(delivered.rows[0]?.count) || 0,
        pendingOrders: parseInt(pending.rows[0]?.count) || 0,
        processingOrders: parseInt(processing.rows[0]?.count) || 0,
        cancelledOrders: parseInt(cancelled.rows[0]?.count) || 0,
        totalCustomers: parseInt(users.rows[0]?.count) || 0,
        activeCoupons: parseInt(coupons.rows[0]?.count) || 0,
        totalReviews: parseInt(reviews.rows[0]?.count) || 0
      }
    });
  } catch (error) {
    console.error("Dashboard Summary Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load dashboard summary",
      error: error.message
    });
  }
}

module.exports = {
  getAdminAnalyticsSummary,
  getTopActiveUsers,
  getTopProducts,
  getTopCategories,
  getAnalyticsDrilldown,
  getDashboardStats,
  getDashboardSummary,
  trackEvent
};
