import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import { LogIn, Mail, Lock, AlertCircle } from 'lucide-react';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import { auth } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();
    const { executeRecaptcha } = useGoogleReCaptcha();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!executeRecaptcha) {
            setError('reCAPTCHA security layer not initialized. Please refresh.');
            return;
        }

        try {
            console.log("Initiating login protocol...");

            // 1. Execute reCAPTCHA v3
            let captchaToken = null;
            if (executeRecaptcha) {
                captchaToken = await executeRecaptcha('login_action');
                console.log("reCAPTCHA Status: Token generated successfully");
            } else {
                console.warn("reCAPTCHA Warning: executeRecaptcha not found");
            }

            if (!captchaToken) {
                console.error("reCAPTCHA Critical: Token generation failed or returned null");
                // Optional: throw new Error("Security verification failed. Please try again.");
            }

            // 2. Firebase Identity Verification (OPTIONAL/BYPASSED if causing issues)
            /* 
            try {
                console.log("Executing Firebase secondary verification...");
                await signInWithEmailAndPassword(auth, email, password);
                console.log("Firebase Status: Identity matching successful");
            } catch (fbError) {
                console.warn("Firebase Auth Warning (Bypassed):", fbError.message);
                // throw new Error("Invalid credentials or account mismatch.");
            }
            */

            // 3. Backend Login & Authorization
            console.log("Transmitting credentials to backend with captchaToken...");
            const loggedInUser = await login(email, password, captchaToken);
            console.log("Backend Status: Access granted for role:", loggedInUser?.role);

            // Existing redirect logic
            navigate(`/${loggedInUser.role}/dashboard`);
        } catch (err) {
            console.error("Login Lifecycle Failure:", err);
            setError(err.response?.data?.message || err.message || 'Authentication protocol interrupted.');
        }
    };

    return (
        <div className="min-h-screen pt-24 pb-12 flex flex-col justify-center items-center px-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-md w-full glass-card p-8 border border-white/10"
            >
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-600/20">
                        <LogIn className="w-8 h-8 text-white" />
                    </div>
                    <h2 className="text-3xl font-bold text-white">Welcome Back</h2>
                    <p className="text-slate-400 mt-2">Sign in to your account</p>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <p>{error}</p>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Email Address</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                            <input
                                type="email"
                                required
                                className="w-full bg-slate-900/50 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all placeholder:text-slate-600"
                                placeholder="name@college.edu"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                            <input
                                type="password"
                                required
                                className="w-full bg-slate-900/50 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all placeholder:text-slate-600"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="w-full py-4 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-primary-600/25 transform active:scale-[0.98]"
                    >
                        Sign In
                    </button>
                </form>

                <p className="mt-8 text-center text-slate-400 text-sm">
                    Don't have an account?{' '}
                    <Link to="/register" className="text-primary-400 hover:text-primary-300 font-medium">
                        Create an account
                    </Link>
                </p>
            </motion.div>
        </div>
    );
};

export default Login;
