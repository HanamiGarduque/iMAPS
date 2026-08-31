import React, { useState, useEffect } from "react";
import { Head, router, Link } from "@inertiajs/react";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";

export default function Index({ users, filters, auth }) {
    const [clock, setClock] = useState("");
    const [search, setSearch] = useState(filters.search || "");
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const userName = auth?.user?.name || "Administrator";
    const userRole = auth?.user?.role || "Admin";

    // Unlocked secure data state
    const [unlockedData, setUnlockedData] = useState({});

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
    }, [search, filters]);

    const applyFilter = (newFilters) => router.get("/users", { ...filters, ...newFilters, page: 1 }, { preserveState: true, replace: true });
    
    const clearFilters = () => {
        setSearch("");
        router.get("/users", {}, { preserveState: true, replace: true });
    };

    const handleLogout = () => {
        Swal.fire({
            title: "Sign Out?",
            text: "Are you sure you want to log out of iMAPS?",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Yes, sign out",
            cancelButtonText: "Cancel",
            buttonsStyling: false,
            customClass: {
                popup: "rounded-3xl border border-slate-200 shadow-2xl p-6 sm:p-8 bg-white font-sans",
                title: "text-lg font-bold text-slate-900",
                htmlContainer: "text-xs text-slate-500",
                actions: "flex items-center justify-center gap-3 mt-5",
                confirmButton: "inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer",
                cancelButton: "inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-all active:scale-95 cursor-pointer",
            },
        }).then((result) => {
            if (result.isConfirmed) {
                sessionStorage.removeItem("hasShownWelcome");
                router.post("/logout");
            }
        });
    };

    // Prompt Admin Password to Reveal Supabase UUID
    const handleRevealSecurity = async (userId, userName) => {
        const { value: adminPassword } = await Swal.fire({
            title: `Authenticate`,
            html: `<p class="text-xs text-slate-500 mb-2">Enter your admin password to view <b>${userName}'s</b> secure data.</p>`,
            input: 'password',
            inputPlaceholder: 'Admin Password',
            showCancelButton: true,
            confirmButtonColor: '#1e3a8a',
            confirmButtonText: 'Decrypt',
            inputAttributes: {
                autocapitalize: 'off',
                autocorrect: 'off'
            }
        });

        if (adminPassword) {
            try {
                const response = await fetch('/users/sensitive-data', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content')
                    },
                    body: JSON.stringify({ admin_password: adminPassword, target_user_id: userId })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    setUnlockedData(prev => ({ ...prev, [userId]: data.supabase_uuid }));
                    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Data Decrypted', showConfirmButton: false, timer: 2000 });
                } else {
                    Swal.fire('Access Denied', data.message || 'Incorrect password.', 'error');
                }
            } catch (error) {
                Swal.fire('Error', 'Server connection failed.', 'error');
            }
        }
    };

    // Generate Initials for Avatar
    const getInitials = (name) => {
        return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
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
                <Header userName={userName} userRole={userRole} clock={clock} onLogout={handleLogout} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

                <div className="flex flex-1 h-full overflow-hidden relative">
                    <Sidebar userName={userName} userRole={userRole} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} onLogout={handleLogout} activePage="users" />

                    <main className="flex-1 w-full h-full flex flex-col bg-[#f8fafc]">
                        <div className="p-4 md:p-6 flex-1 flex flex-col h-full overflow-hidden max-w-[1400px] mx-auto w-full">
                           
                            {/* Header Area */}
                            <div className="mb-4 flex-shrink-0 flex items-center justify-between gap-4 form-enter">
    <div>
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
            <span className="text-slate-800">Security</span>
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            <span className="text-slate-500">Access Control</span>
        </div>
        <h2 className="text-2xl font-black text-slate-800 tracking-tight leading-none">User Management</h2>
    </div>
    
    {/* Converted to Inertia Link pointing to /register */}
    <Link 
        href="/register-new-account" 
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-bold shadow-sm transition-all active:scale-95"
    >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
        Register New Account
    </Link>
</div>

                            {/* Filters & Search */}
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

                            {/* User List Grid (Unique Layout) */}
                            <div className="flex-1 overflow-auto form-enter pr-2 space-y-3">
                                {users.data.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center p-8 mt-10">
                                        <p className="text-[12px] font-medium text-slate-500">No users match your criteria.</p>
                                    </div>
                                ) : (
                                    users.data.map((u) => (
                                        <div key={u.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-[0_2px_10px_rgb(0,0,0,0.02)] flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-blue-300 transition-colors">
                                            
                                            {/* Identity Col */}
                                            <div className="flex items-center gap-4 min-w-[280px]">
                                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-black shadow-inner border ${u.is_active ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                                                    {getInitials(u.name)}
                                                </div>
                                                <div>
                                                    <h3 className="text-[14px] font-bold text-slate-800 flex items-center gap-2">
                                                        {u.name}
                                                        {!u.is_active && <span className="text-[9px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded uppercase tracking-wider">Inactive</span>}
                                                    </h3>
                                                    <p className="text-[11px] font-mono text-slate-500">{u.email}</p>
                                                </div>
                                            </div>

                                            {/* Performance Col */}
                                            <div className="flex flex-col md:items-center min-w-[200px]">
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{u.role}</span>
                                                {u.role === 'Planning Officer' && (
                                                    <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-[6px] border border-emerald-200 text-[11px] font-bold">
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                        {u.encoded_applications_count} Apps Encoded
                                                    </div>
                                                )}
                                                {u.role === 'Site Inspector' && (
                                                    <div className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-2.5 py-1 rounded-[6px] border border-amber-200 text-[11px] font-bold">
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                                        {u.completed_inspections_count} Inspections Completed
                                                    </div>
                                                )}
                                                {u.role === 'Admin' && <span className="text-[11px] text-slate-400 font-medium">—</span>}
                                            </div>

                                            {/* Security Data Col */}
                                            <div className="flex flex-col min-w-[300px] bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-[9px] font-bold text-slate-500 uppercase">Supabase Sync ID</span>
                                                    {!unlockedData[u.id] ? (
                                                        <button onClick={() => handleRevealSecurity(u.id, u.name)} className="text-[9px] font-bold text-blue-600 hover:underline flex items-center gap-1">
                                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                                            Decrypt
                                                        </button>
                                                    ) : (
                                                        <span className="text-[9px] font-bold text-emerald-600 flex items-center gap-1">
                                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                                                            Unlocked
                                                        </span>
                                                    )}
                                                </div>
                                                {unlockedData[u.id] ? (
                                                    <span className="font-mono text-[10px] text-slate-800 tracking-tight break-all">{unlockedData[u.id]}</span>
                                                ) : (
                                                    <span className="font-mono text-[10px] text-slate-400 select-none">••••••••-••••-••••-••••-••••••••••••</span>
                                                )}
                                                
                                                <div className="h-px bg-slate-200 my-1.5" />
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[9px] font-bold text-slate-500 uppercase">Authentication</span>
                                                    <span className="text-[9px] font-medium text-slate-400">Bcrypt Encrypted</span>
                                                </div>
                                            </div>

                                            {/* Action Col */}
                                            <div className="flex md:flex-col gap-2 border-l border-slate-100 pl-4">
                                                <button className="text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg w-full text-center">Edit Profile</button>
                                            </div>

                                        </div>
                                    ))
                                )}
                                
                                {/* Pagination */}
                                {users.last_page > 1 && (
                                    <div className="pt-4 pb-8 flex items-center justify-between">
                                        <p className="text-[11px] font-medium text-slate-500">
                                            Showing <span className="font-bold">{users.from}</span> to <span className="font-bold">{users.to}</span> of <span className="font-bold">{users.total}</span>
                                        </p>
                                        <div className="flex items-center gap-1.5">
                                            {users.links.map((link, i) => (
                                                <button
                                                    key={i}
                                                    disabled={!link.url}
                                                    onClick={() => link.url && router.get(link.url, {}, { preserveState: true })}
                                                    className={`inline-flex items-center justify-center min-w-[32px] h-8 px-2 rounded-[8px] text-[11px] font-bold transition-all border
                                                        ${link.active ? "bg-blue-600 border-blue-600 text-white shadow-sm" : ""}
                                                        ${!link.url ? "opacity-40 cursor-not-allowed border-slate-200 bg-white text-slate-400" : ""}
                                                        ${link.url && !link.active ? "border-slate-200 bg-white text-slate-600 hover:border-slate-300" : ""}
                                                    `}
                                                    dangerouslySetInnerHTML={{ __html: link.label }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        </>
    );
}