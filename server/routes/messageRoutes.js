const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect } = require('../middleware/authMiddleware');
const { sendMessage, getMessagesByChannel, markRead, toggleHelpful, uploadAttachment } = require('../controllers/messageController');

const upload = multer({ storage: multer.memoryStorage() });

router.use(protect);

router.post('/', sendMessage);
router.post('/upload', upload.single('file'), uploadAttachment);
router.get('/:channelId', getMessagesByChannel);
router.post('/read', markRead);
router.post('/helpful', toggleHelpful);

module.exports = router;
