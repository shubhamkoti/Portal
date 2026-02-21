import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Plus, Hash, Bell, MessageSquare, LogOut, Grid, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import API from '../utils/api';
import ChannelSidebar from '../components/Community/ChannelSidebar';
import ChatWindow from '../components/Community/ChatWindow';
import CreateCommunityModal from '../components/Community/CreateCommunityModal';
import JoinRequestPanel from '../components/Community/JoinRequestPanel';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const Community = () => {
    const { user, socket } = useAuth();
    const [communities, setCommunities] = useState([]);
    const [selectedCommunity, setSelectedCommunity] = useState(null);
    const [channels, setChannels] = useState([]);
    const [selectedChannel, setSelectedChannel] = useState(null);

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isJoinPanelOpen, setIsJoinPanelOpen] = useState(false);
    const [viewMode, setViewMode] = useState('list');

    const fetchCommunities = async () => {
        try {
            const { data } = await API.get('/community/joined');
            setCommunities(data);
        } catch (error) {
            console.error('Failed to fetch communities', error);
        }
    };

    const fetchChannels = async (communityId) => {
        try {
            const { data } = await API.get(`/channel/${communityId}`);
            setChannels(data);
            if (data.length > 0) setSelectedChannel(data[0]);
        } catch (error) {
            console.error('Failed to fetch channels', error);
        }
    };

    useEffect(() => {
        fetchCommunities();
    }, []);

    useEffect(() => {
        if (selectedCommunity) {
            fetchChannels(selectedCommunity._id);
        }
    }, [selectedCommunity]);

    useEffect(() => {
        if (!socket) return;

        socket.on('notifyJoinRequest', (data) => {
            toast('New Join Request', {
                icon: '👋',
                description: `${data.requesterName} wants to join ${data.communityName}`
            });
        });

        socket.on('notifyJoinDecision', (data) => {
            toast(data.status === 'accepted' ? 'Join Request Accepted!' : 'Join Request Rejected', {
                description: `For community: ${data.communityName}`,
                icon: data.status === 'accepted' ? '✅' : '❌'
            });
            if (data.status === 'accepted') fetchCommunities();
        });

        return () => {
            socket.off('notifyJoinRequest');
            socket.off('notifyJoinDecision');
        };
    }, [socket]);

    const handleSelectCommunity = (comm) => {
        setSelectedCommunity(comm);
        setSelectedChannel(null);
    };

    if (!user) return null;

    return (
        <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-slate-950 text-white font-sans">
            {/* Primary Sidebar - Communities */}
            <div className="w-[72px] bg-slate-900 border-r border-slate-800 flex flex-col items-center py-4 space-y-4 shrink-0 overflow-y-auto no-scrollbar">
                <button
                    onClick={() => { setSelectedCommunity(null); setViewMode('list'); }}
                    className={`group relative w-12 h-12 rounded-[24px] hover:rounded-[16px] flex items-center justify-center transition-all duration-200 ${!selectedCommunity ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                    title="Discover Communities"
                >
                    <Grid size={24} />
                    {!selectedCommunity && (
                        <div className="absolute left-0 w-1 h-8 bg-white rounded-r my-auto top-0 bottom-0" />
                    )}
                </button>

                <div className="w-8 h-px bg-slate-800 rounded-full" />

                {communities.map(comm => (
                    <button
                        key={comm._id}
                        onClick={() => handleSelectCommunity(comm)}
                        className={`group relative w-12 h-12 transition-all duration-200 ${selectedCommunity?._id === comm._id ? 'rounded-[16px] bg-blue-600 text-white' : 'rounded-[24px] hover:rounded-[16px] bg-slate-800 text-slate-400 hover:bg-blue-600 hover:text-white'}`}
                        title={comm.name}
                    >
                        <div className="w-full h-full flex items-center justify-center font-bold text-lg">
                            {comm.name.substring(0, 2).toUpperCase()}
                        </div>
                        {selectedCommunity?._id === comm._id && (
                            <div className="absolute left-0 w-1 h-8 bg-white rounded-r my-auto top-0 bottom-0" />
                        )}
                        <div className="absolute left-0 w-1 h-4 bg-white rounded-r my-auto top-0 bottom-0 scale-y-0 group-hover:scale-y-100 transition-transform origin-left" />
                    </button>
                ))}

                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="group w-12 h-12 rounded-[24px] hover:rounded-[16px] bg-slate-800 text-green-500 hover:bg-green-600 hover:text-white flex items-center justify-center transition-all duration-200"
                    title="Create Community"
                >
                    <Plus size={24} className="group-hover:rotate-90 transition-transform duration-200" />
                </button>

                <div className="flex-1" />

                <button
                    onClick={() => setIsJoinPanelOpen(true)}
                    className="group w-12 h-12 rounded-[24px] hover:rounded-[16px] bg-slate-800 text-yellow-500 hover:bg-yellow-600 hover:text-white flex items-center justify-center transition-all duration-200 relative"
                    title="Pending Requests"
                >
                    <Bell size={24} className="group-hover:swing" />
                </button>
            </div>

            {/* Secondary Sidebar - Channels (Only if Community Selected) */}
            {selectedCommunity && (
                <ChannelSidebar
                    community={selectedCommunity}
                    channels={channels}
                    selectedChannel={selectedChannel}
                    onSelectChannel={setSelectedChannel}
                    isOwner={selectedCommunity.createdBy._id === user._id || selectedCommunity.createdBy === user._id}
                    onRefreshChannels={() => fetchChannels(selectedCommunity._id)}
                />
            )}

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-slate-950 relative">
                {!selectedCommunity ? (
                    <CommunityDiscovery />
                ) : selectedChannel ? (
                    <ChatWindow
                        channel={selectedChannel}
                        key={selectedChannel._id}
                    />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                        <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mb-4">
                            <Hash size={32} className="opacity-50" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">Welcome to {selectedCommunity.name}</h3>
                        <p>Select a channel from the sidebar to start chatting.</p>
                    </div>
                )}
            </div>

            <CreateCommunityModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onCreated={() => fetchCommunities()}
            />

            <JoinRequestPanel
                isOpen={isJoinPanelOpen}
                onClose={() => setIsJoinPanelOpen(false)}
            />
        </div>
    );
};

// Internal component for discovering communities
const CommunityDiscovery = () => {
    const [allCommunities, setAllCommunities] = useState([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();
    const [joinedIds, setJoinedIds] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        const loadAll = async () => {
            try {
                const [allRes, joinedRes] = await Promise.all([
                    API.get('/community'),
                    API.get('/community/joined')
                ]);
                setAllCommunities(allRes.data);
                setJoinedIds(joinedRes.data.map(c => c._id));
            } catch (error) {
                console.error('Failed to load communities', error);
                toast.error('Failed to load discovery');
            } finally {
                setLoading(false);
            }
        };
        loadAll();
    }, []);

    const handleJoin = async (id) => {
        try {
            await API.post('/join', { communityId: id });
            toast.success('Join request sent successfully!');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to join');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure you want to delete this community?")) return;
        try {
            await API.delete(`/community/${id}`);
            toast.success('Community deleted successfully');
            setAllCommunities(prev => prev.filter(c => c._id !== id));
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to delete');
        }
    };

    if (loading) return (
        <div className="flex-1 flex items-center justify-center text-slate-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mr-2"></div>
            Loading communities...
        </div>
    );

    return (
        <div className="flex-1 bg-slate-900 p-8 overflow-y-auto">
            <div className="max-w-6xl mx-auto">
                <div className="mb-8">
                    <h2 className="text-3xl font-bold text-white mb-2">Discover Communities</h2>
                    <p className="text-slate-400">Find and join communities relative to your interests and career goals.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {allCommunities.map(comm => {
                        const isJoined = joinedIds.includes(comm._id);
                        const isCreator = (comm.createdBy?._id === user._id) || (comm.createdBy === user._id);
                        const isFacultyViewingCompany = user?.role === 'faculty' && comm.createdByRole === 'company';

                        return (
                            <div key={comm._id} className="bg-slate-800 rounded-xl p-6 border border-slate-700 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10 transition-all group">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xl shadow-lg">
                                        {comm.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-700 text-slate-300 border border-slate-600 uppercase tracking-wider">
                                            {comm.type.split('-')[1] || 'General'}
                                        </span>
                                        {isCreator && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDelete(comm._id);
                                                }}
                                                className="p-1 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                                                title="Delete Community"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <h3 className="text-xl font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">{comm.name}</h3>
                                <p className="text-sm text-slate-400 mb-6 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                                    Created by {comm.createdBy?.name || 'Unknown'}
                                </p>

                                {isFacultyViewingCompany ? (
                                    <button
                                        onClick={() => navigate(`/community/${comm._id}/students`)}
                                        className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-all shadow-lg shadow-purple-600/20"
                                    >
                                        View Students
                                    </button>
                                ) : isJoined ? (
                                    <button disabled className="w-full py-2.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 text-sm font-semibold cursor-default flex items-center justify-center gap-2">
                                        <MessageSquare size={16} />
                                        Already a Member
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => handleJoin(comm._id)}
                                        className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-600/40 active:scale-[0.98]"
                                    >
                                        Ask to Join
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>

                {allCommunities.length === 0 && (
                    <div className="text-center py-20">
                        <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Grid size={40} className="text-slate-600" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">No Communities Found</h3>
                        <p className="text-slate-400">Be the first to create a community and start the conversation!</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Community;
