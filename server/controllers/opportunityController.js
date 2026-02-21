const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const Opportunity = require('../models/Opportunity');
const Application = require('../models/Application');
const User = require('../models/User');
const settingsService = require('../utils/settingsService');
const { logAction } = require('../utils/auditService');
const notificationService = require('../services/notificationService');
const aiService = require('../services/aiService');

/** Get current student's parsed skills from JWT when present (for match scoring). Does not require auth. */
async function getStudentSkillsFromRequest(req) {
    if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) return [];
    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('role studentProfile.parsedSkills').lean();
        if (!user || user.role !== 'student') return [];
        return (user.studentProfile && user.studentProfile.parsedSkills) || [];
    } catch (err) {
        return [];
    }
}

/** Attach matchScore and missingSkills to an opportunity (computed, not stored). */
function attachMatchToOpportunity(opp, studentSkills) {
    const required = opp.requiredSkills || [];
    const { matchScore, missingSkills } = aiService.calculateMatch(studentSkills, required);
    const plain = opp.toObject ? opp.toObject() : { ...opp };
    plain.matchScore = matchScore;
    plain.missingSkills = missingSkills;
    return plain;
}

// @desc    Create new opportunity
// @route   POST /api/opportunities
// @access  Private (Company/Faculty/Admin)
const createOpportunity = asyncHandler(async (req, res) => {
    const {
        title,
        description,
        type,
        requiredSkills,
        eligibilityCriteria,
        deadline,
        location,
        stipend,
        duration,
        facultyApprovalRequired
    } = req.body;

    // Logic: If faculty approval is required, status is 'pending_faculty'. Otherwise 'open'.
    const status = facultyApprovalRequired ? 'pending_faculty' : 'open';

    const opportunity = await Opportunity.create({
        title,
        description,
        type,
        postedBy: req.user._id,
        requiredSkills,
        eligibilityCriteria,
        deadline,
        location,
        stipend,
        duration,
        status,
        facultyApprovalRequired: !!facultyApprovalRequired
    });

    logAction({
        userId: req.user._id,
        action: 'OPPORTUNITY_CREATE',
        entityType: 'Opportunity',
        entityId: opportunity._id,
        metadata: { title, type, status },
        req
    });

    const populatedOpp = await Opportunity.findById(opportunity._id).populate('postedBy', 'name role companyProfile facultyProfile');

    const io = req.app.get('socketio');
    if (io) {
        // Only emit if it's already open, or send to a moderation room? 
        // For now, only students see 'open' ones, so we only emit if 'open'
        if (status === 'open') {
            io.emit('new_opportunity', populatedOpp);
        }
    }

    res.status(201).json(opportunity);
});

// @desc    Get all opportunities
// @route   GET /api/opportunities
// @access  Public
const getOpportunities = asyncHandler(async (req, res) => {
    // MVC Strict Rule: Only show opportunities from 'approved' users
    const opportunities = await Opportunity.find({ status: 'open' })
        .populate({
            path: 'postedBy',
            select: 'name email status companyProfile facultyProfile',
            match: { status: 'approved' } // Only populate if user is approved
        })
        .sort('-createdAt');

    // Filter out opportunities where postedBy didn't match the 'approved' criteria
    const filteredOpportunities = opportunities.filter(opp => opp.postedBy !== null);

    // Skill gap: attach matchScore and missingSkills when student token is present
    const studentSkills = await getStudentSkillsFromRequest(req);
    const payload = filteredOpportunities.map(opp => attachMatchToOpportunity(opp, studentSkills));

    res.json(payload);
});

// @desc    Get opportunity by ID
// @route   GET /api/opportunities/:id
// @access  Public
const getOpportunityById = asyncHandler(async (req, res) => {
    const opportunity = await Opportunity.findById(req.params.id)
        .populate('postedBy', 'name email companyProfile facultyProfile');

    if (!opportunity) {
        res.status(404);
        throw new Error('Opportunity not found');
    }

    const studentSkills = await getStudentSkillsFromRequest(req);
    const payload = attachMatchToOpportunity(opportunity, studentSkills);
    res.json(payload);
});

// @desc    Apply for opportunity (ARCHITECTURAL UPDATE: Reuses profile resume)
// @route   POST /api/opportunities/:id/apply
// @access  Private (Student only)
const applyForOpportunity = asyncHandler(async (req, res) => {
    const { coverLetter } = req.body;

    // 1. Fetch persistent resume data from User Model
    const user = await User.findById(req.user._id);
    const studentProfile = user.studentProfile;

    if (!studentProfile.resumeFileUrl) {
        res.status(400);
        throw new Error('No resume found on profile. Please upload your resume in the Student Profile section first.');
    }

    const settings = await settingsService.getSettings();
    const opportunity = await Opportunity.findById(req.params.id);

    if (!opportunity) {
        res.status(404);
        throw new Error('Opportunity not found');
    }

    if (opportunity.status !== 'open') {
        res.status(400);
        throw new Error('This opportunity is no longer accepting applications');
    }

    // 2. Max Applications Check
    const activeApplicationsCount = await Application.countDocuments({
        student: req.user._id,
        status: { $in: ['applied', 'shortlisted'] }
    });

    if (activeApplicationsCount >= settings.maxApplicationsPerStudent) {
        res.status(400);
        throw new Error(`Platform Limit: You have reached the maximum of ${settings.maxApplicationsPerStudent} active applications.`);
    }

    // 3. Application Cooldown Check
    const lastApplication = await Application.findOne({ student: req.user._id }).sort('-createdAt');
    if (lastApplication && settings.applicationCooldownDays > 0) {
        const daysSinceLast = (Date.now() - new Date(lastApplication.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceLast < settings.applicationCooldownDays) {
            const daysRemaining = Math.ceil(settings.applicationCooldownDays - daysSinceLast);
            res.status(400);
            throw new Error(`Cooldown Active: Please wait ${daysRemaining} day(s) before applying to another opportunity.`);
        }
    }

    // 4. Multi-offer check
    if (!settings.allowMultipleActiveOffers) {
        const hasActiveOffer = await Application.findOne({
            student: req.user._id,
            status: 'accepted'
        });
        if (hasActiveOffer) {
            res.status(400);
            throw new Error('Platform Policy: Multiple active offers are disabled.');
        }
    }

    // 5. Basic eligibility check
    if (opportunity.eligibilityCriteria) {
        const criteria = opportunity.eligibilityCriteria;
        if (criteria.minYear && studentProfile.year < criteria.minYear) {
            res.status(400);
            throw new Error(`Minimum year requirement not met (Required: ${criteria.minYear})`);
        }
        if (criteria.branches && criteria.branches.length > 0 && !criteria.branches.includes(studentProfile.branch)) {
            res.status(400);
            throw new Error('Your branch is not eligible for this opportunity');
        }
    }

    const alreadyApplied = await Application.findOne({
        opportunity: req.params.id,
        student: req.user._id,
    });

    if (alreadyApplied) {
        res.status(400);
        throw new Error('You have already applied for this opportunity');
    }

    // 6. Calculate Match Percentage using PERSISTENT skills
    const parsedSkills = studentProfile.parsedSkills || [];
    const matchScore = aiService.calculateMatchScore(parsedSkills, opportunity.requiredSkills || []);

    const application = await Application.create({
        opportunity: req.params.id,
        student: req.user._id,
        resume: studentProfile.resumeFileUrl, // Reusing stored URL
        resumeSkills: parsedSkills, // Reusing persistent data
        skillMatchScore: matchScore,
        coverLetter,
    });

    logAction({
        userId: req.user._id,
        action: 'OPPORTUNITY_APPLY_PERSISTENT',
        entityType: 'Application',
        entityId: application._id,
        metadata: { opportunityTitle: opportunity.title, matchScore },
        req
    });

    const populatedOpp = await Opportunity.findById(opportunity._id).populate('postedBy', 'role');
    const ownerRole = populatedOpp.postedBy.role;

    const io = req.app.get('socketio');

    // Create notification for the opportunity owner - APPLIED type (in-app only)
    await notificationService.createNotification({
        recipient: opportunity.postedBy,
        sender: req.user._id,
        title: 'New Application Received',
        message: `${req.user.name} has applied for "${opportunity.title}"`,
        type: 'APPLIED',
        relatedId: application._id,
        sendEmail: false, // APPLIED is in-app only
        link: `/${ownerRole === 'faculty' ? 'faculty' : 'company'}/applications`,
        io: io
    });

    res.status(201).json(application);
});

// @desc    Get student's applications
// @route   GET /api/opportunities/my-applications
// @access  Private (Student)
const getMyApplications = asyncHandler(async (req, res) => {
    const applications = await Application.find({ student: req.user._id })
        .populate('opportunity')
        .sort('-createdAt');
    res.json(applications);
});

module.exports = {
    createOpportunity,
    getOpportunities,
    getOpportunityById,
    applyForOpportunity,
    getMyApplications,
};
