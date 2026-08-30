import { useState, useEffect } from 'react';
import { Head, useForm, Link } from '@inertiajs/react';

export default function Register() {
    const { data, setData, post, processing, errors } = useForm({
        name: '',
        email: '',
        role: '',
        password: '',
        password_confirmation: '',
    });

    // Form logic states
    const [strength, setStrength] = useState({ width: '0%', color: '', label: '' });
    const [success, setSuccess] = useState(false);
    
    // UI states
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [activeCard, setActiveCard] = useState(0);
    const [showTerms, setShowTerms] = useState(false);

    // Auto-rotate the feature cards every 4 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            setActiveCard((prev) => (prev + 1) % 3);
        }, 4000);
        return () => clearInterval(interval);
    }, []);

    const checkStrength = (val) => {
        let score = 0;
        if (val.length >= 8) score++;
        if (/[A-Z]/.test(val)) score++;
        if (/[0-9]/.test(val)) score++;
        if (/[^A-Za-z0-9]/.test(val)) score++;

        const configs = [
            { width: '0%', color: '', label: '' },
            { width: '25%', color: '#ef4444', label: 'Weak' },
            { width: '50%', color: '#f97316', label: 'Fair' },
            { width: '75%', color: '#eab308', label: 'Good' },
            { width: '100%', color: '#22c55e', label: 'Strong' },
        ];
        setStrength(configs[score] || configs[0]);
    };

    const submit = (e) => {
        e.preventDefault();
        post('/register-new-account', {
                onSuccess: () => setSuccess(true),
        });
    };

    return (
        <>
            <Head title="Register | iMAPS Rosario" />

            {/* Font Implementation */}
            <style dangerouslySetInnerHTML={{__html: `
                @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap');
                
                * { 
                    font-family: 'Poppins', sans-serif !important; 
                }
                
                body { 
                    background-color: #ffffff; 
                    margin: 0; 
                    overflow: ${showTerms ? 'hidden' : 'auto'}; 
                }
                
                /* Custom Scrollbar */
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            `}} />

            {/* Locked to h-screen so it never exceeds monitor height */}
            <div className="flex h-screen w-full text-slate-900 bg-white overflow-hidden">
                
                {/* --- LEFT SIDE --- */}
                <div className="hidden lg:flex lg:w-1/2 p-4 lg:p-6 h-full">
                    {/* Using standard Tailwind slate-900 to ensure background renders */}
                    <div className="w-full h-full bg-slate-900 rounded-[2rem] relative flex flex-col p-8 lg:p-10 overflow-hidden shadow-2xl">
                        
                        <div className="relative z-10 flex-shrink-0">
                            <h1 className="text-white font-bold text-2xl tracking-tighter leading-none">
                                iMAPS<br/>
                                <span className="text-blue-400 text-lg">ROSARIO</span>
                            </h1>
                        </div>

                        <div className="relative z-10 flex flex-col items-center justify-center flex-1 w-full min-h-0 mt-2">
                            
                            {/* Card Container */}
                            <div className="relative w-full max-w-[360px] h-[260px] flex-shrink-0">
                                
                                {/* Card 1: Reporting System */}
                                <div className={`absolute inset-0 bg-gradient-to-br from-indigo-500 to-blue-700 rounded-2xl p-6 shadow-2xl flex flex-col transition-all duration-700 ease-in-out ${activeCard === 0 ? 'opacity-100 translate-y-0 scale-100 z-20' : 'opacity-0 translate-y-4 scale-95 z-0 pointer-events-none'}`}>
                                    <div className="mb-2">
                                        <p className="text-blue-200 text-[10px] font-bold uppercase tracking-wider mb-1">SYSTEM APPLICATION</p>
                                        <h3 className="text-white text-xl font-bold tracking-tight">Zoning & Land-Use</h3>
                                    </div>
                                    <div className="flex flex-col gap-2 mt-auto mb-1">
                                        <div className="bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2.5 flex items-center gap-3 text-white text-[13px] font-medium w-full border border-white/10">
                                            <span className="text-base">📊</span> Zoning Analytics
                                        </div>
                                        <div className="bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2.5 flex items-center gap-3 text-white text-[13px] font-medium w-full border border-white/10">
                                            <span className="text-base">✅</span> Compliance Monitoring
                                        </div>
                                        <div className="bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2.5 flex items-center gap-3 text-white text-[13px] font-medium w-full border border-white/10">
                                            <span className="text-base">📑</span> Development Reports
                                        </div>
                                    </div>
                                </div>

                                {/* Card 2: Live Dashboard */}
                                <div className={`absolute inset-0 bg-slate-800 rounded-2xl pt-6 px-6 shadow-2xl flex flex-col transition-all duration-700 ease-in-out overflow-hidden ${activeCard === 1 ? 'opacity-100 translate-y-0 scale-100 z-20' : 'opacity-0 translate-y-4 scale-95 z-0 pointer-events-none'}`}>
                                    <div className="mb-2">
                                        <p className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider mb-1">LIVE DASHBOARD</p>
                                        <h3 className="text-white text-xl font-bold tracking-tight">Real-time Analytics</h3>
                                    </div>
                                    <div className="flex gap-3 mb-auto mt-2">
                                        <div className="bg-slate-700/50 rounded-xl p-4 flex-1 border border-slate-600/50">
                                            <p className="text-emerald-400 text-2xl font-bold mb-0.5">14,204</p>
                                            <p className="text-slate-300 text-[11px]">Monitored Parcels</p>
                                        </div>
                                        <div className="bg-slate-700/50 rounded-xl p-4 flex-1 border border-slate-600/50">
                                            <p className="text-blue-400 text-2xl font-bold mb-0.5">48</p>
                                            <p className="text-slate-300 text-[11px]">Active Projects</p>
                                        </div>
                                    </div>
                                    <div className="flex items-end gap-1.5 h-12 w-full mt-4">
                                        {[40, 60, 30, 80, 50, 40, 70, 55].map((h, i) => (
                                            <div key={i} className="flex-1 bg-emerald-500/80 rounded-t-sm" style={{ height: `${h}%` }}></div>
                                        ))}
                                    </div>
                                </div>

                                {/* Card 3: Interactive Maps */}
                                <div className={`absolute inset-0 bg-gradient-to-br from-blue-900 to-cyan-800 rounded-2xl p-6 shadow-2xl flex flex-col transition-all duration-700 ease-in-out ${activeCard === 2 ? 'opacity-100 translate-y-0 scale-100 z-20' : 'opacity-0 translate-y-4 scale-95 z-0 pointer-events-none'}`}>
                                    <div className="mb-2">
                                        <p className="text-cyan-300 text-[10px] font-bold uppercase tracking-wider mb-1">INTERACTIVE MAPS</p>
                                        <h3 className="text-white text-xl font-bold tracking-tight">Geospatial Tracking</h3>
                                    </div>
                                    <div className="bg-white/10 backdrop-blur-md rounded-xl w-full flex-1 flex flex-col items-center justify-center p-4 mt-2 mb-1 border border-white/10">
                                        <svg className="w-10 h-10 text-cyan-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                        </svg>
                                        <p className="text-white text-[13px] font-medium text-center leading-snug">
                                            Territorial Mapping &<br/>Infrastructure Analysis
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2.5 my-6 flex-shrink-0">
                                {[0, 1, 2].map((idx) => (
                                    <button 
                                        key={idx}
                                        onClick={() => setActiveCard(idx)}
                                        className={`h-1.5 rounded-full transition-all duration-300 ${activeCard === idx ? 'w-8 bg-white' : 'w-4 bg-white/40 hover:bg-white/60'}`}
                                    />
                                ))}
                            </div>

                            <div className="relative w-full max-w-[380px] h-[90px] flex-shrink-0">
                                {/* Text 1 */}
                                <div className={`absolute top-0 left-0 w-full flex flex-col items-center text-center transition-all duration-500 ease-in-out ${activeCard === 0 ? 'opacity-100 translate-y-0 z-10' : 'opacity-0 translate-y-4 z-0 pointer-events-none'}`}>
                                    <h2 className="text-white text-xl font-bold mb-2 tracking-tight">Generate Reports,<br/>Drive Decisions</h2>
                                    <p className="text-slate-300 text-xs leading-relaxed max-w-[340px]">
                                        Advanced reporting tools, land-use trends, and zoning insights to support strategic development decisions in Rosario.
                                    </p>
                                </div>
                                {/* Text 2 */}
                                <div className={`absolute top-0 left-0 w-full flex flex-col items-center text-center transition-all duration-500 ease-in-out ${activeCard === 1 ? 'opacity-100 translate-y-0 z-10' : 'opacity-0 translate-y-4 z-0 pointer-events-none'}`}>
                                    <h2 className="text-white text-xl font-bold mb-2 tracking-tight">Monitor Development,<br/>Optimize Operations</h2>
                                    <p className="text-slate-300 text-xs leading-relaxed max-w-[340px]">
                                        Comprehensive dashboard for real-time parcel tracking, compliance analytics, and data-driven insights.
                                    </p>
                                </div>
                                {/* Text 3 */}
                                <div className={`absolute top-0 left-0 w-full flex flex-col items-center text-center transition-all duration-500 ease-in-out ${activeCard === 2 ? 'opacity-100 translate-y-0 z-10' : 'opacity-0 translate-y-4 z-0 pointer-events-none'}`}>
                                    <h2 className="text-white text-xl font-bold mb-2 tracking-tight">Track Locations,<br/>Analyze Patterns</h2>
                                    <p className="text-slate-300 text-xs leading-relaxed max-w-[340px]">
                                        Interactive mapping system with territorial visualization and infrastructure analysis for accurate urban planning.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* --- RIGHT SIDE: TIGHTENED REGISTRATION FORM --- */}
                <div className="w-full lg:w-1/2 h-full flex flex-col justify-center items-center px-8 sm:px-12 py-6 bg-white overflow-y-auto custom-scrollbar relative">
                    
                    {/* Mobile Branding */}
                    <div className="absolute top-6 left-6 lg:hidden">
                        <h1 className="text-slate-900 font-bold text-xl tracking-tighter leading-none">
                            iMAPS <span className="text-blue-600">ROSARIO</span>
                        </h1>
                    </div>

                    {/* Tighter Max Width for better proportions */}
                    <div className="w-full max-w-[340px]">
                        
                        {/* Success State */}
                        {success ? (
                            <div className="text-center animate-fade-in">
                                <div className="w-16 h-16 rounded-full bg-emerald-100 border-4 border-emerald-50 flex items-center justify-center mx-auto mb-6">
                                    <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <h1 className="text-2xl font-bold text-slate-900 mb-2">Account Created!</h1>
                                <p className="text-[13px] text-slate-500 mb-8 leading-relaxed">
                                    The new staff account has been successfully registered and is now ready to use.
                                </p>
                                <button onClick={() => setSuccess(false)} className="w-full bg-slate-900 hover:bg-blue-800 text-white text-sm font-semibold py-3 rounded-lg transition-colors mb-4">
                                    Register Another User
                                </button>
                                <Link href="/users" className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                                    ← Back to User Management Page
                                </Link>
                            </div>
                        ) : (
                            <>
                                {/* Form Header */}
                                <div className="mb-5">
                                    <h1 className="text-2xl font-bold text-slate-900 mb-1">Create Account</h1>
                                    <p className="text-xs text-slate-500">Register a new staff account to the iMAPS portal.</p>
                                </div>

                                {/* Errors */}
                                {Object.keys(errors).length > 0 && (
                                    <div className="mb-4 p-2.5 bg-red-50 border border-red-100 rounded-lg">
                                        <ul className="list-disc list-inside text-xs text-red-600 space-y-0.5">
                                            {Object.values(errors).map((err, i) => (
                                                <li key={i}>{err}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Tightened Space-y to prevent scrolling */}
                                <form onSubmit={submit} className="space-y-3">
                                    
                                    {/* Full Name */}
                                    <div className="space-y-1">
                                        <label htmlFor="name" className="block text-xs font-medium text-slate-700">Full Name</label>
                                        <input
                                            type="text" id="name" required autoFocus maxLength={255}
                                            value={data.name} onChange={e => setData('name', e.target.value)}
                                            placeholder="Enter your full name"
                                            className="w-full bg-[#f8f9fc] border border-transparent rounded-lg px-3 py-2 text-[13px] text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                                        />
                                    </div>

                                    {/* Email */}
                                    <div className="space-y-1">
                                        <label htmlFor="email" className="block text-xs font-medium text-slate-700">Email Address</label>
                                        <input
                                            type="email" id="email" required maxLength={80}
                                            value={data.email} onChange={e => setData('email', e.target.value)}
                                            placeholder="Enter your email"
                                            className="w-full bg-[#f8f9fc] border border-transparent rounded-lg px-3 py-2 text-[13px] text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                                        />
                                    </div>

                                    {/* Role */}
                                    <div className="space-y-1">
                                        <label htmlFor="role" className="block text-xs font-medium text-slate-700">Role</label>
                                        <select
                                            id="role" required
                                            value={data.role} onChange={e => setData('role', e.target.value)}
                                            className="w-full bg-[#f8f9fc] border border-transparent rounded-lg px-3 py-2 text-[13px] text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none appearance-none"
                                        >
                                            <option value="" disabled>Select a role...</option>
                                            <option value="Planning Officer">Planning Officer</option>
                                             <option value="Site Inspector">Site Inspector</option>
                                            <option value="Admin">Admin</option>
                                        </select>
                                    </div>

                                    {/* Password */}
                                    <div className="space-y-1">
                                        <label htmlFor="password" className="block text-xs font-medium text-slate-700">Password</label>
                                        <div className="relative">
                                            <input
                                                type={showPassword ? 'text' : 'password'} id="password" required minLength={8}
                                                value={data.password} 
                                                onChange={e => { setData('password', e.target.value); checkStrength(e.target.value); }}
                                                placeholder="Enter your password"
                                                className="w-full bg-[#f8f9fc] border border-transparent rounded-lg pl-3 pr-10 py-2 text-[13px] text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                                            />
                                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600">
                                                {showPassword ? (
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                                ) : (
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                )}
                                            </button>
                                        </div>
                                        {/* Strength bar inline */}
                                        {data.password.length > 0 && (
                                            <div className="pt-0.5">
                                                <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full transition-all duration-300" style={{ width: strength.width, backgroundColor: strength.color }} />
                                                </div>
                                                <p className="text-[10px] mt-1 font-medium" style={{ color: strength.color }}>{strength.label}</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Confirm Password */}
                                    <div className="space-y-1 pb-1">
                                        <label htmlFor="password_confirmation" className="block text-xs font-medium text-slate-700">Confirm Password</label>
                                        <div className="relative">
                                            <input
                                                type={showConfirmPassword ? 'text' : 'password'} id="password_confirmation" required
                                                value={data.password_confirmation} onChange={e => setData('password_confirmation', e.target.value)}
                                                placeholder="Confirm your password"
                                                className="w-full bg-[#f8f9fc] border border-transparent rounded-lg pl-3 pr-10 py-2 text-[13px] text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                                            />
                                            <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600">
                                                {showConfirmPassword ? (
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                                ) : (
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Terms Checkbox */}
                                    <div className="flex items-start gap-2 pb-1">
                                        <input type="checkbox" id="terms" required className="mt-0.5 w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                                        <label htmlFor="terms" className="text-[10px] text-slate-500 leading-relaxed">
                                            By creating an account, you agree to our <button type="button" onClick={() => setShowTerms(true)} className="text-blue-700 font-medium hover:underline">Terms of Service</button> and <button type="button" onClick={() => setShowTerms(true)} className="text-blue-700 font-medium hover:underline">Privacy Policy</button>.
                                        </label>
                                    </div>

                                    {/* Submit Button */}
                                    <button 
                                        type="submit" 
                                        disabled={processing}
                                        className="w-full bg-slate-900 hover:bg-blue-800 text-white text-[13px] font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-70 flex justify-center items-center gap-2 mt-1"
                                    >
                                        {processing ? 'Registering...' : 'Create Account'}
                                    </button>
                                </form>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* FULL Terms & Privacy Policy Modal */}
            {showTerms && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl relative overflow-hidden">
                        
                        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">Terms of Service & Privacy Policy</h2>
                                <p className="text-xs text-slate-500 mt-1">Effective Date: {new Date().toLocaleDateString()}</p>
                            </div>
                            <button onClick={() => setShowTerms(false)} className="text-slate-400 hover:text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 p-2 rounded-md transition-colors shadow-sm">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="p-8 overflow-y-auto custom-scrollbar text-sm text-slate-700 space-y-8">
                            
                            {/* --- PART 1: TERMS OF SERVICE --- */}
                            <div>
                                <h2 className="text-2xl font-extrabold text-slate-900 border-b-2 border-blue-100 pb-2 mb-6">Part I: Terms of Service</h2>
                                
                                <section className="mb-6">
                                    <h3 className="text-slate-900 font-bold text-base mb-2 uppercase tracking-wide">1. Acceptance of Terms</h3>
                                    <p className="leading-relaxed mb-3">By accessing, registering, or using the iMAPS (Intelligent Geospatial Analytics and Land-Use Monitoring System) operated by the Municipal Government of Rosario, Batangas, you acknowledge that you have read, understood, and agree to be bound by these Terms. If you do not agree, you must immediately discontinue use of the system.</p>
                                </section>

                                <section className="mb-6">
                                    <h3 className="text-slate-900 font-bold text-base mb-2 uppercase tracking-wide">2. System Access & User Responsibilities</h3>
                                    <ul className="list-disc list-inside space-y-2 ml-2">
                                        <li><span className="font-semibold text-slate-900">Authorized Use:</span> Access is granted solely for legitimate urban planning, zoning, and land-use monitoring purposes.</li>
                                        <li><span className="font-semibold text-slate-900">Account Security:</span> You are responsible for maintaining the confidentiality of your login credentials. You must notify the administrator immediately of any unauthorized access.</li>
                                        <li><span className="font-semibold text-slate-900">Prohibited Activities:</span> Attempting unauthorized access, transmitting malicious software, and utilizing the system for unapproved commercial purposes are strictly prohibited.</li>
                                    </ul>
                                </section>

                                <section className="mb-6">
                                    <h3 className="text-slate-900 font-bold text-base mb-2 uppercase tracking-wide">3. Data Accuracy & Intellectual Property</h3>
                                    <p className="leading-relaxed mb-3">All geospatial data and development documentation submitted must be accurate and truthful. iMAPS software, designs, maps, and content are protected by intellectual property laws and are owned exclusively by the Municipal Government of Rosario.</p>
                                </section>

                                <section className="mb-6">
                                    <h3 className="text-slate-900 font-bold text-base mb-2 uppercase tracking-wide">4. Limitation of Liability</h3>
                                    <p className="leading-relaxed">iMAPS is provided "as is". To the maximum extent permitted by Philippine law, the Municipal Government of Rosario shall not be liable for any indirect, incidental, or consequential damages arising from system downtime, data loss, or business interruption.</p>
                                </section>
                            </div>

                            {/* --- PART 2: PRIVACY POLICY --- */}
                            <div>
                                <h2 className="text-2xl font-extrabold text-slate-900 border-b-2 border-blue-100 pb-2 mb-6 mt-4">Part II: Privacy Policy</h2>
                                
                                <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg text-slate-700 leading-relaxed mb-6">
                                    We respect your privacy and are committed to protecting your personal data in accordance with the <strong>Data Privacy Act of 2012 (Republic Act No. 10173)</strong> of the Philippines.
                                </div>

                                <section className="mb-6">
                                    <h3 className="text-slate-900 font-bold text-base mb-2 uppercase tracking-wide">1. Information We Collect</h3>
                                    <p className="leading-relaxed mb-2">When you register or interact with the iMAPS portal, we collect the following personal and system information:</p>
                                    <ul className="list-disc list-inside space-y-2 ml-2">
                                        <li><span className="font-semibold text-slate-900">Personal Identification:</span> Full Name, Email Address, and Official Role/Designation.</li>
                                        <li><span className="font-semibold text-slate-900">Authentication Data:</span> Encrypted passwords and login timestamps.</li>
                                        <li><span className="font-semibold text-slate-900">System Usage Data:</span> IP addresses, browser types, and interaction logs for security monitoring.</li>
                                    </ul>
                                </section>

                                <section className="mb-6">
                                    <h3 className="text-slate-900 font-bold text-base mb-2 uppercase tracking-wide">2. How We Use Your Data</h3>
                                    <p className="leading-relaxed mb-2">Your data is strictly used for the administration and security of the municipal planning portal:</p>
                                    <ul className="list-disc list-inside space-y-2 ml-2">
                                        <li>To authenticate your identity and assign appropriate role-based access.</li>
                                        <li>To generate audit trails and compliance reports for municipal planning activities.</li>
                                        <li>To communicate important system updates or security alerts.</li>
                                    </ul>
                                </section>

                                <section className="mb-6">
                                    <h3 className="text-slate-900 font-bold text-base mb-2 uppercase tracking-wide">3. Data Protection & Sharing</h3>
                                    <p className="leading-relaxed mb-3">Your personal information is encrypted and stored securely on government-approved servers. We do <strong>not</strong> sell or share your personal data with third-party marketers. Data may only be disclosed to regulatory bodies or law enforcement agencies when mandated by Philippine law.</p>
                                </section>

                                <section className="mb-6">
                                    <h3 className="text-slate-900 font-bold text-base mb-2 uppercase tracking-wide">4. Your Rights as a Data Subject</h3>
                                    <p className="leading-relaxed mb-2">Under the Data Privacy Act, you possess the right to:</p>
                                    <ul className="list-disc list-inside space-y-2 ml-2">
                                        <li><strong>Access:</strong> Request a copy of the personal data we hold about you.</li>
                                        <li><strong>Correction:</strong> Request corrections to any inaccurate or outdated information.</li>
                                        <li><strong>Erasure:</strong> Request the deletion of your account and personal data, subject to municipal archiving laws.</li>
                                    </ul>
                                </section>
                            </div>

                            <section className="bg-slate-100 border border-slate-200 p-6 rounded-xl mt-8">
                                <h3 className="text-slate-900 font-bold text-lg mb-4">Contact Information</h3>
                                <p className="mb-4">For inquiries regarding system access, terms of use, or data privacy requests, please contact:</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                                    <div>
                                        <span className="block font-bold text-slate-900 mb-1">System & Privacy Administrator</span>
                                        <a href="mailto:admin@imaps-rosario.gov.ph" className="text-blue-600 hover:text-blue-800 font-medium">admin@imaps-rosario.gov.ph</a>
                                    </div>
                                    <div>
                                        <span className="block font-bold text-slate-900 mb-1">Municipal Planning Office</span>
                                        <p className="text-slate-600">Municipal Hall, Rosario,<br/>Batangas 4225, Philippines</p>
                                    </div>
                                </div>
                            </section>

                        </div>
                        
                        <div className="p-5 border-t border-slate-100 flex justify-end bg-white">
                            <button onClick={() => setShowTerms(false)} className="px-8 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-blue-800 shadow-md hover:shadow-lg transition-all text-sm font-bold tracking-wide">
                                I Accept & Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}