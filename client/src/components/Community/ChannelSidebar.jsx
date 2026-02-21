import React, { useState } from 'react';
import { Plus, Hash, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import API from '../../utils/api';

const ChannelSidebar = ({
    community,
    channels,
    selectedChannel,
    onSelectChannel,
    isOwner,
    onRefreshChannels
}) => {
    const [isCreating, setIsCreating] = useState(false);
    const [newChannelName, setNewChannelName] = useState('');

    const handleCreateChannel = async (e) => {
        e.preventDefault();
        try {
            await API.post('/channel', {
                name: newChannelName,
                communityId: community._id
            });
            setNewChannelName('');
            setIsCreating(false);
            onRefreshChannels();
            toast.success('Channel created');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to create channel');
        }
    };

    const handleDeleteChannel = async (channelId, e) => {
        e.stopPropagation();
        if (!window.confirm('Are you sure you want to delete this channel?')) return;

        try {
            await API.delete(`/channel/${channelId}`);
            onRefreshChannels();
            toast.success('Channel deleted');
        } catch (error) {
            toast.error('Failed to delete channel');
        }
    };

    return (
        <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-full">
            <div className="p-4 border-b border-slate-800">
                <h2 className="font-bold text-white truncate">{community.name}</h2>
                <p className="text-xs text-slate-400 capitalize">{community.type}</p>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                <div className="flex items-center justify-between px-2 py-1 text-slate-400 text-xs font-semibold uppercase">
                    <span>Channels</span>
                    {isOwner && (
                        <button
                            onClick={() => setIsCreating(true)}
                            className="hover:text-white transition-colors"
                        >
                            <Plus size={14} />
                        </button>
                    )}
                </div>

                <AnimatePresence>
                    {isCreating && (
                        <motion.form
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            onSubmit={handleCreateChannel}
                            className="px-2 mb-2"
                        >
                            <input
                                autoFocus
                                type="text"
                                placeholder="Channel name..."
                                className="w-full bg-slate-800 text-white text-sm px-2 py-1 rounded border border-slate-700 focus:border-blue-500 outline-none"
                                value={newChannelName}
                                onChange={(e) => setNewChannelName(e.target.value)}
                                onBlur={() => !newChannelName && setIsCreating(false)}
                            />
                        </motion.form>
                    )}
                </AnimatePresence>

                {channels.map(channel => (
                    <button
                        key={channel._id}
                        onClick={() => onSelectChannel(channel)}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded group transition-all ${selectedChannel?._id === channel._id
                                ? 'bg-blue-600/20 text-blue-400'
                                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                            }`}
                    >
                        <div className="flex items-center gap-2 truncate">
                            <Hash size={16} className="shrink-0" />
                            <span className="truncate text-sm">{channel.name}</span>
                        </div>
                        {isOwner && channel.name !== 'General' && (
                            <div
                                onClick={(e) => handleDeleteChannel(channel._id, e)}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity"
                            >
                                <Trash2 size={12} />
                            </div>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default ChannelSidebar;
