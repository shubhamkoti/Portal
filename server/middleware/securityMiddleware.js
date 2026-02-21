const rateLimit = require('express-rate-limit');
const axios = require('axios');
const env = require('../config/env');
const logger = require('../utils/logger');

/**
 * General API Rate Limiter
 * Limits requests per window to prevent brute force and DoS
 */
const apiLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW,
    max: env.RATE_LIMIT_MAX,
    message: {
        message: 'Too many requests from this IP, please try again later.'
    },
    handler: (req, res, next, options) => {
        logger.warn(`[SECURITY] Rate limit exceeded for IP: ${req.ip} - Path: ${req.originalUrl}`);
        res.status(options.statusCode).send(options.message);
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Strict Rate Limiter for Auth Routes
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 attempts per 15 mins
    message: {
        message: 'Too many login attempts. Please try again after 15 minutes.'
    },
    handler: (req, res, next, options) => {
        logger.error(`[SECURITY] AUTH ABUSE DETECTED: Multiple attempts from IP: ${req.ip}`);
        res.status(options.statusCode).send(options.message);
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * reCAPTCHA v3 Verification Middleware
 */
const verifyCaptcha = async (req, res, next) => {
    // Skip captcha check in development if needed, or if no token provided (let controller handle if required)
    const { captchaToken } = req.body;

    if (!captchaToken) {
        logger.warn(`[SECURITY] Captcha token missing in request from IP: ${req.ip}`);
        return res.status(400).json({ message: 'Security verification (captcha) is required.' });
    }

    try {
        const secretKey = process.env.VITE_RECAPTCHA_SECRET_KEY;
        const response = await axios.post(
            `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${captchaToken}`
        );

        if (response.data.success) {
            logger.info(`[SECURITY] Captcha verified successfully for IP: ${req.ip}`);
            next();
        } else {
            logger.error(`[SECURITY] Captcha verification failed: ${JSON.stringify(response.data['error-codes'])}`);
            res.status(400).json({ message: 'Security verification failed. Please try again.' });
        }
    } catch (error) {
        logger.error(`[SECURITY] Captcha verification error: ${error.message}`);
        res.status(500).json({ message: 'Internal security protocol error.' });
    }
};

/**
 * Security Hardening Middleware
 */
const securityHardening = (app) => {
    // Apply global rate limiting
    app.use('/api/', apiLimiter);

    // Apply strict limiting to auth
    app.use('/api/auth/', authLimiter);
};

module.exports = {
    apiLimiter,
    authLimiter,
    verifyCaptcha,
    securityHardening
};
