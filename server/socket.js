const socketio = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Message = require('./models/Message');
const Community = require('./models/Community');
const Channel = require('./models/Channel');

const userSockets = new Map();

const initSocket = (server) => {
    const io = socketio(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        },
        pingTimeout: 60000,
        pingInterval: 25000
    });

    // Helper to emit to specific user's sockets
    io.emitToUser = (userId, event, data) => {
        const sockets = userSockets.get(userId);
        if (!sockets) return;

        sockets.forEach(socketId => {
            io.to(socketId).emit(event, data);
        });
    };

    // JWT Authentication Middleware for Sockets
    io.use(async (socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error("Authentication error: No token provided"));
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).select("-password");
            if (!user) {
                return next(new Error("Authentication error: User not found"));
            }

            if (user.status === 'blocked' || user.status === 'rejected') {
                return next(new Error("Authentication error: Account blocked or rejected"));
            }

            socket.user = user;
            next();
        } catch (err) {
            next(new Error("Authentication error: Invalid token"));
        }
    });

    io.on('connection', (socket) => {
        const userId = socket.user._id.toString();
        socket.userId = userId;

        // Store user socket
        if (!userSockets.has(userId)) {
            userSockets.set(userId, new Set());
        }
        userSockets.get(userId).add(socket.id);

        console.log(`User connected: ${socket.user.name} (${socket.id})`);

        // Join personal room for private notifications
        socket.join(userId);

        // Community rooms
        // Community rooms
        socket.on('join_room', async (communityId) => {
            try {
                const community = await Community.findById(communityId);
                if (!community) return;

                const role = socket.user.role;
                const createdByRole = community.createdByRole;

                if (role === 'student' && createdByRole !== 'faculty' && createdByRole !== 'company') return;
                if (role === 'faculty' && createdByRole !== 'faculty') return;
                if (role === 'company' && createdByRole !== 'company') return;

                socket.join(communityId);
            } catch (err) {
                console.error("Join Room Error:", err);
            }
        });

        socket.on('leave_room', (communityId) => {
            socket.leave(communityId);
        });

        // Opportunity rooms for real-time practice updates
        socket.on('join_opportunity', (oppId) => {
            socket.join(`opportunity_${oppId}`);
        });

        socket.on('leave_opportunity', (oppId) => {
            socket.leave(`opportunity_${oppId}`);
        });

        // Faculty & Project specific real-time rooms
        if (socket.user.role === 'faculty') {
            socket.join(`faculty:${socket.user._id}`);
        }

        if (socket.user.role === 'company') {
            socket.join(`company:${socket.user._id}`);
        }

        socket.on('join_project', (projectId) => {
            socket.join(`project:${projectId}`);
        });

        socket.on('leave_project', (projectId) => {
            socket.leave(`project:${projectId}`);
        });

        socket.on('send_project_message', (data) => {
            io.to(`project:${data.projectId}`).emit('new_project_message', {
                ...data,
                sender: { _id: socket.user._id, name: socket.user.name, role: socket.user.role },
                createdAt: new Date()
            });
        });

        socket.on('join_opportunity_chat', (oppId) => {
            socket.join(`opportunity_chat:${oppId}`);
        });

        socket.on('send_opportunity_message', (data) => {
            io.to(`opportunity_chat:${data.oppId}`).emit('new_opportunity_message', {
                ...data,
                sender: { _id: socket.user._id, name: socket.user.name, role: socket.user.role },
                createdAt: new Date()
            });
        });

        socket.on('leave_opportunity_chat', (oppId) => {
            socket.leave(`opportunity_chat:${oppId}`);
        });

        // Team Collaboration Events
        socket.on('team:typing', (data) => {
            // data contains: teamId, isTyping
            socket.to(`project:${data.teamId}`).emit('team:typing_update', {
                userId: socket.user._id,
                userName: socket.user.name,
                isTyping: data.isTyping
            });
        });

        socket.on('team:read_receipt', (data) => {
            // data contains: teamId, messageId
            socket.to(`project:${data.teamId}`).emit('team:read_update', {
                messageId: data.messageId,
                userId: socket.user._id,
                at: new Date()
            });
        });

        // Community & Channel Events
        // Community & Channel Events
        socket.on('joinChannelRoom', async (channelId) => {
            try {
                const channel = await Channel.findById(channelId).populate('community');
                if (!channel) return;

                const community = await Community.findById(channel.community._id);
                const role = socket.user.role;
                const createdByRole = community.createdByRole;

                if (role === 'student' && createdByRole !== 'faculty' && createdByRole !== 'company') {
                    return socket.emit('error', { message: 'Access denied' });
                }
                if (role === 'faculty' && createdByRole !== 'faculty') {
                    return socket.emit('error', { message: 'Access denied' });
                }
                if (role === 'company' && createdByRole !== 'company') {
                    return socket.emit('error', { message: 'Access denied' });
                }

                socket.join(channelId);
                console.log(`User ${socket.user.name} joined channel ${channelId}`);
            } catch (err) {
                console.error("Join Channel Error:", err);
            }
        });

        socket.on('leaveChannelRoom', (channelId) => {
            socket.leave(channelId);
        });

        socket.on('sendMessage', async (data) => {
            try {
                const { channelId, content, parentMessageId } = data;

                const channel = await Channel.findById(channelId).populate('community');
                if (!channel) return socket.emit('error', { message: 'Channel not found' });

                const community = await Community.findById(channel.community._id);
                const role = socket.user.role;
                const createdByRole = community.createdByRole;

                if (role === 'student' && createdByRole !== 'faculty' && createdByRole !== 'company') {
                    return socket.emit('error', { message: 'Access denied' });
                }
                if (role === 'faculty' && createdByRole !== 'faculty') {
                    return socket.emit('error', { message: 'Access denied' });
                }
                if (role === 'company' && createdByRole !== 'company') {
                    return socket.emit('error', { message: 'Access denied' });
                }
                const message = await Message.create({
                    channel: channelId,
                    sender: socket.user._id,
                    content,
                    parentMessage: parentMessageId || null
                });

                const fullMessage = await Message.findById(message._id)
                    .populate('sender', 'name email role')
                    .populate('parentMessage');

                io.to(channelId).emit('newMessage', fullMessage);
            } catch (err) {
                console.error('Socket message error:', err);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        socket.on('typing', (data) => {
            socket.to(data.channelId).emit('userTyping', {
                userId: socket.user._id,
                name: socket.user.name
            });
        });

        socket.on('stopTyping', (data) => {
            socket.to(data.channelId).emit('userStoppedTyping', {
                userId: socket.user._id
            });
        });

        socket.on('disconnect', () => {
            const userId = socket.userId;
            if (userId && userSockets.has(userId)) {
                const sockets = userSockets.get(userId);
                sockets.delete(socket.id);
                if (sockets.size === 0) {
                    userSockets.delete(userId);
                }
                console.log("Socket cleaned:", socket.id);
            }
            console.log(`User disconnected: ${socket.id}`);
        });
    });

    return io;
};

module.exports = initSocket;
