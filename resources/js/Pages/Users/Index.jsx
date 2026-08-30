import React, { useState, useEffect } from "react";
import { Head, router, Link } from "@inertiajs/react";
import Swal from "sweetalert2";
import axios from "axios";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";

export default function Index({ users, filters, auth }) {
    const [clock, setClock] = useState("");
    const [search, setSearch] = useState(filters.search || "");
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const userName = auth?.user?.name || "Administrator";
    const userRole = auth?.user?.role || "Admin";

    const [unlockedData, setUnlockedData] = useState({});
    
    const [editingUser, setEditingUser] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const tick = () => {
            const now = new Date();
            setClock(now.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) + " · " + now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }));
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        const t = setTimeout(() => {
            if (search !== filters.search) {
                router.get("/users", { ...filters, search, page: 1 }, { preserveState: true, replace: true });
            }
        }, 400);
        return () => clearTimeout(t);
    }, [search]);
    
    const applyFilter = (newFilters) => router.get("/users", { ...filters, ...newFilters, page: 1 }, { preserveState: true, replace: true });
    
    const clearFilters = () => {
        setSearch("");
        router.get("/users", {}, { preserveState: true, replace: true });
    };

    const handleLogout = () => {
        if (confirm("Sign out from iMAPS?")) router.post("/logout");
    };

    const getInitials = (name) => name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

    // Horizontal View Stats Modal
    const handleViewStats = (user) => {
        let statsHtml = '';
        if (user.role === 'Planning Officer') {
            const stats = user.stats || {
                total_fees: "₱0.00",
                top_barangay: "N/A",
                types: { locational: 0, development: 0, zoning: 0, special: 0 },
                status: { released: 0, pending: 0, denied: 0 }
            };

            statsHtml = `
                <div class="flex flex-col md:flex-row gap-6 text-left">
                    <!-- Left Column: User Summary -->
                    <div class="w-full md:w-1/3 flex flex-col items-center justify-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                        <div class="absolute top-0 left-0 w-full h-16 bg-gradient-to-r from-emerald-500 to-teal-600"></div>
                        <div class="w-20 h-20 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-3xl font-black mb-3 border-4 border-white shadow-md relative z-10">
                            ${getInitials(user.name)}
                        </div>
                        <h3 class="text-[17px] font-black text-slate-800 text-center leading-tight mb-1 relative z-10">${user.name}</h3>
                        <span class="inline-flex px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-bold uppercase tracking-widest mb-6 relative z-10">Planning Officer</span>
                        
                        <div class="w-full border-t border-slate-100 pt-5 text-center mt-auto">
                            <div class="text-4xl font-black text-slate-800">${user.encoded_applications_count || 0}</div>
                            <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Total Encoded</div>
                        </div>
                    </div>

                    <!-- Right Column: Metrics Grid -->
                    <div class="w-full md:w-2/3 flex flex-col gap-4">
                        <!-- Top Highlights -->
                        <div class="grid grid-cols-2 gap-4">
                            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <div class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                                    <svg class="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    Financial Volume
                                </div>
                                <div class="text-xl font-black text-emerald-600 truncate">${stats.total_fees}</div>
                            </div>
                            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <div class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                                    <svg class="w-3.5 h-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    Top Barangay
                                </div>
                                <div class="text-xl font-black text-blue-600 truncate">${stats.top_barangay}</div>
                            </div>
                        </div>

                        <!-- Breakdowns -->
                        <div class="grid grid-cols-2 gap-4 flex-1">
                            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                                <div class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">By App Type</div>
                                <div class="flex flex-col gap-2.5 text-xs flex-1 justify-center">
                                    <div class="flex justify-between items-center"><span class="text-slate-500 font-medium">Locational</span> <span class="font-black text-slate-700 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">${stats.types.locational}</span></div>
                                    <div class="flex justify-between items-center"><span class="text-slate-500 font-medium">Development</span> <span class="font-black text-slate-700 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">${stats.types.development}</span></div>
                                    <div class="flex justify-between items-center"><span class="text-slate-500 font-medium">Zoning Cert</span> <span class="font-black text-slate-700 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">${stats.types.zoning}</span></div>
                                    <div class="flex justify-between items-center"><span class="text-slate-500 font-medium">Special Use</span> <span class="font-black text-slate-700 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">${stats.types.special}</span></div>
                                </div>
                            </div>
                            
                            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                                <div class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">Success Rate</div>
                                <div class="flex flex-col gap-2 flex-1 justify-center">
                                    <div class="flex items-center justify-between bg-emerald-50 text-emerald-700 rounded-lg p-2 border border-emerald-100">
                                        <span class="text-[10px] font-bold uppercase tracking-wider">Released</span>
                                        <span class="text-[15px] font-black">${stats.status.released}</span>
                                    </div>
                                    <div class="flex items-center justify-between bg-amber-50 text-amber-700 rounded-lg p-2 border border-amber-100">
                                        <span class="text-[10px] font-bold uppercase tracking-wider">Pending</span>
                                        <span class="text-[15px] font-black">${stats.status.pending}</span>
                                    </div>
                                    <div class="flex items-center justify-between bg-red-50 text-red-700 rounded-lg p-2 border border-red-100">
                                        <span class="text-[10px] font-bold uppercase tracking-wider">Denied</span>
                                        <span class="text-[15px] font-black">${stats.status.denied}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else if (user.role === 'Site Inspector') {
            const stats = user.inspector_stats || {
                total_caseload: 0, 
                status: { pending: 0, in_progress: 0, completed: 0 },
                initiative_rate: 0, compliance_rate: 0, rework_frequency: 0, 
                avg_photos: 0, checklist_accuracy: 0
            };

            statsHtml = `
                <div class="flex flex-col md:flex-row gap-6 text-left">
                    <!-- Left Column: User Summary -->
                    <div class="w-full md:w-1/3 flex flex-col items-center justify-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                        <div class="absolute top-0 left-0 w-full h-16 bg-gradient-to-r from-amber-500 to-orange-500"></div>
                        <div class="w-20 h-20 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center text-3xl font-black mb-3 border-4 border-white shadow-md relative z-10">
                            ${getInitials(user.name)}
                        </div>
                        <h3 class="text-[17px] font-black text-slate-800 text-center leading-tight mb-1 relative z-10">${user.name}</h3>
                        <span class="inline-flex px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold uppercase tracking-widest mb-6 relative z-10">Site Inspector</span>
                        
                        <div class="w-full border-t border-slate-100 pt-5 text-center mt-auto">
                            <div class="text-4xl font-black text-slate-800">${stats.total_caseload}</div>
                            <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Total Caseload</div>
                        </div>
                    </div>

                    <!-- Right Column: Metrics Grid -->
                    <div class="w-full md:w-2/3 flex flex-col gap-4">
                        <!-- Top Highlights -->
                        <div class="grid grid-cols-3 gap-4">
                            <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-center">
                                <div class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Initiative Rate</div>
                                <div class="text-lg font-black text-amber-600">${stats.initiative_rate}%</div>
                            </div>
                            <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-center">
                                <div class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Compliance Rate</div>
                                <div class="text-lg font-black text-emerald-600">${stats.compliance_rate}%</div>
                            </div>
                            <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-center">
                                <div class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Checklist Acc.</div>
                                <div class="text-lg font-black text-blue-600">${stats.checklist_accuracy}%</div>
                            </div>
                        </div>

                        <!-- Breakdowns -->
                        <div class="grid grid-cols-2 gap-4 flex-1">
                            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                                <div class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">Status Breakdown</div>
                                <div class="flex flex-col gap-2 flex-1 justify-center">
                                    <div class="flex items-center justify-between bg-emerald-50 text-emerald-700 rounded-lg p-2 border border-emerald-100">
                                        <span class="text-[10px] font-bold uppercase tracking-wider">Completed</span>
                                        <span class="text-[15px] font-black">${stats.status.completed}</span>
                                    </div>
                                    <div class="flex items-center justify-between bg-blue-50 text-blue-700 rounded-lg p-2 border border-blue-100">
                                        <span class="text-[10px] font-bold uppercase tracking-wider">In Progress</span>
                                        <span class="text-[15px] font-black">${stats.status.in_progress}</span>
                                    </div>
                                    <div class="flex items-center justify-between bg-slate-50 text-slate-700 rounded-lg p-2 border border-slate-200">
                                        <span class="text-[10px] font-bold uppercase tracking-wider">Pending</span>
                                        <span class="text-[15px] font-black">${stats.status.pending}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                                <div class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">Quality & Evidence</div>
                                <div class="flex flex-col gap-3 text-xs flex-1 justify-center">
                                    <div class="flex justify-between items-center"><span class="text-slate-500 font-medium">Avg Photos/Job</span> <span class="font-black text-slate-700 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">${stats.avg_photos}</span></div>
                                    <div class="flex justify-between items-center"><span class="text-slate-500 font-medium">Reworks Required</span> <span class="font-black text-red-700 bg-red-50 px-2 py-0.5 rounded-md border border-red-100">${stats.rework_frequency}</span></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            // Ensure you update the width parameter in the Swal call below to '750px' for both roles[cite: 2].
        } else {
            statsHtml = `<div class="text-sm font-medium text-slate-500 italic text-center py-10 bg-white rounded-xl border border-slate-200 shadow-sm">— System Administrator —<br/>No specific field metrics tracked.</div>`;
        }

        Swal.fire({
            html: `<div class="p-2 bg-slate-50/50 mt-4">${statsHtml}</div>`,
            showConfirmButton: false,
            showCloseButton: true,
            customClass: { popup: 'rounded-2xl border border-slate-200' },
            width: user.role === 'Planning Officer' ? '750px' : '600px'
        });
    };

    const handleRevealSecurity = async (userId, userName) => {
        const { value: adminPassword, isConfirmed } = await Swal.fire({
            title: `Authenticate`,
            html: `
                <p class="text-xs text-slate-500 mb-3">Enter your admin password to view <b>${userName}'s</b> secure data.</p>
                <div class="relative w-full flex items-center">
                    <input type="password" id="swal-password" class="swal2-input !m-0 !w-full !pr-10" placeholder="Admin Password" autocapitalize="off" autocorrect="off">
                    <button type="button" id="toggle-password" class="absolute right-3 text-slate-400 hover:text-slate-600 focus:outline-none">
                        <svg id="eye-icon" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                    </button>
                </div>
            `,
            showCancelButton: true,
            confirmButtonColor: '#1e3a8a',
            confirmButtonText: 'Decrypt',
            didOpen: () => {
                const input = document.getElementById('swal-password');
                const btn = document.getElementById('toggle-password');
                const icon = document.getElementById('eye-icon');
                
                btn.addEventListener('click', () => {
                    if (input.type === 'password') {
                        input.type = 'text';
                        icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />`;
                    } else {
                        input.type = 'password';
                        icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />`;
                    }
                });
            },
            preConfirm: () => {
                const password = document.getElementById('swal-password').value;
                if (!password) Swal.showValidationMessage('Password is required');
                return password;
            }
        });

        if (isConfirmed && adminPassword) {
            try {
                const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
                const response = await axios.post('/users/sensitive-data', {
                    admin_password: adminPassword,
                    target_user_id: userId
                }, {
                    headers: {
                        'X-CSRF-TOKEN': csrfToken,
                        'Accept': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });
                
                if (response.data.success) {
                    setUnlockedData(prev => ({ ...prev, [userId]: response.data.supabase_uuid }));
                    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Data Decrypted', showConfirmButton: false, timer: 2000 });
                } else {
                    Swal.fire('Access Denied', response.data.message || 'Incorrect password.', 'error');
                }
            } catch (error) {
                if (error.response) {
                    Swal.fire(`Server Error (${error.response.status})`, error.response.data?.message || 'Server error', 'error');
                } else {
                    Swal.fire('Client Error', error.message, 'error');
                }
            }
        }
    };

    const handleResetPassword = async (userId, userName) => {
        const { value: formValues } = await Swal.fire({
            title: 'Reset Password',
            html: `
                <p class="text-xs text-slate-500 mb-4">Set a new password for <b>${userName}</b>.</p>
                <div class="relative w-full flex flex-col gap-3">
                    <input type="password" id="new-password" class="swal2-input !m-0 !w-full" placeholder="New Password" autocapitalize="off" autocorrect="off">
                    <input type="password" id="confirm-password" class="swal2-input !m-0 !w-full" placeholder="Confirm Password" autocapitalize="off" autocorrect="off">
                </div>
            `,
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Force Reset',
            preConfirm: () => {
                const p1 = document.getElementById('new-password').value;
                const p2 = document.getElementById('confirm-password').value;
                if (!p1 || !p2) Swal.showValidationMessage('Both fields are required');
                if (p1 !== p2) Swal.showValidationMessage('Passwords do not match');
                if (p1.length < 8) Swal.showValidationMessage('Password must be at least 8 characters');
                return p1;
            }
        });

        if (formValues) {
            try {
                const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
                const response = await axios.post('/users/reset-password', {
                    target_user_id: userId,
                    new_password: formValues
                }, {
                    headers: {
                        'X-CSRF-TOKEN': csrfToken,
                        'Accept': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });
                
                if (response.data.success) {
                    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Password Reset Successfully', showConfirmButton: false, timer: 2000 });
                }
            } catch (error) {
                const errorMsg = error.response?.data?.message || 'Server connection failed.';
                Swal.fire('Error', errorMsg, 'error');
            }
        }
    };

    const submitEditProfile = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const response = await axios.post(`/users/${editingUser.id}/update`, editingUser, {
                headers: {
                    'X-CSRF-TOKEN': csrfToken,
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            
            if (response.data.success) {
                Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Profile Updated', showConfirmButton: false, timer: 2000 });
                setEditingUser(null);
                router.reload({ only: ['users'] });
            }
        } catch (error) {
            const errorMsg = error.response?.data?.message || 'Server connection failed.';
            Swal.fire('Error', errorMsg, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const formatDateOnly = (dateString) => {
        if (!dateString) return "Unknown";
        return new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    };

    const formatDate = (dateString) => {
        if (!dateString) return "Never logged in";
        const d = new Date(dateString);
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    };

    const getRoleTheme = (role) => {
        switch(role) {
            case 'Admin': return { bg: 'bg-gradient-to-r from-blue-600 to-indigo-700', text: 'text-blue-700', border: 'border-blue-200', iconBg: 'bg-blue-50' };
            case 'Planning Officer': return { bg: 'bg-gradient-to-r from-emerald-500 to-teal-600', text: 'text-emerald-700', border: 'border-emerald-200', iconBg: 'bg-emerald-50' };
            case 'Site Inspector': return { bg: 'bg-gradient-to-r from-amber-500 to-orange-500', text: 'text-amber-700', border: 'border-amber-200', iconBg: 'bg-amber-50' };
            default: return { bg: 'bg-gradient-to-r from-slate-500 to-slate-700', text: 'text-slate-700', border: 'border-slate-200', iconBg: 'bg-slate-50' };
        }
    };

    return (
        <>
            <Head title="User Management | iMAPS" />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&family=DM+Mono:wght@400;500;700&display=swap');
                #dashboard-root, #dashboard-root :not(.font-mono) { font-family: 'Poppins', sans-serif !important; }
                #dashboard-root .font-mono, #dashboard-root .font-mono * { font-family: 'DM Mono', monospace !important; }
                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
                .form-enter { animation: formFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                @keyframes formFadeIn { 0% { opacity: 0; transform: translateY(5px); } 100% { opacity: 1; transform: translateY(0); } }
            `}</style>

            <div id="dashboard-root" className="bg-slate-50 font-sans text-slate-800 h-screen flex flex-col overflow-hidden">
                <Header userName={userName} userRole={userRole} clock={clock} onLogout={handleLogout} />

                <div className="flex flex-1 h-full overflow-hidden relative">
                    <Sidebar userName={userName} userRole={userRole} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} onLogout={handleLogout} activePage="users" />

                    <main className="flex-1 w-full h-full flex flex-col transition-all duration-500 ease-in-out bg-[#f8fafc]" style={{ paddingLeft: sidebarOpen ? "200px" : "0px" }}>
                        <div className="p-4 md:p-6 flex-1 flex flex-col h-full overflow-hidden max-w-[1400px] mx-auto w-full">
                           
                            <div className="mb-4 flex-shrink-0 flex items-center justify-between gap-4 form-enter">
                                <div>
                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                                        <span className="text-slate-800">Security</span>
                                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                        <span className="text-slate-500">Access Control</span>
                                    </div>
                                    <h2 className="text-2xl font-black text-slate-800 tracking-tight leading-none">User Management</h2>
                                </div>
                                
                                <Link 
                                    href="/register-new-account" 
                                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-bold shadow-sm transition-all active:scale-95"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                                    Register New Account
                                </Link>
                            </div>

                            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-[0_2px_10px_rgb(0,0,0,0.02)] mb-4 flex-shrink-0 form-enter flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-50 px-2 py-1 rounded">Role</span>
                                        {["", "Admin", "Planning Officer", "Site Inspector"].map((r) => (
                                            <button
                                                key={r || "all"}
                                                onClick={() => applyFilter({ role: r })}
                                                className={`text-[11px] font-bold px-3 py-1.5 rounded-[8px] transition-all border ${
                                                    (filters.role || "") === r
                                                        ? "bg-blue-50 border-blue-200 text-blue-700 shadow-sm"
                                                        : "bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                                                }`}
                                            >
                                                {r || "All Staff"}
                                            </button>
                                        ))}
                                    </div>
                                    {(filters.search || filters.role) && (
                                        <button onClick={clearFilters} className="text-[10px] font-bold uppercase tracking-widest text-red-500 hover:text-red-700 flex items-center gap-1 ml-2">
                                            Reset
                                        </button>
                                    )}
                                </div>

                                <div className="relative w-full lg:w-[280px]">
                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                    <input
                                        type="text"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Search name or email..."
                                        className="w-full rounded-[10px] border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-[12px] font-medium text-slate-800 transition-all focus:bg-white focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                            </div>

                            <div className="flex-1 overflow-auto form-enter pr-2">
                                {users.data.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center p-8 mt-10">
                                        <p className="text-[12px] font-medium text-slate-500">No users match your criteria.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-10">
                                        {users.data.map((u) => {
                                            const theme = getRoleTheme(u.role);
                                            
                                            return (
                                                <div key={u.id} className={`bg-white rounded-[20px] border-2 shadow-sm flex flex-col overflow-hidden hover:shadow-md transition-all duration-300 relative group min-h-[380px] ${!u.is_active ? 'border-red-200' : 'border-slate-200/60 hover:border-slate-300'}`}>
                                                    
                                                    {/* Card Holo / Banner */}
                                                    <div className={`h-24 w-full ${!u.is_active ? 'bg-red-500' : theme.bg} relative`}>
                                                        {!u.is_active && (
                                                            <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm text-red-600 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm">
                                                                Blocked
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Avatar overlapping banner */}
                                                    <div className="relative -mt-12 flex justify-center z-10 mb-2">
                                                        <div className={`w-24 h-24 rounded-full flex items-center justify-center text-3xl font-black shadow-md border-4 border-white ${u.is_active ? `${theme.iconBg} ${theme.text}` : 'bg-red-50 text-red-400'}`}>
                                                            {getInitials(u.name)}
                                                        </div>
                                                    </div>

                                                    {/* Card Body */}
                                                    <div className="px-5 flex-1 flex flex-col">
                                                        <div className="text-center mb-4">
                                                            <h3 className={`text-[18px] font-black leading-tight mb-0.5 transition-colors ${!u.is_active ? 'text-red-700' : 'text-slate-800 group-hover:text-blue-600'}`}>{u.name}</h3>
                                                            <p className="text-[11px] font-mono text-slate-500 truncate mb-2">{u.email}</p>
                                                            <span className={`inline-flex px-3 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-widest ${!u.is_active ? 'border-red-200 bg-red-50 text-red-700' : `${theme.border} ${theme.iconBg} ${theme.text}`}`}>
                                                                {u.role}
                                                            </span>
                                                        </div>

                                                        {/* Metadata */}
                                                        <div className="grid grid-cols-2 gap-2 mb-4 px-1 mt-auto">
                                                            <div>
                                                                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Joined</div>
                                                                <div className="text-[10px] font-medium text-slate-700">{formatDateOnly(u.created_at)}</div>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Last Login</div>
                                                                <div className="text-[10px] font-medium text-slate-700">{formatDate(u.last_login)}</div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Footer Actions */}
                                                    <div className="p-3 border-t border-slate-100 bg-slate-50 flex gap-2 shrink-0">
                                                        <button 
                                                            onClick={() => setEditingUser({ ...u })}
                                                            className="flex-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-bold py-2 rounded-xl transition-colors shadow-sm"
                                                        >
                                                            Edit Profile
                                                        </button>
                                                        <button 
                                                            onClick={() => handleViewStats(u)}
                                                            className="flex-1 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 text-blue-600 text-[11px] font-bold py-2 rounded-xl transition-colors shadow-sm"
                                                        >
                                                            View Stats
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </main>
                </div>
            </div>

            {/* Edit Profile Modal */}
            {editingUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-xl w-full max-w-md flex flex-col shadow-2xl relative overflow-hidden">
                        
                        <div className="flex justify-between items-center p-6 border-b border-slate-100">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">Edit User Profile</h2>
                                <p className="text-xs text-slate-500 mt-1">Modify account details and access level.</p>
                            </div>
                            <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 p-1.5 rounded-md transition-colors">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <form onSubmit={submitEditProfile} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Name</label>
                                <input 
                                    type="text" 
                                    value={editingUser.name}
                                    onChange={(e) => setEditingUser({...editingUser, name: e.target.value})}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email Address</label>
                                <input 
                                    type="email" 
                                    value={editingUser.email}
                                    onChange={(e) => setEditingUser({...editingUser, email: e.target.value})}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                                    required
                                />
                            </div>


                            {!editingUser.is_active && (
                                <div className="flex items-start gap-3 mt-1 bg-red-50 p-4 rounded-xl border border-red-100">
                                    <div className="flex items-center h-5">
                                        <input 
                                            id="unblock-checkbox"
                                            type="checkbox"
                                            checked={editingUser.is_active}
                                            onChange={(e) => setEditingUser({...editingUser, is_active: e.target.checked})}
                                            className="w-4 h-4 text-blue-600 bg-white border-red-300 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer"
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <label htmlFor="unblock-checkbox" className="text-sm font-bold text-red-700 cursor-pointer">
                                            Unblock Account
                                        </label>
                                        <p className="text-xs text-red-500/80 mt-0.5">Check this box to restore system access.</p>
                                    </div>
                                </div>
                            )}

                            {editingUser.is_active && (
                                <div className="flex items-start gap-3 mt-1 bg-slate-50 p-4 rounded-xl border border-slate-200">
                                    <div className="flex items-center h-5">
                                        <input 
                                            id="block-checkbox"
                                            type="checkbox"
                                            checked={!editingUser.is_active}
                                            onChange={(e) => setEditingUser({...editingUser, is_active: !e.target.checked})}
                                            className="w-4 h-4 text-red-600 bg-white border-slate-300 rounded focus:ring-red-500 focus:ring-2 cursor-pointer"
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <label htmlFor="block-checkbox" className="text-sm font-bold text-slate-700 cursor-pointer">
                                            Manually Block Account
                                        </label>
                                        <p className="text-xs text-slate-500 mt-0.5">Check this box to immediately revoke access.</p>
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-between items-center pt-4 mt-2 border-t border-slate-100">
                                <button 
                                    type="button" 
                                    onClick={() => handleResetPassword(editingUser.id, editingUser.name)}
                                    className="px-4 py-2 text-[11px] font-bold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-200 uppercase tracking-widest"
                                >
                                    Force Reset Key
                                </button>
                                <div className="flex gap-2">
                                    <button 
                                        type="button" 
                                        onClick={() => setEditingUser(null)}
                                        className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="submit" 
                                        disabled={isSaving}
                                        className="px-4 py-2.5 text-sm font-bold text-white bg-[#0A2540] hover:bg-blue-800 rounded-lg transition-colors disabled:opacity-70 flex items-center gap-2"
                                    >
                                        {isSaving ? 'Saving...' : 'Save Changes'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}