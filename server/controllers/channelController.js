const Channel = require('../models/Channel');
const Community = require('../models/Community');

exports.createChannel = async (req, res) => {
    try {
        const { name, communityId } = req.body;

        const community = await Community.findById(communityId);
        if (!community) {
            return res.status(404).json({ message: 'Community not found' });
        }

        if (community.createdBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Only community creator can create channels' });
        }

        const channel = await Channel.create({
            name,
            community: communityId,
            createdBy: req.user._id
        });

        res.status(201).json(channel);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.getChannelsByCommunity = async (req, res) => {
    try {
        const channels = await Channel.find({ community: req.params.communityId })
            .sort('createdAt');
        res.json(channels);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.deleteChannel = async (req, res) => {
    try {
        const channel = await Channel.findById(req.params.id).populate('community');

        if (!channel) {
            return res.status(404).json({ message: 'Channel not found' });
        }

        if (channel.community.createdBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Only community creator can delete channels' });
        }

        await channel.deleteOne();
        res.json({ message: 'Channel deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};
