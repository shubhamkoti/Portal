import React, { useState, useEffect } from 'react';
import { X, Check, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import API from '../../utils/api';
import toast from 'react-hot-toast';

const JoinRequestPanel = ({ isOpen, onClose }) => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchRequests = async () => {
        try {
            const { data } = await API.get('/join/pending');
            setRequests(data);
        } catch (error) {
            console.error('Failed to fetch requests', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchRequests();
        }
    }, [isOpen]);

    const handleAction = async (requestId, action) => {
        try {
            if (action === 'accept') {
                await API.put(`/join/${requestId}/accept`);
                toast.success('Request accepted');
            } else {
                await API.put(`/join/${requestId}/reject`);
                toast.success('Request rejected');
            }
            setRequests(prev => prev.filter(req => req._id !== requestId));
        } catch (error) {
            toast.error(`Failed to ${action} request`);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl p-6 shadow-2xl max-h-[80vh] flex flex-col"
            >
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-800">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Clock className="text-blue-400" />
                        Pending Join Requests
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                    {loading ? (
                        <div className="text-center text-slate-400 py-8">Loading requests...</div>
                    ) : requests.length === 0 ? (
                        <div className="text-center text-slate-500 py-12 flex flex-col items-center">
                            <Clock size={48} className="mb-4 opacity-50" />
                            <p>No pending requests found</p>
                        </div>
                    ) : (
                        requests.map(request => (
                            <div key={request._id} className="bg-slate-800/50 rounded-lg p-4 flex items-center justify-between border border-slate-700/50 hover:border-slate-600 transition-colors">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-semibold text-white">{request.requester.name}</span>
                                        <span className="text-xs text-slate-500">({request.requester.email})</span>
                                    </div>
                                    <p className="text-sm text-slate-400">
                                        Requested to join <span className="text-blue-400 font-medium">{request.community.name}</span>
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleAction(request._id, 'accept')}
                                        className="p-2 bg-green-500/10 text-green-400 rounded hover:bg-green-500/20 transition-colors"
                                        title="Accept"
                                    >
                                        <Check size={18} />
                                    </button>
                                    <button
                                        onClick={() => handleAction(request._id, 'reject')}
                                        className="p-2 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition-colors"
                                        title="Reject"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </motion.div>
        </div>
    );
};

export default JoinRequestPanel;
