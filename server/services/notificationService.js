const Notification = require('../models/Notification');
const User = require('../models/User');
const logger = require('../utils/logger');
const emailService = require('./emailService');

/**
 * Notification Service
 * Handles persistence and real-time delivery of notifications
 */
const notificationService = {
    /**
     * Send a notification to a specific user
     * @param {Object} data - Notification details
     * @param {string} data.userId - Recipient user ID
     * @param {string} data.type - Notification type
     * @param {string} data.message - Notification content
     * @param {string} data.title - Optional title
     * @param {string} data.priority - low, medium, high
     * @param {string} data.senderId - Optional sender ID
     * @param {string} data.link - Optional redirection link
     * @param {Object} data.metadata - Optional extra data
     * @param {Object} io - Socket.io instance
     */
    sendNotification: async (data, io) => {
        try {
            const { userId, type, message, title, priority, senderId, link, metadata } = data;

            // 1. Persist to Database
            const notification = await Notification.create({
                userId,
                type,
                message,
                title: title || 'System Update',
                priority: priority || 'low',
                sender: senderId,
                link,
                metadata: metadata || {}
            });

            // 2. Immediate real-time delivery
            if (io) {
                io.emitToUser(userId.toString(), 'notification:new', notification);
                logger.debug(`[NOTIFICATION] Real-time delivery to user ${userId}`);
            }

            return notification;
        } catch (error) {
            logger.error(`[NOTIFICATION_SERVICE] Error: ${error.message}`);
            throw error;
        }
    },

    /**
     * Notify multiple users (e.g. broadcast)
     */
    broadcast: async (data, userIds, io) => {
        try {
            const notifications = userIds.map(userId => ({
                userId,
                type: data.type,
                title: data.title,
                message: data.message,
                priority: data.priority || 'low',
                sender: data.senderId,
                link: data.link,
                metadata: data.metadata || {}
            }));

            const createdLogs = await Notification.insertMany(notifications);

            if (io) {
                userIds.forEach(userId => {
                    io.emitToUser(userId.toString(), 'notification:new', createdLogs.find(l => l.userId.toString() === userId.toString()));
                });
            }

            return createdLogs;
        } catch (error) {
            logger.error(`[NOTIFICATION_SERVICE] Broadcast Error: ${error.message}`);
            throw error;
        }
    },

    /**
     * Create notification with optional email support
     * @param {Object} options
     * @param {ObjectId} options.recipient - Recipient user ID
     * @param {ObjectId} options.sender - Sender user ID (optional)
     * @param {String} options.title - Notification title
     * @param {String} options.message - Notification message
     * @param {String} options.type - Notification type (APPLIED, REJECTED, APPROVED, SELECTED, COMMUNITY)
     * @param {ObjectId} options.relatedId - Related entity ID (optional)
     * @param {String} options.relatedModel - Related model name (optional)
     * @param {Boolean} options.sendEmail - Whether to send email notification (default: false)
     * @param {String} options.link - Optional link for notification
     * @param {Object} io - Socket.io instance (optional)
     */
    createNotification: async ({
        recipient,
        sender,
        title,
        message,
        type,
        relatedId,
        relatedModel,
        sendEmail = false,
        link,
        io
    }) => {
        try {
            // Determine relatedModel from type if not provided
            let modelName = relatedModel;
            if (!modelName && relatedId) {
                if (['APPLIED', 'REJECTED', 'APPROVED', 'SELECTED'].includes(type)) {
                    modelName = 'Application';
                } else if (type === 'COMMUNITY') {
                    modelName = 'Community';
                }
            }

            // 1. Persist to Database
            const notification = await Notification.create({
                userId: recipient,
                sender: sender,
                type: type,
                title: title || 'System Update',
                message: message,
                read: false,
                relatedId: relatedId,
                relatedModel: modelName,
                link: link,
                priority: 'medium'
            });

            // 2. Send email if requested
            if (sendEmail) {
                try {
                    const recipientUser = await User.findById(recipient).select('name email');
                    if (recipientUser && recipientUser.email) {
                        await emailService.sendNotificationEmail({
                            recipientEmail: recipientUser.email,
                            recipientName: recipientUser.name,
                            title: title || 'System Update',
                            message: message,
                            type: type,
                            link: link
                        });
                    }
                } catch (emailError) {
                    logger.error(`[NOTIFICATION_SERVICE] Email send failed: ${emailError.message}`);
                    // Don't throw - notification is still saved
                }
            }

            // 3. Real-time delivery via Socket.io
            if (io) {
                io.emitToUser(recipient.toString(), 'notification:new', notification);
                logger.debug(`[NOTIFICATION] Real-time delivery to user ${recipient}`);
            }

            return notification;
        } catch (error) {
            logger.error(`[NOTIFICATION_SERVICE] Error creating notification: ${error.message}`);
            throw error;
        }
    }
};

module.exports = notificationService;
