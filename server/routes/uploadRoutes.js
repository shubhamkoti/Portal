const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const multer = require('multer');
const fileService = require('../services/fileService');
const { protect } = require('../middleware/authMiddleware');
const { logAction } = require('../utils/auditService');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// @desc    Upload avatar
// @route   POST /api/upload/avatar
// @access  Private
router.post('/avatar', protect, upload.single('image'), asyncHandler(async (req, res) => {
    if (!req.file) {
        res.status(400);
        throw new Error('Please upload an image');
    }

    const result = await fileService.uploadFromBuffer(req.file.buffer, {
        folder: 'pict_portal/avatars',
        transformation: [
            { width: 200, height: 200, crop: 'fill', gravity: 'face' }
        ]
    });

    logAction({
        userId: req.user._id,
        action: 'AVATAR_UPLOAD',
        entityType: 'User',
        entityId: req.user._id,
        req
    });

    res.json({
        success: true,
        url: result.secure_url,
        publicId: result.public_id
    });
}));

const User = require('../models/User');
const aiService = require('../services/aiService');

// @desc    Upload resume
// @route   POST /api/upload/resume
// @access  Private (Student)
router.post('/resume', protect, upload.single('file'), asyncHandler(async (req, res) => {
    // 1. Validate file presence and type (PDF only – do not allow renamed DOC/DOCX)
    if (!req.file) {
        return res.status(400).json({
            message: 'No file uploaded.'
        });
    }

    if (req.file.mimetype !== 'application/pdf') {
        return res.status(400).json({
            message: 'Only PDF files are allowed.'
        });
    }

    if (!req.file.buffer) {
        return res.status(400).json({
            message: 'No file uploaded.'
        });
    }

    const { buffer } = req.file;

    // 2. Safe PDF parsing with try/catch – do not crash the server
    let extractionResult;
    try {
        extractionResult = await aiService.extractTextFromPDF(buffer);
    } catch (error) {
        console.error('PDF Parsing Error:', error.message);
        return res.status(400).json({
            message: 'The PDF file structure is unreadable or corrupted. Please upload a valid text-based PDF.'
        });
    }

    // Defensive check: extraction failed (image-based or corrupt)
    if (!extractionResult.success) {
        return res.status(400).json({
            message: extractionResult.message || 'Unable to extract readable text from this PDF. Please upload a text-based PDF.'
        });
    }

    // 3. Upload to Cloudinary only after successful parsing
    const result = await fileService.uploadFromBuffer(buffer, {
        folder: 'pict_portal/resumes',
        resource_type: 'raw'
    });

    const { skills } = await aiService.extractSkills(extractionResult);
    const keywordSkills = aiService.extractSkillsFromResumeText(extractionResult.text || '');
    const mergedSkills = [...new Set([...(skills || []), ...keywordSkills])];

    // 3. Update Student Profile Persistence
    const user = await User.findById(req.user._id);
    if (user && user.role === 'student') {
        user.studentProfile.resumeFileUrl = result.secure_url;
        user.studentProfile.parsedSkills = mergedSkills;
        user.studentProfile.resumeParsedAt = new Date();
        // Also update the existing resumeUrl if needed
        user.studentProfile.resumeUrl = result.secure_url;
        await user.save();
    }

    logAction({
        userId: req.user._id,
        action: 'RESUME_UPLOAD_AND_PARSE',
        entityType: 'User',
        entityId: req.user._id,
        metadata: { skillsExtracted: mergedSkills.length },
        req
    });

    res.json({
        success: true,
        url: result.secure_url,
        skills: mergedSkills,
        parsedAt: user && user.studentProfile ? user.studentProfile.resumeParsedAt : new Date()
    });
}));

// @desc    Upload video (for experiences)
// @route   POST /api/upload/video
// @access  Private
router.post('/video', protect, upload.single('video'), asyncHandler(async (req, res) => {
    if (!req.file) {
        res.status(400);
        throw new Error('Please upload a video');
    }

    const result = await fileService.uploadFromBuffer(req.file.buffer, {
        folder: 'pict_portal/videos',
        resource_type: 'video'
    });

    logAction({
        userId: req.user._id,
        action: 'VIDEO_UPLOAD',
        entityType: 'User',
        entityId: req.user._id,
        req
    });

    res.json({
        success: true,
        url: result.secure_url,
        publicId: result.public_id
    });
}));

module.exports = router;
