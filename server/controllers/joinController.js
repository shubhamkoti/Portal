const JoinRequest = require('../models/JoinRequest');
const Community = require('../models/Community');

exports.sendJoinRequest = async (req, res) => {
    try {
        const { communityId } = req.body;

        const community = await Community.findById(communityId);
        if (!community) {
            return res.status(404).json({ message: 'Community not found' });
        }

        if (community.members.includes(req.user._id)) {
            return res.status(400).json({ message: 'Already a member' });
        }

        const existingRequest = await JoinRequest.findOne({
            community: communityId,
            requester: req.user._id,
            status: 'pending'
        });

        if (existingRequest) {
            return res.status(400).json({ message: 'Request already pending' });
        }

        const joinRequest = await JoinRequest.create({
            community: communityId,
            requester: req.user._id
        });

        // Notify community creator via socket
        const io = req.app.get('socketio');
        io.emitToUser(community.createdBy.toString(), 'notifyJoinRequest', {
            communityName: community.name,
            requesterName: req.user.name,
            requestId: joinRequest._id
        });

        res.status(201).json(joinRequest);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.getPendingRequests = async (req, res) => {
    try {
        // Find communities created by the user
        const communities = await Community.find({ createdBy: req.user._id });
        const communityIds = communities.map(c => c._id);

        const requests = await JoinRequest.find({
            community: { $in: communityIds },
            status: 'pending'
        })
            .populate('community', 'name')
            .populate('requester', 'name email');

        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.acceptRequest = async (req, res) => {
    try {
        const request = await JoinRequest.findById(req.params.id).populate('community');

        if (!request) {
            return res.status(404).json({ message: 'Request not found' });
        }

        if (request.community.createdBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        request.status = 'accepted';
        await request.save();

        // Add user to community members
        await Community.findByIdAndUpdate(request.community._id, {
            $addToSet: { members: request.requester }
        });

        // Notify requester
        const io = req.app.get('socketio');
        io.emitToUser(request.requester.toString(), 'notifyJoinDecision', {
            communityName: request.community.name,
            status: 'accepted'
        });

        res.json({ message: 'Request accepted' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.rejectRequest = async (req, res) => {
    try {
        const request = await JoinRequest.findById(req.params.id).populate('community');

        if (!request) {
            return res.status(404).json({ message: 'Request not found' });
        }

        if (request.community.createdBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        request.status = 'rejected';
        await request.save();

        // Notify requester
        const io = req.app.get('socketio');
        io.emitToUser(request.requester.toString(), 'notifyJoinDecision', {
            communityName: request.community.name,
            status: 'rejected'
        });

        res.json({ message: 'Request rejected' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};
