const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { sendJoinRequest, getPendingRequests, acceptRequest, rejectRequest } = require('../controllers/joinController');

router.use(protect);

router.post('/', sendJoinRequest);
router.get('/pending', getPendingRequests);
router.put('/:id/accept', acceptRequest);
router.put('/:id/reject', rejectRequest);

module.exports = router;
