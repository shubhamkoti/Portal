const asyncHandler = require('express-async-handler');
const crypto = require('crypto');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const settingsService = require('../utils/settingsService');
const { logAction } = require('../utils/auditService');
const { validateRegister, validateLogin } = require('../middleware/validationMiddleware');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
    // 0. Joi Validation
    const { error } = validateRegister(req.body);
    if (error) {
        res.status(400);
        throw new Error(error.details.map(d => d.message).join(', '));
    }

    const { name, email, password, role, studentProfile, companyProfile, facultyProfile } = req.body;
    const settings = await settingsService.getSettings();

    // 1. Domain Validation
    if (role === 'student' && !email.endsWith('.edu')) {
        res.status(400);
        throw new Error('Please use your college (.edu) email address');
    }

    if (role === 'company' && settings.allowedCompanyEmailDomains.length > 0) {
        const domain = email.split('@')[1];
        if (!settings.allowedCompanyEmailDomains.includes(domain)) {
            res.status(400);
            throw new Error(`Registration restricted to specific company domains: ${settings.allowedCompanyEmailDomains.join(', ')}`);
        }
    }

    // Faculty email domain validation
    if (role === 'faculty') {
        const emailDomain = email.split('@')[1];
        const allowedDomains = ['.edu', '.ac.in', '.edu.in'];
        const isValidDomain = allowedDomains.some(domain => emailDomain.endsWith(domain));
        
        if (!isValidDomain) {
            res.status(400);
            throw new Error('Faculty registration requires an institutional email address (.edu, .ac.in, or .edu.in)');
        }
    }

    const userExists = await User.findOne({ email });

    if (userExists) {
        res.status(400);
        throw new Error('User already exists');
    }

    // 2. Role Security
    if (role === 'admin') {
        res.status(403);
        throw new Error('Admin registration is not allowed');
    }
    const finalRole = role || 'student';

    // 3. Status & Auto-approval Logic
    let status = 'pending';
    let isVerified = false;

    if (finalRole === 'student' && settings.enableStudentAutoApproval) {
        status = 'approved';
        isVerified = true;
    } else if (finalRole === 'company' && settings.enableCompanyAutoApproval) {
        status = 'approved';
        isVerified = true;
    } else if (finalRole === 'faculty') {
        // Faculty usually always requires manual verification unless specified otherwise
        status = 'pending';
    }

    const userData = {
        name,
        email,
        password,
        role: finalRole,
        status,
        isVerified
    };

    // Profile sanitation: Remove empty strings and nulls to prevent CastErrors
    const sanitizeProfile = (profile) => {
        if (!profile) return undefined;
        const sanitized = {};
        Object.keys(profile).forEach(key => {
            if (profile[key] !== '' && profile[key] !== null && profile[key] !== undefined) {
                sanitized[key] = profile[key];
            }
        });
        return Object.keys(sanitized).length > 0 ? sanitized : undefined;
    };

    // Attach profile based on role
    if (finalRole === 'student') userData.studentProfile = sanitizeProfile(studentProfile);
    if (finalRole === 'company') userData.companyProfile = sanitizeProfile(companyProfile);
    if (finalRole === 'faculty') userData.facultyProfile = sanitizeProfile(facultyProfile);

    // Generate email verification token for faculty
    if (finalRole === 'faculty') {
        const verificationToken = crypto.randomBytes(32).toString('hex');
        userData.emailVerificationToken = verificationToken;
        userData.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
        userData.isEmailVerified = false;
    }

    const user = await User.create(userData);

    if (user) {
        logAction({
            userId: user._id,
            action: 'USER_REGISTER',
            entityType: 'User',
            entityId: user._id,
            metadata: { role: user.role, status: user.status },
            req
        });

        // Send verification email for faculty
        if (finalRole === 'faculty' && user.emailVerificationToken) {
            try {
                await emailService.sendVerificationEmail({
                    recipientEmail: user.email,
                    recipientName: user.name,
                    verificationToken: user.emailVerificationToken
                });
            } catch (emailError) {
                logger.error(`[AUTH] Failed to send verification email: ${emailError.message}`);
                // Don't fail registration if email fails
            }
        }

        res.status(201).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status,
            isVerified: user.isVerified,
            isSuspended: user.isSuspended,
            isEmailVerified: user.isEmailVerified || false,
            token: generateToken(user._id, user.role),
        });
    } else {
        res.status(400);
        throw new Error('Invalid user data');
    }
});

// @desc    Authenticate user
// @route   POST /api/auth/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
    // 0. Joi Validation
    const { error } = validateLogin(req.body);
    if (error) {
        res.status(400);
        throw new Error(error.details.map(d => d.message).join(', '));
    }

    const { email, password } = req.body;
    const settings = await settingsService.getSettings();

    const user = await User.findOne({ email }).select('+password');

    if (user && (await user.matchPassword(password))) {
        if (user.isSuspended || user.status === 'blocked' || user.status === 'rejected') {
            res.status(403);
            throw new Error('Access Denied: Your account has been suspended or rejected.');
        }

        // Check email verification for faculty
        if (user.role === 'faculty' && !user.isEmailVerified) {
            res.status(403);
            throw new Error('Please verify your email address before logging in. Check your inbox for the verification link.');
        }

        logAction({
            userId: user._id,
            action: 'USER_LOGIN',
            entityType: 'User',
            entityId: user._id,
            req
        });

        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status,
            isVerified: user.isVerified || user.status === 'approved',
            isSuspended: user.isSuspended,
            isEmailVerified: user.isEmailVerified || false,
            token: generateToken(user._id, user.role),
        });
    } else {
        res.status(401);
        throw new Error('Invalid email or password');
    }
});

// @desc    Get user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    if (user) {
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status,
            isVerified: user.isVerified || user.status === 'approved',
            isSuspended: user.isSuspended,
            studentProfile: user.studentProfile,
            companyProfile: user.companyProfile,
            facultyProfile: user.facultyProfile,
        });
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc    Get account status
// @route   GET /api/auth/status
// @access  Private (Token Only)
const getStatus = asyncHandler(async (req, res) => {
    res.json({
        status: req.user.status,
        isVerified: req.user.isVerified || req.user.status === 'approved',
        isSuspended: req.user.isSuspended
    });
});

// @desc    Verify faculty email
// @route   GET /api/auth/verify-email/:token
// @access  Public
const verifyFacultyEmail = asyncHandler(async (req, res) => {
    const { token } = req.params;

    if (!token) {
        res.status(400);
        throw new Error('Verification token is required');
    }

    // Find user with matching token and non-expired token
    const user = await User.findOne({
        emailVerificationToken: token,
        emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
        res.status(400);
        throw new Error('Invalid or expired verification token');
    }

    // Verify user is faculty
    if (user.role !== 'faculty') {
        res.status(403);
        throw new Error('Email verification is only required for faculty members');
    }

    // Mark email as verified and clear token
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    logAction({
        userId: user._id,
        action: 'EMAIL_VERIFIED',
        entityType: 'User',
        entityId: user._id,
        metadata: { role: user.role },
        req
    });

    res.json({
        success: true,
        message: 'Email verified successfully. You can now log in.',
        user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            isEmailVerified: user.isEmailVerified
        }
    });
});

module.exports = {
    registerUser,
    loginUser,
    getMe,
    getStatus,
    verifyFacultyEmail,
};
