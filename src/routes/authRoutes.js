const express = require('express');
const router = express.Router();
const passport = require('passport');
const crypto = require('crypto');
const authController = require('../controllers/authController');
const subAdminController = require('../controllers/subAdminController');
const { protect, authorize } = require('../middlewares/authMiddleware');
const { getClientUrl } = require('../utils/urlHelper');

// --- OTP AUTHENTICATION FLOW (SINGLE LOGIN/SIGNUP FLOW) ---
router.post('/send-otp', authController.sendOtp);
router.post('/verify-otp', authController.verifyOtp);
router.post('/complete-signup', authController.completeSignup);
router.post('/logout', authController.logout);

// Admin login
router.post('/admin/login', authController.adminLogin);

// Sub-admin management routes
router.get('/admin/subadmins', protect, authorize('admin'), subAdminController.getSubAdmins);
router.post('/admin/subadmins', protect, authorize('admin'), subAdminController.createSubAdmin);
router.put('/admin/subadmins/:id', protect, authorize('admin'), subAdminController.updateSubAdmin);
router.delete('/admin/subadmins/:id', protect, authorize('admin'), subAdminController.deleteSubAdmin);
router.get('/admin/audit-logs', protect, authorize('admin'), subAdminController.getAuditLogs);

// --- GOOGLE OAUTH ---
router.get('/google', (req, res, next) => {
    const state = crypto.randomBytes(32).toString('hex');
    req.session = req.session || {};
    req.session.oauth_state = state;
    if (req.query.redirect) {
        req.session.returnTo = req.query.redirect;
    }
    req.session.clientUrl = getClientUrl(req);
    req.session.save((err) => {
        if (err) return next(err);
        passport.authenticate('google', { scope: ['profile', 'email'], state })(req, res, next);
    });
});

router.get('/google/callback', (req, res, next) => {
    const receivedState = req.query.state;
    const storedState = req.session?.oauth_state;
    const clientUrl = req.session?.clientUrl || getClientUrl(req);

    if (!receivedState || !storedState || receivedState !== storedState) {
        return res.redirect(`${clientUrl}/auth?error=state_mismatch`);
    }

    delete req.session.oauth_state;

    passport.authenticate('google', {
        failureRedirect: `${clientUrl}/auth?error=google_auth_failed`
    })(req, res, next);
}, authController.socialCallback);

// --- FACEBOOK OAUTH ---
router.get('/facebook', (req, res, next) => {
    const state = crypto.randomBytes(32).toString('hex');
    req.session = req.session || {};
    req.session.oauth_state_facebook = state;
    if (req.query.redirect) {
        req.session.returnTo = req.query.redirect;
    }
    req.session.clientUrl = getClientUrl(req);
    req.session.save((err) => {
        if (err) return next(err);
        passport.authenticate('facebook', { scope: ['email'], state })(req, res, next);
    });
});

router.get('/facebook/callback', (req, res, next) => {
    const receivedState = req.query.state;
    const storedState = req.session?.oauth_state_facebook;
    const clientUrl = req.session?.clientUrl || getClientUrl(req);

    if (!receivedState || !storedState || receivedState !== storedState) {
        return res.redirect(`${clientUrl}/auth?error=state_mismatch`);
    }

    delete req.session.oauth_state_facebook;

    passport.authenticate('facebook', {
        failureRedirect: `${clientUrl}/auth?error=facebook_auth_failed`
    })(req, res, next);
}, authController.socialCallback);

// Current user profile route
router.get('/me', protect, authController.getCurrentUser);

module.exports = router;
