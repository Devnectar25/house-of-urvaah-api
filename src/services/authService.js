const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key';
const JWT_EXPIRES_IN = '7d';

const generateToken = (id, role) => {
    return jwt.sign({ id: id.toString(), role }, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN
    });
};

const formatUserResponse = (row) => {
    if (!row) return null;
    const fullName = row.fullname || `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.username || 'Atelier Member';
    const firstName = row.first_name || fullName.split(' ')[0] || fullName;
    const lastName = row.last_name || fullName.split(' ').slice(1).join(' ') || '';

    return {
        id: row.username || row.emailid,
        userid: row.username || row.emailid,
        email: row.emailid,
        firstName: firstName,
        lastName: lastName,
        fullName: fullName,
        phone: row.phone || row.contactno || '',
        memberSince: row.member_since || row.createdate,
        isVerified: row.is_verified ?? true,
        avatar: row.avatar_url || ''
    };
};

exports.formatUserResponse = formatUserResponse;
exports.generateToken = generateToken;

// --- OTP AUTH FLOW ---

/**
 * Step 1: Send OTP to email
 * Rate-limiting: Max 3 requests per email per 10 minutes.
 */
exports.sendOtp = async (email) => {
    if (!email || !email.trim()) {
        throw new Error("Email address is required");
    }
    const cleanEmail = email.toLowerCase().trim();
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!EMAIL_REGEX.test(cleanEmail)) {
        throw new Error("Please enter a valid email address");
    }

    const now = new Date();

    // 1. Check existing record in otps table for rate limit & lockout
    const existing = await pool.query("SELECT * FROM public.otps WHERE email = $1", [cleanEmail]);
    const record = existing.rows[0];

    if (record) {
        // Check if locked out
        if (record.locked_until && new Date(record.locked_until) > now) {
            const minutesLeft = Math.ceil((new Date(record.locked_until) - now) / (60 * 1000));
            throw new Error(`Account temporarily locked out due to failed attempts. Try again in ${minutesLeft} minute(s).`);
        }

        // Check 10-minute sliding window rate limit (max 3 requests)
        const firstSendAt = new Date(record.first_send_at || record.created_at);
        const windowDurationMs = 10 * 60 * 1000; // 10 minutes

        if (now - firstSendAt < windowDurationMs) {
            if (record.send_count >= 3) {
                const minutesLeft = Math.ceil((windowDurationMs - (now - firstSendAt)) / (60 * 1000));
                throw new Error(`Too many OTP requests. Please wait ${minutesLeft} minute(s) before requesting again.`);
            }
        }
    }

    // 2. Generate 6-digit random code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const salt = await bcrypt.genSalt(10);
    const otpHash = await bcrypt.hash(otp, salt);
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes

    let newSendCount = 1;
    let newFirstSendAt = now;

    if (record) {
        const firstSendAt = new Date(record.first_send_at || record.created_at);
        if (now - firstSendAt < 10 * 60 * 1000) {
            newSendCount = (record.send_count || 0) + 1;
            newFirstSendAt = record.first_send_at;
        }
    }

    // 3. Upsert into otps table
    await pool.query(`
        INSERT INTO public.otps (email, otp_hash, expires_at, failed_attempts, send_count, first_send_at, created_at)
        VALUES ($1, $2, $3, 0, $4, $5, NOW())
        ON CONFLICT (email) DO UPDATE SET
            otp_hash = $2,
            expires_at = $3,
            failed_attempts = 0,
            locked_until = NULL,
            send_count = $4,
            first_send_at = $5,
            created_at = NOW();
    `, [cleanEmail, otpHash, expiresAt, newSendCount, newFirstSendAt]);

    // 4. Send email via Brevo API
    const brevo = require('./brevoEmailService');
    await brevo.sendOtpEmail(cleanEmail, otp);

    console.log(`[OTP Service] Successfully sent OTP to ${cleanEmail}`);

    return {
        success: true,
        message: "Verification code sent to your email",
        email: cleanEmail
    };
};

/**
 * Step 2: Verify OTP
 * Compares hashed OTP, checks expiry, handles 5-attempt / 15-minute lockout.
 */
exports.verifyOtp = async (email, otp) => {
    if (!email || !otp) {
        throw new Error("Email and OTP are required");
    }
    const cleanEmail = email.toLowerCase().trim();
    const cleanOtp = otp.toString().trim();

    // 1. Fetch OTP record
    const result = await pool.query("SELECT * FROM public.otps WHERE email = $1", [cleanEmail]);
    const record = result.rows[0];

    if (!record) {
        throw new Error("No verification code requested for this email. Please click Resend Code.");
    }

    const now = new Date();

    // 2. Check if locked out
    if (record.locked_until && new Date(record.locked_until) > now) {
        const minutesLeft = Math.ceil((new Date(record.locked_until) - now) / (60 * 1000));
        throw new Error(`Account locked out for 15 minutes due to 5 wrong attempts. Please try again in ${minutesLeft} minute(s).`);
    }

    // 3. Check expiry
    if (new Date(record.expires_at) < now) {
        throw new Error("Verification code has expired. Please click Resend Code.");
    }

    // 4. Compare hashed OTP
    const isMatch = await bcrypt.compare(cleanOtp, record.otp_hash);

    if (!isMatch) {
        const newFailedAttempts = (record.failed_attempts || 0) + 1;

        if (newFailedAttempts >= 5) {
            const lockUntil = new Date(now.getTime() + 15 * 60 * 1000); // 15-minute lockout
            await pool.query(
                "UPDATE public.otps SET failed_attempts = $1, locked_until = $2 WHERE email = $3",
                [newFailedAttempts, lockUntil, cleanEmail]
            );
            throw new Error("Too many failed attempts. Account locked out for 15 minutes.");
        } else {
            await pool.query(
                "UPDATE public.otps SET failed_attempts = $1 WHERE email = $2",
                [newFailedAttempts, cleanEmail]
            );
            const remaining = 5 - newFailedAttempts;
            throw new Error(`Invalid verification code. ${remaining} attempt(s) remaining.`);
        }
    }

    // 5. Success! Delete the OTP record
    await pool.query("DELETE FROM public.otps WHERE email = $1", [cleanEmail]);

    // 6. Check if user already exists in users table
    const userRes = await pool.query(
        "SELECT * FROM public.users WHERE emailid = $1 OR username = $1",
        [cleanEmail]
    );
    const existingUser = userRes.rows[0];

    if (!existingUser) {
        // Signal frontend to show Step 3 (First-time user details form)
        return {
            requiresDetails: true,
            email: cleanEmail
        };
    }

    // User exists -> Ensure is_verified is true
    await pool.query(
        "UPDATE public.users SET is_verified = TRUE WHERE emailid = $1 OR username = $1",
        [cleanEmail]
    );

    // Issue JWT token for returning user
    const token = generateToken(existingUser.username || cleanEmail, 'user');
    const formattedUser = formatUserResponse(existingUser);

    return {
        requiresDetails: false,
        user: formattedUser,
        token
    };
};

/**
 * Step 3: Complete First-Time User Details
 */
exports.completeSignup = async (data) => {
    const { email, firstName, lastName, phone } = data;

    if (!email || !email.trim()) {
        throw new Error("Email is required");
    }
    if (!firstName || !firstName.trim() || firstName.trim().length < 2) {
        throw new Error("First name is required (at least 2 characters)");
    }
    if (!lastName || !lastName.trim()) {
        throw new Error("Last name is required");
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanPhone = (phone || '').replace(/\D/g, '');

    if (!cleanPhone || cleanPhone.length !== 10) {
        throw new Error("Please enter a valid 10-digit mobile number");
    }

    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const username = cleanEmail;

    // Check if user exists
    const existing = await pool.query("SELECT * FROM public.users WHERE emailid = $1 OR username = $1", [cleanEmail]);
    let userRow;

    if (existing.rows.length > 0) {
        const updateRes = await pool.query(`
            UPDATE public.users
            SET first_name = $1, last_name = $2, fullname = $3, phone = $4, contactno = $4, is_verified = TRUE
            WHERE emailid = $5 OR username = $5
            RETURNING *;
        `, [firstName.trim(), lastName.trim(), fullName, cleanPhone, cleanEmail]);
        userRow = updateRes.rows[0];
    } else {
        const insertRes = await pool.query(`
            INSERT INTO public.users
            (username, emailid, first_name, last_name, fullname, phone, contactno, active, is_verified, createdate, member_since)
            VALUES ($1, $2, $3, $4, $5, $6, $6, true, true, NOW(), NOW())
            RETURNING *;
        `, [username, cleanEmail, firstName.trim(), lastName.trim(), fullName, cleanPhone]);
        userRow = insertRes.rows[0];
    }

    // Trigger welcome email in background
    try {
        const brevo = require('./brevoEmailService');
        brevo.sendWelcomeEmail(cleanEmail, fullName).catch((e) => console.warn('[Welcome Email Warning]:', e.message));
    } catch (e) {}

    const token = generateToken(userRow.username || cleanEmail, 'user');
    const formattedUser = formatUserResponse(userRow);

    return {
        user: formattedUser,
        token
    };
};

// --- ADMIN AUTH ---

exports.loginAdmin = async (username, password, ipAddress) => {
    console.log(`[authService] loginAdmin called for: ${username}`);

    const result = await pool.query("SELECT * FROM public.admins WHERE userid = $1", [username]);
    const adminRow = result.rows[0];

    if (!adminRow || !(await bcrypt.compare(password, adminRow.password))) {
        if (adminRow && adminRow.password === password) {
            console.log(`[authService] Plain password matched (fallback)`);
        } else {
            if (adminRow) {
                await pool.query("INSERT INTO audit_logs (admin_id, username, action, details, ip_address) VALUES ($1, $2, $3, $4, $5)", [adminRow.adminid, username, 'FAILED_LOGIN', 'Invalid password', ipAddress]);
            } else {
                await pool.query("INSERT INTO audit_logs (admin_id, username, action, details, ip_address) VALUES ($1, $2, $3, $4, $5)", [null, username, 'FAILED_LOGIN', 'User not found', ipAddress]);
            }
            throw new Error("Invalid username or password");
        }
    }

    if (adminRow.userid !== 'Admin' && adminRow.active === false) {
        await pool.query("INSERT INTO audit_logs (admin_id, username, action, details, ip_address) VALUES ($1, $2, $3, $4, $5)", [adminRow.adminid, username, 'FAILED_LOGIN', 'Account deactivated', ipAddress]);
        throw new Error("Your account has been deactivated. Please contact Super Admin.");
    }

    const token = generateToken(adminRow.adminid, 'admin');

    const admin = {
        id: adminRow.adminid.toString(),
        username: adminRow.userid,
        role: adminRow.userid === 'Admin' ? 'super_admin' : 'sub_admin',
        permissions: adminRow.accesstopage || [],
        createdate: adminRow.createdate
    };

    await pool.query("INSERT INTO audit_logs (admin_id, username, action, details, ip_address) VALUES ($1, $2, $3, $4, $5)", [adminRow.adminid, username, 'LOGIN_SUCCESS', 'User logged in', ipAddress]);

    return { admin, token };
};
