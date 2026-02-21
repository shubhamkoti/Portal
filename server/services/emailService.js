const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

/**
 * Email Service
 * Handles sending emails via Nodemailer
 */
class EmailService {
    constructor() {
        this.transporter = null;
        this.initializeTransporter();
    }

    initializeTransporter() {
        try {
            const smtpHost = process.env.SMTP_HOST;
            const smtpPort = process.env.SMTP_PORT || 587;
            const smtpEmail = process.env.SMTP_EMAIL;
            const smtpPassword = process.env.SMTP_PASSWORD;

            if (!smtpHost || !smtpEmail || !smtpPassword) {
                logger.warn('[EMAIL_SERVICE] SMTP configuration incomplete. Email sending disabled.');
                return;
            }

            this.transporter = nodemailer.createTransport({
                host: smtpHost,
                port: parseInt(smtpPort),
                secure: parseInt(smtpPort) === 465, // true for 465, false for other ports
                auth: {
                    user: smtpEmail,
                    pass: smtpPassword,
                },
            });

            logger.info('[EMAIL_SERVICE] Transporter initialized successfully');
        } catch (error) {
            logger.error(`[EMAIL_SERVICE] Failed to initialize transporter: ${error.message}`);
        }
    }

    /**
     * Send notification email
     * @param {Object} options
     * @param {String} options.recipientEmail - Recipient email address
     * @param {String} options.recipientName - Recipient name
     * @param {String} options.title - Email subject/title
     * @param {String} options.message - Email message content
     * @param {String} options.type - Notification type (APPLIED, REJECTED, APPROVED, SELECTED, COMMUNITY)
     * @param {String} options.link - Optional link to related resource
     */
    async sendNotificationEmail({ recipientEmail, recipientName, title, message, type, link }) {
        if (!this.transporter) {
            logger.warn('[EMAIL_SERVICE] Transporter not initialized. Skipping email send.');
            return false;
        }

        try {
            // Determine email template based on type
            const emailTemplate = this.getEmailTemplate(type, title, message, link);

            const mailOptions = {
                from: `"Internship Portal" <${process.env.SMTP_EMAIL}>`,
                to: recipientEmail,
                subject: title || 'Notification from Internship Portal',
                html: emailTemplate,
            };

            await this.transporter.sendMail(mailOptions);
            logger.info(`[EMAIL_SERVICE] Notification email sent to ${recipientEmail}`);
            return true;
        } catch (error) {
            logger.error(`[EMAIL_SERVICE] Failed to send email: ${error.message}`);
            return false;
        }
    }

    /**
     * Send email verification email
     * @param {Object} options
     * @param {String} options.recipientEmail - Recipient email address
     * @param {String} options.recipientName - Recipient name
     * @param {String} options.verificationToken - Email verification token
     */
    async sendVerificationEmail({ recipientEmail, recipientName, verificationToken }) {
        if (!this.transporter) {
            logger.warn('[EMAIL_SERVICE] Transporter not initialized. Skipping email send.');
            return false;
        }

        try {
            const verificationLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email/${verificationToken}`;

            const mailOptions = {
                from: `"Internship Portal" <${process.env.SMTP_EMAIL}>`,
                to: recipientEmail,
                subject: 'Verify Your Email Address - Internship Portal',
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Email Verification</title>
                    </head>
                    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
                            <h2 style="color: #2c3e50; margin-top: 0;">Email Verification Required</h2>
                            <p>Hello ${recipientName || 'User'},</p>
                            <p>Thank you for registering as a faculty member on the Internship Portal. To complete your registration, please verify your email address by clicking the button below:</p>
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${verificationLink}" style="background-color: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email Address</a>
                            </div>
                            <p>Or copy and paste this link into your browser:</p>
                            <p style="word-break: break-all; color: #3498db;">${verificationLink}</p>
                            <p style="color: #7f8c8d; font-size: 12px; margin-top: 30px;">This link will expire in 24 hours. If you did not register for this account, please ignore this email.</p>
                        </div>
                    </body>
                    </html>
                `,
            };

            await this.transporter.sendMail(mailOptions);
            logger.info(`[EMAIL_SERVICE] Verification email sent to ${recipientEmail}`);
            return true;
        } catch (error) {
            logger.error(`[EMAIL_SERVICE] Failed to send verification email: ${error.message}`);
            return false;
        }
    }

    /**
     * Get email template based on notification type
     */
    getEmailTemplate(type, title, message, link) {
        const baseTemplate = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${title}</title>
            </head>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
                    <h2 style="color: #2c3e50; margin-top: 0;">${title}</h2>
                    <p>${message}</p>
                    ${link ? `
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${link}" style="background-color: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Details</a>
                        </div>
                    ` : ''}
                    <p style="color: #7f8c8d; font-size: 12px; margin-top: 30px;">This is an automated notification from the Internship Portal.</p>
                </div>
            </body>
            </html>
        `;

        return baseTemplate;
    }
}

// Export singleton instance
module.exports = new EmailService();
