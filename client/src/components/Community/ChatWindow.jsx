import React, { useState, useEffect, useRef } from 'react';
import { Send, Image as ImageIcon, ThumbsUp, Reply, MoreVertical, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import API from '../../utils/api';
import toast from 'react-hot-toast';

const ChatWindow = ({ channel }) => {
    const { user, socket } = useAuth();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [attachment, setAttachment] = useState(null);
    const [replyTo, setReplyTo] = useState(null);
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        if (!channel || !socket) return;

        const loadMessages = async () => {
            try {
                const { data } = await API.get(`/messages/${channel._id}`);
                setMessages(data);
                scrollToBottom();
            } catch (error) {
                console.error('Failed to load messages', error);
            }
        };

        loadMessages();
        socket.emit('joinChannelRoom', channel._id);

        const handleNewMessage = (msg) => {
            if (msg.channel === channel._id) {
                setMessages(prev => [...prev, msg]);
                scrollToBottom();
            }
        };

        const handleMessageUpdate = ({ messageId, helpfulBy }) => {
            setMessages(prev => prev.map(msg =>
                msg._id === messageId ? { ...msg, helpfulBy } : msg
            ));
        };

        socket.on('newMessage', handleNewMessage);
        socket.on('messageUpdated', handleMessageUpdate);

        return () => {
            socket.emit('leaveChannelRoom', channel._id);
            socket.off('newMessage', handleNewMessage);
            socket.off('messageUpdated', handleMessageUpdate);
        };
    }, [channel, socket]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleSend = async (e) => {
        e.preventDefault();
        if ((!input.trim() && !attachment) || uploading) return;

        try {
            setUploading(true);
            let contentToSend = input;

            if (attachment) {
                const formData = new FormData();
                formData.append('file', attachment);

                const uploadRes = await API.post('/messages/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                // Construct message with attachment link
                const attachmentLink = `\n\n![Attachment](${uploadRes.data.url})`;
                contentToSend = input + attachmentLink;
            }

            await API.post('/messages', {
                channelId: channel._id,
                content: contentToSend,
                parentMessageId: replyTo?._id || null
            });

            setInput('');
            setAttachment(null);
            setReplyTo(null);
        } catch (error) {
            toast.error('Failed to send message');
            console.error(error);
        } finally {
            setUploading(false);
        }
    };

    const toggleHelpful = async (messageId) => {
        try {
            await API.post('/messages/helpful', { messageId });
        } catch (error) {
            console.error('Failed to toggle helpful', error);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-950">
            {/* Header */}
            <div className="h-16 px-6 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/50 backdrop-blur-sm">
                <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <span className="text-slate-400">#</span>
                        {channel.name}
                    </h2>
                    <p className="text-xs text-slate-400">Welcome to # {channel.name}</p>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                {messages.map((msg, idx) => {
                    const isMe = msg.sender._id === user._id;
                    const showHeader = idx === 0 || messages[idx - 1].sender._id !== msg.sender._id || (new Date(msg.createdAt) - new Date(messages[idx - 1].createdAt) > 300000);

                    return (
                        <div key={msg._id} className={`group flex gap-4 ${showHeader ? 'mt-6' : 'mt-1'}`}>
                            {showHeader ? (
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold shrink-0 shadow-lg">
                                    {msg.sender.name.charAt(0)}
                                </div>
                            ) : (
                                <div className="w-10 shrink-0" />
                            )}

                            <div className="flex-1 min-w-0">
                                {showHeader && (
                                    <div className="flex items-baseline gap-2 mb-1">
                                        <span className="font-bold text-white hover:underline cursor-pointer">
                                            {msg.sender.name}
                                        </span>
                                        <span className="text-xs text-slate-500">
                                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                )}

                                {msg.parentMessage && (
                                    <div className="flex items-center gap-2 mb-2 ml-2 text-xs text-slate-400 border-l-2 border-slate-700 pl-3 py-1 bg-slate-800/30 rounded-r">
                                        <Reply size={12} />
                                        <span>Replying to {msg.parentMessage.sender?.name || 'deleted user'}: {msg.parentMessage.content?.substring(0, 30)}...</span>
                                    </div>
                                )}

                                <div className="text-slate-300 whitespace-pre-wrap break-words leading-relaxed">
                                    {msg.content.split('\n').map((line, i) => {
                                        // Simple regex for image link
                                        const imgMatch = line.match(/!\[Attachment\]\((.*?)\)/);
                                        if (imgMatch) {
                                            return <img key={i} src={imgMatch[1]} alt="Attachment" className="max-w-sm rounded-lg my-2 border border-slate-700 shadow-md" />;
                                        }
                                        return <span key={i}>{line}<br /></span>
                                    })}
                                </div>

                                {/* Reactions & Actions */}
                                <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => toggleHelpful(msg._id)}
                                        className={`flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-slate-800 transition-colors ${msg.helpfulBy.includes(user._id) ? 'bg-blue-500/10 text-blue-400' : 'text-slate-500 hover:text-slate-300'
                                            }`}
                                        title="Mark as helpful"
                                    >
                                        <ThumbsUp size={12} />
                                        {msg.helpfulBy.length > 0 && <span>{msg.helpfulBy.length}</span>}
                                    </button>
                                    <button
                                        onClick={() => setReplyTo(msg)}
                                        className="text-slate-500 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
                                        title="Reply"
                                    >
                                        <Reply size={12} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-slate-800 bg-slate-900 shrink-0">
                <AnimatePresence>
                    {replyTo && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="flex items-center justify-between bg-slate-800/50 px-4 py-2 rounded-t-lg border-x border-t border-slate-700 mb-[-1px] mx-2"
                        >
                            <div className="text-xs text-slate-400 flex items-center gap-2">
                                <Reply size={12} className="text-blue-400" />
                                Replying to <span className="font-bold text-blue-400">{replyTo.sender.name}</span>
                            </div>
                            <button onClick={() => setReplyTo(null)} className="text-slate-400 hover:text-white transition-colors">
                                <X size={14} />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                <form onSubmit={handleSend} className="bg-slate-800 rounded-xl border border-slate-700 p-2 flex items-end gap-2 focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-blue-500 transition-all shadow-lg">
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className={`p-2 rounded-full transition-colors ${attachment ? 'bg-green-500/10 text-green-400' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                        title="Upload Image"
                    >
                        {attachment ? <Check size={20} /> : <ImageIcon size={20} />}
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => setAttachment(e.target.files[0])}
                    />

                    <div className="flex-1 min-w-0 py-1">
                        {attachment && (
                            <div className="flex items-center gap-2 mb-2 p-2 bg-slate-700/50 rounded text-xs text-white border border-slate-600">
                                <ImageIcon size={12} />
                                <span className="truncate max-w-[200px]">{attachment.name}</span>
                                <button onClick={() => setAttachment(null)} className="hover:text-red-400 ml-auto"><X size={12} /></button>
                            </div>
                        )}
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={`Message #${channel.name}`}
                            className="w-full bg-transparent text-white placeholder-slate-500 outline-none text-sm"
                            autoFocus
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={(!input.trim() && !attachment) || uploading}
                        className={`p-2 rounded-lg transition-all ${(!input.trim() && !attachment) || uploading ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/20'}`}
                    >
                        {uploading ? (
                            <div className="w-[18px] h-[18px] border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Send size={18} />
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ChatWindow;
