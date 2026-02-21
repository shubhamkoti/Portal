const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    createCommunity,
    getAllCommunities,
    getJoinedCommunities,
    deleteCommunity,
    getCommunityMembers,
    getCommunityStudents
} = require('../controllers/communityController');

router.use(protect);

router.post('/', createCommunity);
router.get('/', getAllCommunities); // Get all available communities
router.get('/joined', getJoinedCommunities); // Get joined communities
router.delete('/:id', deleteCommunity);
router.get('/:id/members', getCommunityMembers);
router.get('/:id/students', getCommunityStudents);

module.exports = router;
