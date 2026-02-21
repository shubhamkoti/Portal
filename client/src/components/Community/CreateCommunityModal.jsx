import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Users, Briefcase, GraduationCap, Building2 } from 'lucide-react';
import API from '../../utils/api';
import toast from 'react-hot-toast';

const COMMUNITY_TYPES = [
    { id: 'student-student', label: 'Student Community', icon: Users, description: 'Connect with peers' },
    { id: 'student-company', label: 'Company Network', icon: Building2, description: 'Direct industry access' },
    { id: 'student-faculty', label: 'Research Group', icon: GraduationCap, description: 'Academic collaboration' },
    { id: 'student-group', label: 'Project Team', icon: Briefcase, description: 'Work on specific projects' },
];

const CreateCommunityModal = ({ isOpen, onClose, onCreated }) => {
    const [name, setName] = useState('');
    const [type, setType] = useState(COMMUNITY_TYPES[0].id);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await API.post('/community', { name, type });
            toast.success('Community created successfully!');
            onCreated();
            onClose();
            setName('');
            setType(COMMUNITY_TYPES[0].id);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to create community');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6 shadow-2xl"
            >
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-white">Create Community</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Community Name</label>
                        <input
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                            placeholder="e.g. React Developers"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Community Type</label>
                        <div className="grid grid-cols-2 gap-2">
                            {COMMUNITY_TYPES.map((t) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setType(t.id)}
                                    className={`flex flex-col items-center p-3 rounded-lg border transition-all ${type === t.id
                                            ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                                        }`}
                                >
                                    <t.icon size={20} className="mb-2" />
                                    <span className="text-xs font-medium">{t.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                    >
                        {loading ? 'Creating...' : 'Create Community'}
                    </button>
                </form>
            </motion.div>
        </div>
    );
};

export default CreateCommunityModal;
