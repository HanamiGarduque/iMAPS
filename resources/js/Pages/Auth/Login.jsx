import { useState, useEffect } from 'react';
import { Head, useForm, Link } from '@inertiajs/react';

export default function Login() {
    const { data, setData, post, processing, errors } = useForm({
        email: '',
        password: '',
        remember: false,
    });

    const [showPassword, setShowPassword] = useState(false);
    const [activeCard, setActiveCard] = useState(0);
    const [showTerms, setShowTerms] = useState(false);

    // Auto-rotate the feature cards every 4 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            setActiveCard((prev) => (prev + 1) % 3);
        }, 4000);
        return () => clearInterval(interval);
    }, []);

    const submit = (e) => {
        e.preventDefault();
        post('/login');
    };

    return (
        <>
            <Head title="Sign In | iMAPS Rosario" />

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
                
                /* Custom Scrollbar for Modal */
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            `}} />

            <div className="flex min-h-screen w-full text-slate-900 bg-white">
                
                {/* Left Side: Wrapper with padding so it doesn't touch the edges */}
                <div className="hidden lg:flex lg:w-1/2 p-4 sm:p-5 lg:p-6">
                    
                    {/* Inner floating box with rounded corners and background */}
                    <div className="w-full h-full bg-gradient-to-br from-[#0A2540] to-[#0d1b2a] rounded-[2rem] relative flex flex-col p-8 lg:p-10 overflow-hidden shadow-2xl">
                        
                        {/* Logo Area (Scaled Down) */}
                        <div className="relative z-10">
                            <h1 className="text-white font-bold text-2xl tracking-tighter leading-none">
                                iMAPS<br/>
                                <span className="text-blue-400 text-lg">ROSARIO</span>
                            </h1>
                        </div>

                        {/* Center Content Area (Cards + Dots + Text) */}
                        <div className="relative z-10 flex flex-col items-center justify-center flex-1 w-full mt-2">
                            
                            {/* --- 1. The Floating Cards Container (Scaled down to mimic 90% zoom) --- */}
                            <div className="relative w-full max-w-[380px] h-[290px] flex-shrink-0">
                                
                                {/* Card 1: Reporting System */}
                                <div className={`absolute inset-0 bg-gradient-to-br from-[#6b73ff] to-[#3a41c6] rounded-2xl p-6 shadow-2xl flex flex-col transition-all duration-700 ease-in-out ${activeCard === 0 ? 'opacity-100 translate-y-0 scale-100 z-20' : 'opacity-0 translate-y-8 scale-95 z-0 pointer-events-none'}`}>
                                    <div className="mb-3">
                                        <p className="text-blue-200 text-[10px] font-bold uppercase tracking-wider mb-1">SYSTEM APPLICATION</p>
                                        <h3 className="text-white text-xl font-bold tracking-tight">Zoning & Land-Use</h3>
                                    </div>
                                    <div className="flex flex-col gap-2.5 mt-auto mb-1">
                                        <div className="bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2.5 flex items-center gap-3 text-white text-[13px] font-medium w-full">
                                            <span className="text-base">📊</span> Zoning Analytics
                                        </div>
                                        <div className="bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2.5 flex items-center gap-3 text-white text-[13px] font-medium w-full">
                                            <span className="text-base">✅</span> Compliance Monitoring
                                        </div>
                                        <div className="bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2.5 flex items-center gap-3 text-white text-[13px] font-medium w-full">
                                            <span className="text-base">📑</span> Development Reports
                                        </div>
                                    </div>
                                </div>

                                {/* Card 2: Live Dashboard */}
                                <div className={`absolute inset-0 bg-[#1a2332] rounded-2xl pt-6 px-6 shadow-2xl flex flex-col transition-all duration-700 ease-in-out overflow-hidden ${activeCard === 1 ? 'opacity-100 translate-y-0 scale-100 z-20' : 'opacity-0 translate-y-8 scale-95 z-0 pointer-events-none'}`}>
                                    <div className="mb-3">
                                        <p className="text-emerald-500 text-[10px] font-bold uppercase tracking-wider mb-1">LIVE DASHBOARD</p>
                                        <h3 className="text-white text-xl font-bold tracking-tight">Real-time Analytics</h3>
                                    </div>
                                    <div className="flex gap-3 mb-auto mt-1">
                                        <div className="bg-[#233433] rounded-xl p-4 flex-1 border border-emerald-900/30">
                                            <p className="text-emerald-400 text-2xl font-bold mb-0.5">14,204</p>
                                            <p className="text-slate-300 text-[11px]">Monitored Parcels</p>
                                        </div>
                                        <div className="bg-[#202b46] rounded-xl p-4 flex-1 border border-blue-900/30">
                                            <p className="text-blue-400 text-2xl font-bold mb-0.5">48</p>
                                            <p className="text-slate-300 text-[11px]">Active Projects</p>
                                        </div>
                                    </div>
                                    <div className="flex items-end gap-1.5 h-12 w-full mt-5">
                                        {[40, 60, 30, 80, 50, 40, 70, 55].map((h, i) => (
                                            <div key={i} className="flex-1 bg-[#5b9e78] rounded-t-sm" style={{ height: `${h}%` }}></div>
                                        ))}
                                    </div>
                                </div>

                                {/* Card 3: Interactive Maps */}
                                <div className={`absolute inset-0 bg-gradient-to-br from-[#1e3c72] to-[#2a5298] rounded-2xl p-6 shadow-2xl flex flex-col transition-all duration-700 ease-in-out ${activeCard === 2 ? 'opacity-100 translate-y-0 scale-100 z-20' : 'opacity-0 translate-y-8 scale-95 z-0 pointer-events-none'}`}>
                                    <div className="mb-3">
                                        <p className="text-cyan-400 text-[10px] font-bold uppercase tracking-wider mb-1">INTERACTIVE MAPS</p>
                                        <h3 className="text-white text-xl font-bold tracking-tight">Geospatial Tracking</h3>
                                    </div>
                                    <div className="bg-white/10 backdrop-blur-md rounded-xl w-full flex-1 flex flex-col items-center justify-center p-5 mt-3 mb-1">
                                        <svg className="w-10 h-10 text-cyan-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                        </svg>
                                        <p className="text-white text-[13px] font-medium text-center leading-snug">
                                            Territorial Mapping and<br/>Infrastructure analysis
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* --- 2. Pagination Dots --- */}
                            <div className="flex gap-2.5 my-6">
                                {[0, 1, 2].map((idx) => (
                                    <button 
                                        key={idx}
                                        onClick={() => setActiveCard(idx)}
                                        className={`h-1.5 rounded-full transition-all duration-300 ${activeCard === idx ? 'w-8 bg-white' : 'w-4 bg-white/40 hover:bg-white/60'}`}
                                    />
                                ))}
                            </div>

                            {/* --- 3. Dynamic Bottom Text Container (Scaled Down) --- */}
                            <div className="relative w-full max-w-[420px] h-[110px] flex-shrink-0">
                                
                                {/* Text 1 */}
                                <div className={`absolute top-0 left-0 w-full flex flex-col items-center text-center transition-all duration-500 ease-in-out ${activeCard === 0 ? 'opacity-100 translate-y-0 z-10' : 'opacity-0 translate-y-4 z-0 pointer-events-none'}`}>
                                    <h2 className="text-white text-xl lg:text-2xl font-bold mb-2 tracking-tight">Generate Reports,<br/>Drive Decisions</h2>
                                    <p className="text-slate-300 text-[13px] leading-relaxed max-w-[340px]">
                                        Advanced reporting tools, land-use trends, and zoning insights to support strategic development decisions in Rosario.
                                    </p>
                                </div>

                                {/* Text 2 */}
                                <div className={`absolute top-0 left-0 w-full flex flex-col items-center text-center transition-all duration-500 ease-in-out ${activeCard === 1 ? 'opacity-100 translate-y-0 z-10' : 'opacity-0 translate-y-4 z-0 pointer-events-none'}`}>
                                    <h2 className="text-white text-xl lg:text-2xl font-bold mb-2 tracking-tight">Monitor Development,<br/>Optimize Operations</h2>
                                    <p className="text-slate-300 text-[13px] leading-relaxed max-w-[340px]">
                                        Comprehensive dashboard for real-time parcel tracking, compliance analytics, and data-driven insights.
                                    </p>
                                </div>

                                {/* Text 3 */}
                                <div className={`absolute top-0 left-0 w-full flex flex-col items-center text-center transition-all duration-500 ease-in-out ${activeCard === 2 ? 'opacity-100 translate-y-0 z-10' : 'opacity-0 translate-y-4 z-0 pointer-events-none'}`}>
                                    <h2 className="text-white text-xl lg:text-2xl font-bold mb-2 tracking-tight">Track Locations,<br/>Analyze Patterns</h2>
                                    <p className="text-slate-300 text-[13px] leading-relaxed max-w-[340px]">
                                        Interactive mapping system with territorial visualization and infrastructure analysis for accurate urban planning.
                                    </p>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>

                {/* Right Side: Clean Login Form */}
                <div className="w-full lg:w-1/2 flex flex-col justify-center items-center px-8 sm:px-16 bg-white relative">
                    
                    {/* Mobile Branding */}
                    <div className="absolute top-8 left-8 lg:hidden">
                        <h1 className="text-slate-900 font-bold text-xl tracking-tighter leading-none">
                            iMAPS <span className="text-blue-600">ROSARIO</span>
                        </h1>
                    </div>

                    <div className="w-full max-w-[360px]">
                        
                        <div className="mb-8">
                            <h1 className="text-3xl font-bold text-slate-900 mb-2">Log In</h1>
                            <p className="text-sm text-slate-500">Welcome back! Sign in to access your dashboard.</p>
                        </div>

                        {errors.email && (
                            <div className="mb-6 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg">
                                {errors.email}
                            </div>
                        )}

                        <form onSubmit={submit} className="space-y-5">
                            
                            {/* Email Input */}
                            <div className="space-y-1.5">
                                <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    id="email"
                                    value={data.email}
                                    onChange={e => setData('email', e.target.value)}
                                    className="w-full bg-[#f8f9fc] border border-transparent rounded-lg px-4 py-3 text-sm text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                                    placeholder="admin@rosario.gov.ph"
                                    required
                                    autoFocus
                                />
                            </div>

                            {/* Password Input */}
                            <div className="space-y-1.5">
                                <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                                    Password
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        id="password"
                                        value={data.password}
                                        onChange={e => setData('password', e.target.value)}
                                        className="w-full bg-[#f8f9fc] border border-transparent rounded-lg pl-4 pr-12 py-3 text-sm text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                                        placeholder="••••••••"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600"
                                    >
                                        {showPassword ? (
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                        ) : (
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                        )}
                                    </button>
                                </div>
                            </div>

                            <div className="flex justify-end pt-1">
                                <Link href="#" className="text-xs font-medium text-slate-500 hover:text-blue-700 underline decoration-slate-300 underline-offset-2">
                                    Forgot Password?
                                </Link>
                            </div>

                            <div className="pt-2 pb-2">
                                <p className="text-[11px] text-slate-500 leading-relaxed text-center">
                                    By logging in, you agree to our <button type="button" onClick={() => setShowTerms(true)} className="text-blue-700 font-medium hover:underline">Terms of Service</button> and <button type="button" onClick={() => setShowTerms(true)} className="text-blue-700 font-medium hover:underline">Privacy Policy</button>.
                                </p>
                            </div>

                            {/* Submit Button */}
                            <button 
                                type="submit" 
                                disabled={processing}
                                className="w-full bg-[#0A2540] hover:bg-blue-800 text-white text-sm font-semibold py-3.5 rounded-lg transition-colors disabled:opacity-70 flex justify-center items-center gap-2"
                            >
                                {processing ? 'Authenticating...' : 'Login'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            {/* Terms and Conditions Modal */}
            {showTerms && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl relative overflow-hidden">
                        
                        {/* Modal Header */}
                        <div className="flex justify-between items-center p-6 border-b border-slate-100">
                            <h2 className="text-xl font-bold text-[#0A2540]">Terms and Conditions of Use</h2>
                            <button onClick={() => setShowTerms(false)} className="text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 p-1.5 rounded-md transition-colors">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        {/* Modal Body (Scrollable) */}
                        <div className="p-6 overflow-y-auto custom-scrollbar text-sm text-slate-700 space-y-6">
                            
                            <section>
                                <h3 className="text-[#0A2540] font-bold text-base mb-2 uppercase tracking-wide">Executive Summary</h3>
                                <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg text-slate-600 leading-relaxed">
                                    These Terms and Conditions govern your access to and use of the iMAPS (Intelligent Geospatial Analytics and Land-Use Monitoring System) operated by the Municipal Government of Rosario, Batangas. By accessing or using our services, you acknowledge that you have read, understood, and agree to be bound by these terms and all applicable laws and regulations.
                                </div>
                            </section>

                            <section>
                                <h3 className="text-[#0A2540] font-bold text-base mb-3 uppercase tracking-wide">Acceptance of Terms & Conditions</h3>
                                <div className="space-y-4">
                                    <div>
                                        <h4 className="font-semibold text-slate-900 mb-1">BINDING AGREEMENT</h4>
                                        <p className="leading-relaxed">By accessing, browsing, or using iMAPS, you acknowledge that you have read these Terms and Conditions in their entirety and agree to be legally bound by all provisions contained herein. If you do not agree with any part of these terms, you must immediately discontinue use of the system.</p>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-slate-900 mb-1">CAPACITY TO AGREE</h4>
                                        <p className="leading-relaxed">You represent and warrant that you are at least 18 years of age and have the legal capacity to enter into this agreement. If you are accessing the system on behalf of an organization, you represent that you have the authority to bind such organization to these terms.</p>
                                    </div>
                                </div>
                            </section>

                            <section>
                                <h3 className="text-[#0A2540] font-bold text-base mb-3 uppercase tracking-wide">System Access & User Responsibilities</h3>
                                <div className="space-y-4">
                                    <div>
                                        <h4 className="font-semibold text-slate-900 mb-1">AUTHORIZED USE</h4>
                                        <p className="leading-relaxed">Access to iMAPS is granted solely for legitimate urban planning, zoning, and land-use monitoring purposes, including data submission, geospatial information retrieval, and strategic development reporting in compliance with municipal zoning ordinances and regulatory requirements.</p>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-slate-900 mb-1">PROHIBITED ACTIVITIES</h4>
                                        <p className="leading-relaxed">Users are strictly prohibited from: (a) attempting unauthorized access to restricted areas of the system, (b) uploading or transmitting malicious software, viruses, or harmful code, (c) interfering with system operations or security measures, (d) using the system for commercial purposes without explicit authorization, and (e) violating any applicable local, national, or international laws.</p>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-slate-900 mb-1">ACCOUNT SECURITY</h4>
                                        <p className="leading-relaxed">Users are responsible for maintaining the confidentiality of their login credentials and for all activities that occur under their account. You must immediately notify the system administrator of any unauthorized use of your account or any other breach of security.</p>
                                    </div>
                                </div>
                            </section>

                            <section>
                                <h3 className="text-[#0A2540] font-bold text-base mb-3 uppercase tracking-wide">Data Submission & Accuracy Requirements</h3>
                                <div className="space-y-4">
                                    <div>
                                        <h4 className="font-semibold text-slate-900 mb-1">INFORMATION ACCURACY</h4>
                                        <p className="leading-relaxed">All geospatial data, zoning information, and development documentation submitted through the system must be accurate, complete, current, and truthful. Users are legally responsible for the veracity of all information provided and may be subject to penalties for knowingly submitting false or misleading information.</p>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-slate-900 mb-1">MANDATORY REPORTING</h4>
                                        <p className="leading-relaxed">Certain property developers, landowners, and stakeholders may be subject to mandatory reporting requirements under applicable municipal zoning laws and regulations. Failure to comply with such requirements may result in administrative sanctions and legal consequences.</p>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-slate-900 mb-1">DATA RETENTION</h4>
                                        <p className="leading-relaxed">Submitted information becomes part of the official municipal development database and may be retained for statistical, strategic planning, and regulatory compliance purposes in accordance with government record-keeping requirements and applicable data retention policies.</p>
                                    </div>
                                </div>
                            </section>

                            <section>
                                <h3 className="text-[#0A2540] font-bold text-base mb-3 uppercase tracking-wide">Intellectual Property Rights</h3>
                                <div className="space-y-4">
                                    <div>
                                        <h4 className="font-semibold text-slate-900 mb-1">GOVERNMENT OWNERSHIP</h4>
                                        <p className="leading-relaxed">iMAPS, including all software, databases, designs, maps, text, graphics, and other content, is owned by the Municipal Government of Rosario and is protected by intellectual property laws. Users are granted a limited, non-exclusive license to access and use the system solely for authorized purposes.</p>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-slate-900 mb-1">USER CONTENT</h4>
                                        <p className="leading-relaxed">By submitting information, data, or content to the system, you grant the Municipal Government of Rosario a perpetual, non-exclusive, royalty-free license to use, reproduce, modify, and distribute such content for municipal planning, statistical analysis, and governmental purposes.</p>
                                    </div>
                                </div>
                            </section>

                            <section>
                                <h3 className="text-[#0A2540] font-bold text-base mb-3 uppercase tracking-wide">System Availability & Technical Support</h3>
                                <div className="space-y-4">
                                    <div>
                                        <h4 className="font-semibold text-slate-900 mb-1">SERVICE AVAILABILITY</h4>
                                        <p className="leading-relaxed">While we strive to maintain continuous system availability, we do not guarantee uninterrupted access to iMAPS. Scheduled maintenance, system upgrades, and unforeseen technical issues may result in temporary service interruptions.</p>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-slate-900 mb-1">TECHNICAL SUPPORT</h4>
                                        <p className="leading-relaxed">Technical support is provided during regular business hours (Monday to Friday, 8:00 AM to 5:00 PM, Philippine Time). Users may contact support through the designated helpdesk channels for assistance with system-related issues.</p>
                                    </div>
                                </div>
                            </section>

                            <section>
                                <h3 className="text-[#0A2540] font-bold text-base mb-3 uppercase tracking-wide">Limitation of Liability & Disclaimers</h3>
                                <div className="space-y-4">
                                    <div>
                                        <h4 className="font-semibold text-slate-900 mb-1">DISCLAIMER OF WARRANTIES</h4>
                                        <p className="leading-relaxed">iMAPS is provided "as is" without any warranties, express or implied. We disclaim all warranties including, but not limited to, merchantability, fitness for a particular purpose, and non-infringement.</p>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-slate-900 mb-1">LIMITATION OF LIABILITY</h4>
                                        <p className="leading-relaxed">To the maximum extent permitted by law, the Municipal Government of Rosario shall not be liable for any direct, indirect, incidental, consequential, or punitive damages arising from your use of the system, including but not limited to data loss, business interruption, or system downtime.</p>
                                    </div>
                                </div>
                            </section>

                            <section>
                                <h3 className="text-[#0A2540] font-bold text-base mb-3 uppercase tracking-wide">Compliance & Regulatory Framework</h3>
                                <div className="space-y-4">
                                    <div>
                                        <h4 className="font-semibold text-slate-900 mb-1">LEGAL COMPLIANCE</h4>
                                        <p className="leading-relaxed">All use of iMAPS must comply with applicable Philippine laws, including but not limited to the Data Privacy Act of 2012, the Cybercrime Prevention Act of 2012, and all relevant zoning ordinances and local regulations of Rosario, Batangas.</p>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-slate-900 mb-1">REGULATORY OVERSIGHT</h4>
                                        <p className="leading-relaxed">The system operates under the supervision of the Municipal Planning and Development Office, National Privacy Commission, and other relevant regulatory bodies. Users may be subject to audits, investigations, and compliance reviews.</p>
                                    </div>
                                </div>
                            </section>

                            <section>
                                <h3 className="text-[#0A2540] font-bold text-base mb-3 uppercase tracking-wide">Modifications & Termination</h3>
                                <div className="space-y-4">
                                    <div>
                                        <h4 className="font-semibold text-slate-900 mb-1">TERMS MODIFICATION</h4>
                                        <p className="leading-relaxed">These Terms and Conditions may be updated or modified at any time without prior notice. Users are responsible for regularly reviewing these terms, and continued use of the system constitutes acceptance of any modifications.</p>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-slate-900 mb-1">TERMINATION RIGHTS</h4>
                                        <p className="leading-relaxed">We reserve the right to suspend or terminate user access to the system at any time, with or without cause, including for violations of these terms, suspicious activity, or legal compliance requirements.</p>
                                    </div>
                                </div>
                            </section>

                            <section className="bg-slate-50 border border-slate-200 p-5 rounded-lg">
                                <h3 className="text-[#0A2540] font-bold text-base mb-4 uppercase tracking-wide">Contact Information</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="block font-semibold text-slate-900">System Administrator</span>
                                        <a href="mailto:admin@imaps-rosario.gov.ph" className="text-blue-600 hover:underline">admin@imaps-rosario.gov.ph</a>
                                    </div>
                                    <div>
                                        <span className="block font-semibold text-slate-900">Legal Affairs Office</span>
                                        <a href="mailto:legal@imaps-rosario.gov.ph" className="text-blue-600 hover:underline">legal@imaps-rosario.gov.ph</a>
                                    </div>
                                    <div className="md:col-span-2">
                                        <span className="block font-semibold text-slate-900">Mailing Address</span>
                                        <p className="text-slate-600">Municipal Planning and Development Office, Municipal Hall, Rosario, Batangas 4225</p>
                                    </div>
                                </div>
                            </section>
                        </div>
                        
                        {/* Modal Footer */}
                        <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50 rounded-b-xl">
                            <button 
                                onClick={() => setShowTerms(false)}
                                className="px-6 py-2 bg-[#0A2540] text-white rounded-lg hover:bg-blue-800 transition-colors text-sm font-medium"
                            >
                                I Understand & Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}