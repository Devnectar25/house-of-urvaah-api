const express = require('express');
const session = require('express-session');
const passport = require('./config/passport'); // Social login configuration

const cors = require('cors');

const productRoutes = require('./routes/productRoutes');
const brandRoutes = require('./routes/brandRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const authRoutes = require('./routes/authRoutes');
const subcategoryRoutes = require('./routes/subcategoryRoutes');
const healthTipRoutes = require('./routes/healthTipRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const adminAnalyticsRoutes = require("./routes/adminAnalyticsRoutes");

const app = express();
app.set('trust proxy', 1);

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Express CORS middleware using cors package with explicit allowed origins & credentials: true
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://house-of-urvaah-fe.vercel.app'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin) || /^https:\/\/.*\.vercel\.app$/.test(origin)) {
            callback(null, true);
        } else {
            callback(null, false);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Access-Control-Request-Method', 'Access-Control-Request-Headers'],
    maxAge: 86400
}));

// Respond immediately to OPTIONS preflight requests across all endpoints
app.options('*', cors());

// Cookie parser middleware
app.use((req, res, next) => {
    req.cookies = req.cookies || {};
    if (req.headers.cookie) {
        req.headers.cookie.split(';').forEach(cookie => {
            const parts = cookie.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const val = parts.slice(1).join('=').trim();
                try {
                    req.cookies[key] = decodeURIComponent(val);
                } catch (e) {
                    req.cookies[key] = val;
                }
            }
        });
    }
    next();
});


// ⭐ IMPORTANT: Upload routes must come BEFORE the manual body parser
// to ensure the stream is not consumed or interfered with.
app.use('/api/upload', uploadRoutes);

// Standard JSON & URL-encoded body parsers for local and Vercel serverless
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session middleware (MUST be before passport)
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());



// ⭐ IMPORTANT — Attach API route
const orderController = require('./controllers/orderController');
const { protect, authorize, checkPermission } = require('./middlewares/authMiddleware');

app.get('/api/admin/cancelled-orders', protect, authorize('admin'), checkPermission('refunds'), orderController.getCancelledOrders);
app.get('/api/admin/refund-desk', protect, authorize('admin'), checkPermission('refunds'), orderController.getCancelledOrders); // Alias for rebranding
app.get('/api/admin/cancelled-orders/stats', protect, authorize('admin'), checkPermission('refunds'), orderController.getCancelledOrdersStats);
app.get('/api/admin/refund-desk/stats', protect, authorize('admin'), checkPermission('refunds'), orderController.getCancelledOrdersStats); // Alias
app.patch('/api/admin/order/:id/refund-status', protect, authorize('admin'), checkPermission('refunds'), orderController.updateRefundStatus);
app.patch('/api/admin/refund/:id/status', protect, authorize('admin'), checkPermission('refunds'), orderController.updateRefundStatus); // Alias
app.get('/api/admin/order/:id/payment-details', protect, authorize('admin'), checkPermission('refunds'), orderController.getRefundPaymentDetails);
app.get('/api/admin/refund/:id/payment-details', protect, authorize('admin'), checkPermission('refunds'), orderController.getRefundPaymentDetails); // Alias
app.post('/api/admin/refunds/initiate', protect, authorize('admin'), checkPermission('refunds'), require('./controllers/refundController').initiateRazorpayRefund);
app.post('/api/admin/order/:id/restock', protect, authorize('admin'), checkPermission('refunds'), orderController.restockOrder);


app.use('/api/products', productRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/subcategories', subcategoryRoutes);
app.use('/api/health-tips', healthTipRoutes);
app.use('/api/delivery', require('./routes/deliveryRoutes'));
app.use('/api/pincode', require('./routes/pincodeRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));
app.use('/api/addresses', require('./routes/addressRoutes'));
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/cart', require('./routes/cartRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api', require('./routes/reorderRoutes')); // Exact match for reorder endpoints
app.use('/api', require('./routes/couponRoutes'));
app.use("/api/admin/analytics", adminAnalyticsRoutes);
app.get('/api/admin/dashboard-summary', require('./controllers/analyticsController').getDashboardSummary);
app.use('/api/contact', require('./routes/contactRoutes'));
app.use('/api/faqs', require('./routes/faqRoutes'));
app.use('/api/analytics', require('./routes/publicAnalyticsRoutes'));

// app.use('/api/debug', require('./routes/debugRoutes')); // Temporary debug route (Disabled for prod)
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/chatbot', require('./routes/chatbotRoutes'));
app.use('/api/admin/targeting', require('./routes/targetingRoutes'));
// app.use('/api/returns', require('./routes/returnRoutes')); // HOM-139: Backend WIP
app.use('/api/admin/users', require('./routes/userRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/campaigns', require('./routes/campaignRoutes'));
app.use('/api/ui', require('./routes/uiRoutes'));

app.get('/', (req, res) => {
    res.send("House Of Urvaah API is running....");
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('SERVER ERROR:', err.stack);
    res.status(500).json({
        success: false,
        error: "Internal Server Error",
        debug_message: err.message,
        debug_stack: err.stack // Force show stack trace for debugging
    });
});


module.exports = app;

