const Message = require('../models/Message');
const Channel = require('../models/Channel');
const Community = require('../models/Community');
const fileService = require('../services/fileService');

exports.sendMessage = async (req, res) => {
    try {
        const { channelId, content, parentMessageId } = req.body;

        const channel = await Channel.findById(channelId).populate('community');
        if (!channel) return res.status(404).json({ message: 'Channel not found' });

        const community = await Community.findById(channel.community._id);
        const role = req.user.role;
        const createdByRole = community.createdByRole;

        // Access Control Logic
        if (role === 'student' && createdByRole !== 'faculty' && createdByRole !== 'company') {
            return res.status(403).json({ message: 'Access denied: Students can only access faculty and company communities' });
        }
        if (role === 'faculty' && createdByRole === 'company') {
            return res.status(403).json({ message: 'Access denied: Faculty cannot send messages in company communities' });
        }
        if (role === 'faculty' && createdByRole !== 'faculty') {
            return res.status(403).json({ message: 'Access denied: Faculty can only access faculty communities' });
        }
        if (role === 'company' && createdByRole !== 'company') {
            return res.status(403).json({ message: 'Access denied: Companies can only access company communities' });
        }

        const message = await Message.create({
            channel: channelId,
            sender: req.user._id,
            content,
            parentMessage: parentMessageId || null
        });

        const fullMessage = await Message.findById(message._id)
            .populate('sender', 'name email role')
            .populate('parentMessage');

        const io = req.app.get('socketio');
        io.to(channelId).emit('newMessage', fullMessage);

        res.status(201).json(fullMessage);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.getMessagesByChannel = async (req, res) => {
    try {
        const channel = await Channel.findById(req.params.channelId).populate('community');
        if (!channel) return res.status(404).json({ message: 'Channel not found' });

        const community = await Community.findById(channel.community._id);
        const role = req.user.role;
        const createdByRole = community.createdByRole;

        // Access Control Logic
        if (role === 'student' && createdByRole !== 'faculty' && createdByRole !== 'company') {
            return res.status(403).json({ message: 'Access denied' });
        }
        if (role === 'faculty' && createdByRole !== 'faculty') {
            return res.status(403).json({ message: 'Access denied' });
        }
        if (role === 'company' && createdByRole !== 'company') {
            return res.status(403).json({ message: 'Access denied' });
        }

        const messages = await Message.find({ channel: req.params.channelId })
            .populate('sender', 'name email role')
            .populate('parentMessage')
            .sort('createdAt');

        res.json(messages);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.replyToMessage = async (req, res) => {
    // Reply logic is handled by sendMessage with parentMessageId
    // keeping this if specific threading logic is needed later
    return exports.sendMessage(req, res);
};

exports.markRead = async (req, res) => {
    try {
        const { messageId } = req.body;

        await Message.findByIdAndUpdate(messageId, {
            $addToSet: {
                readBy: {
                    user: req.user._id,
                    readAt: new Date()
                }
            }
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.toggleHelpful = async (req, res) => {
    try {
        const { messageId } = req.body;
        const message = await Message.findById(messageId);

        if (!message) return res.status(404).json({ message: 'Message not found' });

        const index = message.helpfulBy.indexOf(req.user._id);
        if (index === -1) {
            message.helpfulBy.push(req.user._id);
        } else {
            message.helpfulBy.splice(index, 1);
        }

        await message.save();

        const io = req.app.get('socketio');
        io.to(message.channel.toString()).emit('messageUpdated', {
            messageId,
            helpfulBy: message.helpfulBy
        });

        res.json(message.helpfulBy);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.uploadAttachment = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

        const result = await fileService.uploadFromBuffer(req.file.buffer, {
            folder: 'pict_portal/chat_attachments'
        });

        res.json({ url: result.secure_url });
    } catch (error) {
        res.status(500).json({ message: 'Upload failed', error: error.message });
    }
};
