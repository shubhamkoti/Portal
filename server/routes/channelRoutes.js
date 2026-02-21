const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { createChannel, getChannelsByCommunity, deleteChannel } = require('../controllers/channelController');

router.use(protect);

router.post('/', createChannel);
router.get('/:communityId', getChannelsByCommunity);
router.delete('/:id', deleteChannel);

module.exports = router;
