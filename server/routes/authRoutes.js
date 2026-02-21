const express = require('express');
const router = express.Router();
const {
    registerUser,
    loginUser,
    getMe,
    getStatus,
    verifyFacultyEmail,
} = require('../controllers/authController');
const { protect, protectTokenOnly } = require('../middleware/authMiddleware');
const { verifyCaptcha } = require('../middleware/securityMiddleware');

router.post('/register', registerUser);
router.post('/login', verifyCaptcha, loginUser);
router.get('/verify-email/:token', verifyFacultyEmail);
router.get('/me', protect, getMe);
router.get('/status', protectTokenOnly, getStatus);

module.exports = router;
