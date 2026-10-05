const authService = require('../services/authService');
const jwt = require('jsonwebtoken');
const { getClientUrl } = require('../utils/urlHelper');
const pool = require('../config/db');

const setAuthCookie = (res, token) => {
    if (res && typeof res.cookie === 'function') {
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
    }
};

/**
 * Step 1: Send OTP to email
 * POST /api/auth/send-otp
 */
exports.sendOtp = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email address is required' });
        }

        const result = await authService.sendOtp(email);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        console.error('[sendOtp Error]:', error.message);
        const statusCode = error.message.includes('Too many') || error.message.includes('locked out') ? 429 : 400;
        res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * Step 2: Verify OTP
 * POST /api/auth/verify-otp
 */
exports.verifyOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Email and OTP are required'
            });
        }

        const result = await authService.verifyOtp(email, otp);

        if (result.token) {
            setAuthCookie(res, result.token);
        }

        res.status(200).json({ success: true, ...result });
    } catch (error) {
        console.error('[verifyOtp Error]:', error.message);
        const statusCode = error.message.includes('locked out') ? 429 : 400;
        res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * Step 3: Complete Signup for first-time users
 * POST /api/auth/complete-signup
 */
exports.completeSignup = async (req, res) => {
    try {
        const result = await authService.completeSignup(req.body);

        if (result.token) {
            setAuthCookie(res, result.token);
        }

        res.status(200).json({ success: true, ...result });
    } catch (error) {
        console.error('[completeSignup Error]:', error.message);
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * Logout and clear session cookie
 * POST /api/auth/logout
 */
exports.logout = async (req, res) => {
    try {
        if (res && typeof res.clearCookie === 'function') {
            res.clearCookie('token', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
            });
        }
        res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get current logged in user from session token / cookie
 * GET /api/auth/me
 */
exports.getCurrentUser = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        if (req.user?.role === 'admin') {
            const adminResult = await pool.query("SELECT * FROM public.admins WHERE adminid = $1", [userId]);
            if (adminResult.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Admin not found' });
            }
            const adminRow = adminResult.rows[0];
            if (adminRow.userid !== 'Admin' && adminRow.active === false) {
                return res.status(403).json({ success: false, message: 'Account deactivated' });
            }
            const admin = {
                id: adminRow.adminid.toString(),
                username: adminRow.userid,
                role: adminRow.userid === 'Admin' ? 'super_admin' : 'sub_admin',
                permissions: adminRow.accesstopage || [],
                createdate: adminRow.createdate
            };
            return res.status(200).json({ success: true, user: admin, admin });
        }

        const result = await pool.query(
            "SELECT * FROM public.users WHERE username = $1 OR emailid = $1 LIMIT 1",
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const user = authService.formatUserResponse(result.rows[0]);
        res.status(200).json({ success: true, user });
    } catch (error) {
        console.error('[getCurrentUser Error]:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};


/**
 * Admin Login
 * POST /api/auth/admin/login
 */
exports.adminLogin = async (req, res) => {
    try {
        const { username, password } = req.body;
        const ipAddress = req.ip || req.connection?.remoteAddress || '';
        const result = await authService.loginAdmin(username, password, ipAddress);

        if (result.token) {
            setAuthCookie(res, result.token);
        }

        res.json({ success: true, ...result });
    } catch (error) {
        console.error(`[adminLogin Error]: ${error.message}`);
        res.status(401).json({ success: false, message: error.message });
    }
};

/**
 * Social Auth Callback
 */
exports.socialCallback = async (req, res) => {
    try {
        const user = req.user;
        const token = authService.generateToken(user.username || user.emailid, 'user');
        setAuthCookie(res, token);

        const redirectPath = req.session.returnTo || '/';
        delete req.session.returnTo;

        const clientUrl = req.session.clientUrl || getClientUrl(req);
        delete req.session.clientUrl;

        res.redirect(`${clientUrl}/auth/callback?token=${token}&redirect=${encodeURIComponent(redirectPath)}&user=${encodeURIComponent(JSON.stringify({
            id: user.username,
            email: user.emailid,
            fullName: user.fullname || user.username,
            memberSince: user.member_since,
            avatar: user.avatar_url,
            phone: user.contactno
        }))}`);
    } catch (error) {
        console.error("Social Auth Error:", error);
        const clientUrl = req.session?.clientUrl || getClientUrl(req);
        delete req.session?.clientUrl;
        res.redirect(`${clientUrl}/auth?error=SocialLoginFailed`);
    }
};
