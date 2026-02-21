const Community = require('../models/Community');
const Channel = require('../models/Channel');

exports.createCommunity = async (req, res) => {
    try {
        const { name, type } = req.body;

        const community = await Community.create({
            name,
            type,
            createdBy: req.user._id,
            createdByRole: req.user.role,
            members: [req.user._id] // Creator is automatically a member
        });

        // Create default 'General' channel
        const generalChannel = await Channel.create({
            name: 'General',
            community: community._id,
            createdBy: req.user._id
        });

        res.status(201).json({ community, defaultChannel: generalChannel });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.deleteCommunity = async (req, res) => {
    try {
        const community = await Community.findById(req.params.id);

        if (!community) {
            return res.status(404).json({ message: 'Community not found' });
        }

        if (community.createdBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to delete this community' });
        }

        await community.deleteOne();
        await Channel.deleteMany({ community: community._id });

        res.json({ message: 'Community deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.getAllCommunities = async (req, res) => {
    try {
        let query = {};

        if (req.user.role === 'student') {
            // Student: Sees all communities
            query = {};
        } else if (req.user.role === 'faculty') {
            // Faculty: Sees only communities created by them AND company communities
            query = {
                $or: [
                    { createdBy: req.user._id },
                    { createdByRole: 'company' }
                ]
            };
        } else if (req.user.role === 'company') {
            // Company: Sees only communities created by them
            query = { createdBy: req.user._id };
        }

        const communities = await Community.find(query)
            .populate('createdBy', 'name email')
            .sort('-createdAt');
        res.json(communities);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.getJoinedCommunities = async (req, res) => {
    try {
        const communities = await Community.find({ members: req.user._id })
            .populate('createdBy', 'name email')
            .sort('-createdAt');
        res.json(communities);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.getCommunityMembers = async (req, res) => {
    try {
        const community = await Community.findById(req.params.id)
            .populate('members', 'name email role');

        if (!community) {
            return res.status(404).json({ message: 'Community not found' });
        }

        // Faculty can view students in company communities
        if (req.user.role === 'faculty' && community.createdByRole === 'company') {
            // Return only student members
            const studentMembers = community.members.filter(member => member.role === 'student');
            return res.json(studentMembers);
        }

        // Default: Only members can view members
        const isMember = community.members.some(member => member._id.toString() === req.user._id.toString());
        if (!isMember && community.createdBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to view members' });
        }

        res.json(community.members);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.getCommunityStudents = async (req, res) => {
    try {
        const community = await Community.findById(req.params.id)
            .populate('members', 'name email role');

        if (!community) {
            return res.status(404).json({ message: 'Community not found' });
        }

        if (req.user.role === 'faculty' && community.createdByRole === 'company') {
            // Return only student members, minimal info
            const students = community.members
                .filter(m => m.role === 'student')
                .map(m => ({
                    id: m._id,
                    name: m.name,
                    email: m.email
                }));
            return res.json(students);
        }

        res.status(403).json({ message: 'Not authorized' });

    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};
