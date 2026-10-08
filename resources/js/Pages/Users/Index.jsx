import React, { useState, useEffect, useMemo } from "react";
import { Head, router, Link } from "@inertiajs/react";
import Swal from "sweetalert2";
import axios from "axios";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import { confirmSignOut } from "@/utils/signOut";

export default function Index({ users = { data: [], links: [] }, filters = {}, role_counts = {}, auth = {} }) {
    const [clock, setClock] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [search, setSearch] = useState(filters.search || "");
    const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'active' | 'inactive'
    const [viewMode, setViewMode] = useState(() => {
        if (typeof window !== "undefined") {
            return localStorage.getItem("imaps_users_view") || "table";
        }
        return "table";
    });

    // Authenticated user
    const currentUserId = auth?.user?.id;
    const currentUserEmail = (auth?.user?.email || "").toLowerCase();
    const userName = auth?.user?.name || "Administrator";
    const userRole = auth?.user?.role || "Admin";

    // Modals
    const [statsModalUser, setStatsModalUser] = useState(null);

    // Account Modal (Edit Profile <-> Reset Password, one modal, two views)
    const [editingUser, setEditingUser] = useState(null);
    const [accountModalView, setAccountModalView] = useState("profile"); // 'profile' | 'password'
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [newPasswordInput, setNewPasswordInput] = useState("");
    const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
    const [adminPasswordInput, setAdminPasswordInput] = useState("");
    const [showResetPassword, setShowResetPassword] = useState(false);
    const [passwordResetError, setPasswordResetError] = useState("");
    const [isResettingPassword, setIsResettingPassword] = useState(false);

    const closeAccountModal = () => {
        setEditingUser(null);
        setAccountModalView("profile");
        setNewPasswordInput("");
        setConfirmPasswordInput("");
        setAdminPasswordInput("");
        setPasswordResetError("");
        setShowResetPassword(false);
    };

    const openPasswordView = () => {
        setAccountModalView("password");
        setNewPasswordInput("");
        setConfirmPasswordInput("");
        setAdminPasswordInput("");
        setPasswordResetError("");
    };

    const backToProfileView = () => {
        setAccountModalView("profile");
        setNewPasswordInput("");
        setConfirmPasswordInput("");
        setAdminPasswordInput("");
        setPasswordResetError("");
    };

    // View Logs Modal (per-user audit trail)
    const [logsModalUser, setLogsModalUser] = useState(null);
    const [userLogs, setUserLogs] = useState([]);
    const [isLoadingLogs, setIsLoadingLogs] = useState(false);
    const [logsError, setLogsError] = useState("");
    const [expandedLogId, setExpandedLogId] = useState(null);

    const handleSetViewMode = (mode) => {
        setViewMode(mode);
        if (typeof window !== "undefined") {
            localStorage.setItem("imaps_users_view", mode);
        }
    };

    // Live clock ticker
    useEffect(() => {
        const tick = () => {
            const now = new Date();
            setClock(
                now.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) +
                " · " +
                now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })
            );
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

    // Debounced search (300ms)
    useEffect(() => {
        const t = setTimeout(() => {
            if (search !== (filters.search || "")) {
                router.get(
                    "/users",
                    { ...filters, search: search || undefined, page: 1 },
                    { preserveState: true, replace: true }
                );
            }
        }, 300);
        return () => clearTimeout(t);
    }, [search]);

    // Keyboard shortcut (Escape closes open modals)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === "Escape") {
                if (statsModalUser) setStatsModalUser(null);
                if (editingUser) {
                    if (accountModalView === "password") {
                        backToProfileView();
                    } else {
                        closeAccountModal();
                    }
                }
                if (logsModalUser) {
                    setLogsModalUser(null);
                    setUserLogs([]);
                    setLogsError("");
                    setExpandedLogId(null);
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [statsModalUser, editingUser, accountModalView, logsModalUser]);

    const applyFilter = (newFilters) => {
        router.get(
            "/users",
            { ...filters, ...newFilters, page: 1 },
            { preserveState: true, replace: true }
        );
    };

    const clearFilters = () => {
        setSearch("");
        setStatusFilter("all");
        router.get("/users", {}, { preserveState: true, replace: true });
    };

    const handleLogout = confirmSignOut;

    // Client-side status filtering on current page items
    const displayedUsers = useMemo(() => {
        if (!users?.data) return [];
        return users.data.filter((u) => {
            if (statusFilter === "active") return !!u.is_active;
            if (statusFilter === "inactive") return !u.is_active;
            return true;
        });
    }, [users?.data, statusFilter]);

    // Live counts for tabs (Uses persistent role_counts from backend, never collapses to 0)
    const summaryStats = useMemo(() => {
        if (role_counts && Object.keys(role_counts).length > 0) {
            return {
                total: role_counts.total ?? 0,
                poCount: role_counts.po ?? 0,
                inspectorCount: role_counts.inspector ?? 0,
                adminCount: role_counts.admin ?? 0,
            };
        }
        const rawList = users?.data || [];
        const total = users?.total || rawList.length;
        const poCount = rawList.filter((u) => u.role === "Planning Officer").length;
        const inspectorCount = rawList.filter((u) => u.role === "Site Inspector").length;
        const adminCount = rawList.filter((u) => u.role === "Admin").length;

        return { total, poCount, inspectorCount, adminCount };
    }, [users, role_counts]);

    // Initials helper
    const getInitials = (name) => {
        if (!name) return "U";
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };

    // Date formatting
    const formatDateOnly = (dateString) => {
        if (!dateString) return "—";
        try {
            return new Date(dateString).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
            });
        } catch {
            return dateString;
        }
    };

    const formatRelativeOrDate = (dateString) => {
        if (!dateString) return "Never";
        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffDays = Math.floor(diffHours / 24);

            if (diffHours < 1) return "Just now";
            if (diffHours < 24) return `${diffHours}h ago`;
            if (diffDays === 1) return "Yesterday";
            if (diffDays < 7) return `${diffDays}d ago`;

            return date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
            });
        } catch {
            return dateString;
        }
    };

    const formatLogTime = (dateString) => {
        if (!dateString) return "";
        try {
            return new Date(dateString).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
            });
        } catch {
            return "";
        }
    };

    const formatActionLabel = (action) => {
        if (!action) return "Event";
        return action
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, (char) => char.toUpperCase());
    };

    // Open the per-user log drawer and fetch that user's audit trail
    const openLogs = async (user) => {
        setLogsModalUser(user);
        setUserLogs([]);
        setLogsError("");
        setExpandedLogId(null);
        setIsLoadingLogs(true);
        try {
            const response = await axios.get(`/users/${user.id}/logs`, {
                headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
            });
            if (response.data.success) {
                setUserLogs(response.data.logs || []);
            }
        } catch (error) {
            setLogsError(error.response?.data?.message || "Failed to load activity logs for this user.");
        } finally {
            setIsLoadingLogs(false);
        }
    };

    // Role badge configuration matching the exact design
    // One blue/slate scheme for every role.
    const getRoleBadge = (role) => ({
        label: role === "Admin" ? "System Admin" : role || "Staff",
        badgeClass: "bg-white text-slate-700 border-slate-200",
        avatarBg: "bg-blue-50 text-blue-700 border-blue-100",
    });

    // Submit Edit User Profile
    const submitEditProfile = async (e) => {
        e.preventDefault();
        if (!editingUser) return;
        setIsSavingProfile(true);

        try {
            // Loop 6: no manual CSRF header (Laravel XSRF-TOKEN cookie + Axios XSRF behavior).
            const response = await axios.post(
                `/users/${editingUser.id}/update`,
                {
                    name: editingUser.name,
                    email: editingUser.email,
                    is_active: editingUser.is_active,
                },
                {
                    headers: {
                        Accept: "application/json",
                        "X-Requested-With": "XMLHttpRequest",
                    },
                }
            );

            if (response.data.success) {
                Swal.fire({
                    toast: true,
                    position: "top-end",
                    icon: "success",
                    title: "User Profile Updated",
                    showConfirmButton: false,
                    timer: 2000,
                });
                closeAccountModal();
                router.reload({ only: ["users"] });
            }
        } catch (error) {
            const errorMsg = error.response?.data?.message || "Failed to update profile. Check form inputs.";
            Swal.fire({
                icon: "error",
                title: "Update Failed",
                text: errorMsg,
                customClass: {
                    popup: "rounded-2xl border border-slate-200 shadow-xl",
                    confirmButton: "bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-semibold",
                },
            });
        } finally {
            setIsSavingProfile(false);
        }
    };

    // Submit Force Password Reset
    const submitForcePasswordReset = async (e) => {
        e.preventDefault();
        if (!editingUser) return;

        if (!newPasswordInput || !confirmPasswordInput || !adminPasswordInput) {
            setPasswordResetError("All password fields are required.");
            return;
        }

        if (newPasswordInput.length < 8) {
            setPasswordResetError("Password must contain at least 8 characters.");
            return;
        }

        if (newPasswordInput !== confirmPasswordInput) {
            setPasswordResetError("Passwords do not match.");
            return;
        }

        setIsResettingPassword(true);
        setPasswordResetError("");

        try {
            // Loop 6: no manual CSRF header (Laravel XSRF-TOKEN cookie + Axios XSRF behavior).
            const response = await axios.post(
                "/users/reset-password",
                {
                    target_user_id: editingUser.id,
                    new_password: newPasswordInput,
                    admin_password: adminPasswordInput,
                },
                {
                    headers: {
                        Accept: "application/json",
                        "X-Requested-With": "XMLHttpRequest",
                    },
                }
            );

            if (response.data.success) {
                Swal.fire({
                    toast: true,
                    position: "top-end",
                    icon: "success",
                    title: "Password Reset Successfully",
                    showConfirmButton: false,
                    timer: 2200,
                });
                backToProfileView();
            }
        } catch (error) {
            const msg = error.response?.data?.message || "Password reset failed. Please verify credentials.";
            setPasswordResetError(msg);
        } finally {
            setIsResettingPassword(false);
        }
    };

    return (
        <>
        <Head title="User Management | iMAPS" />

        <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
                
                #users-page-root, .imaps-users-scope {
                    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }
                #users-page-root .font-mono, .imaps-users-scope .font-mono {
                    font-family: 'JetBrains Mono', monospace !important;
                }

                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 6px; }
                ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            `}</style>

        <div id="users-page-root" className="bg-slate-50/75 text-slate-800 h-screen flex flex-col overflow-hidden antialiased">
            <Header
                userName={userName}
                userRole={userRole}
                clock={clock}
                onLogout={handleLogout}
                sidebarOpen={sidebarOpen}
                setSidebarOpen={setSidebarOpen}
                activePage="users"
            />

            <div className="flex-1 overflow-hidden relative flex flex-col min-w-0">
                <Sidebar
                    userName={userName}
                    userRole={userRole}
                    sidebarOpen={sidebarOpen}
                    setSidebarOpen={setSidebarOpen}
                    onLogout={handleLogout}
                    activePage="users"
                />

                {sidebarOpen && (
                    <div
                        onClick={() => setSidebarOpen(false)}
                        className="absolute inset-0 bg-slate-900/20 backdrop-blur-xs z-[750] transition-opacity duration-200"
                    />
                )}

                <main className="flex-1 w-full h-full flex flex-col overflow-hidden bg-white">
                    <div className="flex-1 flex flex-col h-full min-h-0 w-full">

                        {/* No visible page header: the navbar's USERS badge names the page, the table stands alone. */}
                        <h1 className="sr-only">User Management</h1>

                        {/* Full-width panel: filter bar on top, results scroll below. */}
                        <div className="bg-white overflow-hidden flex flex-col flex-1 min-h-0">
                        {/* ── TOOLBAR: role switch (left), status/search/view (right) ── */}
                        <div className="px-6 py-3 border-b border-slate-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
                        <nav className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 border border-slate-200/80 overflow-x-auto max-w-full" aria-label="Filter by role">
                            {[
                                { id: "", label: "All staff", count: summaryStats.total },
                                { id: "Planning Officer", label: "Planning Officers", count: summaryStats.poCount },
                                { id: "Site Inspector", label: "Site Inspectors", count: summaryStats.inspectorCount },
                                { id: "Admin", label: "Administrators", count: summaryStats.adminCount },
                            ].map((card) => {
                                const on = (filters.role || "") === card.id;
                                return (
                                    <button
                                        key={card.id || "all"}
                                        type="button"
                                        onClick={() => applyFilter({ role: card.id })}
                                        aria-pressed={on}
                                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition-all cursor-pointer ${on
                                            ? "bg-white text-slate-900 font-semibold shadow-xs ring-1 ring-slate-200/80"
                                            : "text-slate-500 hover:text-slate-800"
                                            }`}
                                    >
                                        {card.label}
                                        <span className={`min-w-5 px-1.5 rounded-full text-[10.5px] font-semibold tabular-nums text-center ${on ? "bg-blue-600 text-white" : "bg-slate-200/80 text-slate-600"}`}>
                                            {card.count}
                                        </span>
                                    </button>
                                );
                            })}
                        </nav>

                            {/* Quick Search & Controls */}
                            <div className="flex items-center gap-2.5">
                                {/* Status Switch */}
                                <div className="inline-flex items-center rounded-lg border border-slate-200/90 p-0.5 bg-white shadow-2xs">
                                    {[
                                        { label: "All", val: "all" },
                                        { label: "Active", val: "active" },
                                        { label: "Suspended", val: "inactive" },
                                    ].map((s) => {
                                        const active = statusFilter === s.val;
                                        return (
                                            <button
                                                key={s.val}
                                                type="button"
                                                onClick={() => setStatusFilter(s.val)}
                                                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${active
                                                    ? "bg-slate-100 text-slate-800 font-semibold"
                                                    : "text-slate-500 hover:text-slate-800"
                                                    }`}
                                            >
                                                {s.label}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Search Input */}
                                <div className="relative w-48 sm:w-56">
                                    <svg
                                        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                    </svg>
                                    <input
                                        type="text"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Search name or email..."
                                        className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-7 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 shadow-2xs transition-all"
                                    />
                                    {search && (
                                        <button
                                            type="button"
                                            onClick={() => setSearch("")}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>

                                {/* View Mode Toggle */}
                                <div className="inline-flex items-center rounded-lg border border-slate-200/90 p-0.5 bg-white shadow-2xs">
                                    <button
                                        type="button"
                                        onClick={() => handleSetViewMode("table")}
                                        title="Table View"
                                        className={`p-1 rounded-md transition-all cursor-pointer ${viewMode === "table"
                                            ? "bg-slate-100 text-slate-900 font-semibold"
                                            : "text-slate-400 hover:text-slate-700"
                                            }`}
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                                        </svg>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleSetViewMode("grid")}
                                        title="Grid View"
                                        className={`p-1 rounded-md transition-all cursor-pointer ${viewMode === "grid"
                                            ? "bg-slate-100 text-slate-900 font-semibold"
                                            : "text-slate-400 hover:text-slate-700"
                                            }`}
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                                        </svg>
                                    </button>
                                </div>

                                {/* Primary action, moved here from the removed page header */}
                                <Link
                                    href="/register-new-account"
                                    className="inline-flex items-center gap-1.5 h-[30px] px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer whitespace-nowrap"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                    </svg>
                                    Register New Account
                                </Link>
                            </div>
                        </div>

                        {/* ── TABLE OR DIRECTORY CARDS ── */}
                        {displayedUsers.length === 0 ? (
                            <div className="p-12 text-center">
                                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-3">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                                    </svg>
                                </div>
                                <h3 className="text-sm font-semibold text-slate-800">No staff found</h3>
                                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                                    No accounts match your active search or filter.
                                </p>
                                <button
                                    type="button"
                                    onClick={clearFilters}
                                    className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 shadow-2xs transition-colors cursor-pointer"
                                >
                                    Clear Filters
                                </button>
                            </div>
                        ) : viewMode === "table" ? (
                            /* ── SCROLLABLE HIGH-DENSITY ENTERPRISE TABLE ── */
                            <div className="flex-1 flex flex-col min-h-0">
                                {/* Grey canvas under the white table so the list clearly ends instead of trailing into blank space */}
                                <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto bg-slate-50/70">
                                    <table className="w-full min-w-[860px] text-left border-collapse bg-white">
                                        {/* Fixed widths for the short columns; Name takes the rest, so rows read without big gaps */}
                                        <colgroup>
                                            <col />
                                            <col className="w-[190px]" />
                                            <col className="w-[140px]" />
                                            <col className="w-[200px]" />
                                            <col className="w-[150px]" />
                                        </colgroup>
                                        <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200/80">
                                            <tr className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-[0.08em]">
                                                <th className="py-2.5 px-6">Name</th>
                                                <th className="py-2.5 px-4">Role</th>
                                                <th className="py-2.5 px-4">Status</th>
                                                <th className="py-2.5 px-4">Last active</th>
                                                <th className="py-2.5 px-6 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 text-xs">
                                            {displayedUsers.map((u) => {
                                                const roleInfo = getRoleBadge(u.role);
                                                const isSelf = currentUserId === u.id || (currentUserEmail && currentUserEmail === (u.email || "").toLowerCase());
                                                const isOfficer = u.role === "Planning Officer";
                                                const isInspector = u.role === "Site Inspector";

                                                return (
                                                    <tr
                                                        key={u.id}
                                                        className={`hover:bg-blue-50/40 transition-colors ${!u.is_active ? "bg-slate-100/60" : ""
                                                            }`}
                                                    >
                                                        {/* User Column */}
                                                        <td className="py-2.5 px-6">
                                                            <div className="flex items-center gap-3">
                                                                <div
                                                                    className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs border shrink-0 ${roleInfo.avatarBg}`}
                                                                >
                                                                    {getInitials(u.name)}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="font-semibold text-slate-900 truncate">
                                                                            {u.name}
                                                                        </span>
                                                                        {isSelf && (
                                                                            <span className="inline-flex px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                                                                You
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="text-slate-400 text-[11px] truncate">
                                                                        {u.email}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>

                                                        {/* Role Column */}
                                                        <td className="py-2.5 px-4 whitespace-nowrap">
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${roleInfo.badgeClass}`}>
                                                                {roleInfo.label}
                                                            </span>
                                                        </td>

                                                        {/* Status Column */}
                                                        <td className="py-2.5 px-4 whitespace-nowrap">
                                                            {u.is_active ? (
                                                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-blue-100 bg-blue-50 text-[11px] font-semibold text-blue-700">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                                                    Active
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-slate-200 bg-slate-100 text-[11px] font-semibold text-slate-500">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                                                    Suspended
                                                                </span>
                                                            )}
                                                        </td>

                                                        {/* Last Active Column */}
                                                        <td className="py-2.5 px-4 whitespace-nowrap">
                                                            <div className="text-slate-700 text-xs">
                                                                {formatRelativeOrDate(u.last_login)}
                                                            </div>
                                                            <div className="text-slate-400 text-[10px]">
                                                                Joined {formatDateOnly(u.created_at)}
                                                            </div>
                                                        </td>

                                                        {/* Actions Column: metrics, activity logs, edit — borderless icon buttons */}
                                                        <td className="py-2.5 px-6 text-right whitespace-nowrap">
                                                            <div className="flex items-center justify-end gap-0.5">
                                                                {(isOfficer || isInspector) && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setStatsModalUser(u)}
                                                                        title="View metrics"
                                                                        aria-label={`View metrics for ${u.name}`}
                                                                        className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                                                                    >
                                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                                                                        </svg>
                                                                    </button>
                                                                )}

                                                                <button
                                                                    type="button"
                                                                    onClick={() => openLogs(u)}
                                                                    title="View activity logs"
                                                                    aria-label={`View activity logs for ${u.name}`}
                                                                    className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                                                                >
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                    </svg>
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    onClick={() => { setEditingUser({ ...u }); setAccountModalView("profile"); }}
                                                                    title="Edit account"
                                                                    aria-label={`Edit account for ${u.name}`}
                                                                    className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                                                                >
                                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H8.25A2.25 2.25 0 016 18.75V14" />
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    {/* End-of-list line */}
                                    <p className="px-6 py-3 border-t border-slate-200/80 bg-white text-[11.5px] text-slate-400">
                                        Showing {displayedUsers.length} of {summaryStats.total} {summaryStats.total === 1 ? "account" : "accounts"}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            /* ── DIRECTORY GRID VIEW ── */
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-slate-50/50 flex-1 min-h-0 overflow-y-auto content-start">
                                {displayedUsers.map((u) => {
                                    const roleInfo = getRoleBadge(u.role);
                                    const isSelf = currentUserId === u.id || (currentUserEmail && currentUserEmail === (u.email || "").toLowerCase());
                                    const isOfficer = u.role === "Planning Officer";
                                    const isInspector = u.role === "Site Inspector";

                                    return (
                                        <div
                                            key={u.id}
                                            className={`bg-white rounded-2xl border p-5 transition-all shadow-[0_30px_70px_-30px_rgba(37,99,235,.35)] hover:border-slate-300 flex flex-col justify-between ${!u.is_active ? "border-slate-300 bg-slate-50" : "border-slate-200/90"
                                                }`}
                                        >
                                            <div>
                                                <div className="flex items-center justify-between gap-2 mb-3">
                                                    <span
                                                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${roleInfo.badgeClass}`}
                                                    >
                                                        {roleInfo.label}
                                                    </span>

                                                    <div className="flex items-center gap-1.5">
                                                        {isSelf && (
                                                            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                                                You
                                                            </span>
                                                        )}
                                                        {u.is_active ? (
                                                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                                                Active
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                                                Suspended
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-start gap-3 mb-3">
                                                    <div
                                                        className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-xs border shrink-0 ${roleInfo.avatarBg}`}
                                                    >
                                                        {getInitials(u.name)}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h3 className="text-sm font-semibold text-slate-900 truncate">
                                                            {u.name}
                                                        </h3>
                                                        <p className="text-xs text-slate-400 truncate mt-0.5">
                                                            {u.email}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                                                <span className="text-[11px] text-slate-400">
                                                    {formatRelativeOrDate(u.last_login)}
                                                </span>

                                                <div className="flex items-center gap-1.5">
                                                    {(isOfficer || isInspector) && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setStatsModalUser(u)}
                                                            title="View Metrics"
                                                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 border border-slate-200/80 hover:border-blue-200 shadow-2xs transition-colors cursor-pointer"
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => openLogs(u)}
                                                        title="View Activity Logs"
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 border border-slate-200/80 hover:border-blue-200 shadow-2xs transition-colors cursor-pointer"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => { setEditingUser({ ...u }); setAccountModalView("profile"); }}
                                                        title="Edit Account"
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 border border-slate-200/80 hover:border-slate-300 shadow-2xs transition-colors cursor-pointer"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H8.25A2.25 2.25 0 016 18.75V14" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        </div>

                        {/* ── PAGINATION CONTROLS ── */}
                        {users?.last_page > 1 && (
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-3 border-t border-slate-200/80 shrink-0">
                                <p className="text-xs text-slate-500">
                                    Showing <span className="font-semibold text-slate-800">{users.from || 1}</span> to{" "}
                                    <span className="font-semibold text-slate-800">{users.to || displayedUsers.length}</span> of{" "}
                                    <span className="font-semibold text-slate-800">{users.total}</span> accounts
                                </p>

                                <div className="flex items-center gap-1">
                                    {users.links.map((link, i) => (
                                        <button
                                            key={i}
                                            disabled={!link.url || link.active}
                                            onClick={() => link.url && router.get(link.url, {}, { preserveState: true })}
                                            className={`inline-flex items-center justify-center min-w-[32px] h-8 px-2 rounded-lg text-xs font-medium border transition-all cursor-pointer ${link.active
                                                ? "bg-blue-600 border-blue-600 text-white font-semibold shadow-2xs"
                                                : !link.url
                                                    ? "opacity-30 cursor-not-allowed border-slate-200 bg-white text-slate-400"
                                                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                                                }`}
                                            dangerouslySetInnerHTML={{ __html: link.label }}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div >
        </div >

        <div className="imaps-users-scope">
        {/* ── MODAL 1: OFFICER & INSPECTOR METRICS ── */}
        {
            statsModalUser && (
                <div
                    role="dialog"
                    aria-modal="true"
                    className="fixed inset-0 z-[900] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
                >
                    <div className={`bg-white rounded-2xl w-full ${statsModalUser.role === "Planning Officer" ? "max-w-3xl" : "max-w-xl"} flex flex-col shadow-2xl border border-slate-200/80 overflow-hidden`}>
                        <div className="flex items-center justify-between gap-3 p-5 border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white shrink-0">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="relative shrink-0">
                                    <div
                                        className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs border ${getRoleBadge(statsModalUser.role).avatarBg
                                            }`}
                                    >
                                        {getInitials(statsModalUser.name)}
                                    </div>
                                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white bg-blue-600 text-white shadow-sm">
                                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                                        </svg>
                                    </div>
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h2 className="text-sm font-bold text-slate-900 tracking-tight truncate">
                                            {statsModalUser.name}
                                        </h2>
                                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-blue-200 bg-blue-50 font-semibold text-blue-700">
                                            Metrics
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                                        {statsModalUser.email}
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setStatsModalUser(null)}
                                className="shrink-0 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-5 overflow-y-auto max-h-[75vh] space-y-4 text-xs">
                            {statsModalUser.role === "Planning Officer" && (() => {
                                const st = statsModalUser.stats || {};
                                const total = statsModalUser.encoded_applications_count || 0;
                                const pct = (n) => (total ? Math.round(((n || 0) / total) * 100) : 0);
                                const fmtDate = (d) =>
                                    d ? new Date(String(d).replace(" ", "T")).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "—";
                                const totalFeesNum = parseFloat(String(st.total_fees || "0").replace(/[^0-9.]/g, "")) || 0;
                                const avgFee = total
                                    ? "₱" + (totalFeesNum / total).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                    : "—";
                                const released = st.status?.released || 0;
                                const pending = st.status?.pending || 0;
                                const denied = st.status?.denied || 0;
                                const decided = released + denied;
                                const releaseRate = decided ? Math.round((released / decided) * 100) + "%" : "—";
                                const statuses = [
                                    ["Released", released, "bg-emerald-500"],
                                    ["In Progress", pending, "bg-amber-400"],
                                    ["Denied", denied, "bg-red-500"],
                                    ["Other", Math.max(0, total - released - pending - denied), "bg-slate-300"],
                                ];
                                const types = [
                                    ["Locational Clearance", st.types?.locational],
                                    ["Development Permit", st.types?.development],
                                    ["Zoning Certificate", st.types?.zoning],
                                    ["Special Land Use", st.types?.special],
                                ];
                                const trend = st.trend || [];
                                const maxTrend = Math.max(1, ...trend.map((t) => t.count));
                                const statusBadge = (s) =>
                                    s === "Released"
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                        : s === "Denied"
                                            ? "bg-red-50 text-red-700 border-red-200"
                                            : "bg-amber-50 text-amber-700 border-amber-200";
                                const sectionTitle = "text-[11px] font-semibold text-slate-500 uppercase tracking-wider";
                                const kpis = [
                                    ["Total Encoded", total, `${st.this_month || 0} this month`],
                                    ["Total Fees", st.total_fees || "₱0.00", `Avg ${avgFee} / app`],
                                    ["Release Rate", releaseRate, `${released} of ${decided} decided`],
                                    ["Last Encoded", st.last_encoded_at ? fmtDate(st.last_encoded_at) : "None yet", `Top: ${st.top_barangay || "N/A"}`],
                                ];

                                return (
                                    <>
                                        {/* KPI strip */}
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                            {kpis.map(([label, value, sub]) => (
                                                <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100 min-w-0">
                                                    <div className="text-[10px] text-slate-400 uppercase font-semibold">{label}</div>
                                                    <div className="text-base font-bold text-slate-900 mt-1 truncate" title={String(value)}>{value}</div>
                                                    <div className="text-[10px] text-slate-500 mt-0.5 truncate" title={sub}>{sub}</div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Status distribution */}
                                        <div className="border border-slate-200/80 rounded-xl p-4">
                                            <div className={`${sectionTitle} mb-2.5`}>Status Distribution</div>
                                            <div
                                                className="flex h-2.5 rounded-full overflow-hidden bg-slate-100"
                                                role="img"
                                                aria-label={statuses.map(([l, n]) => `${l} ${n}`).join(", ")}
                                            >
                                                {statuses.map(([label, n, color]) =>
                                                    n ? <div key={label} className={color} style={{ width: `${pct(n)}%` }} title={`${label}: ${n}`} /> : null
                                                )}
                                            </div>
                                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5">
                                                {statuses.map(([label, n, color]) => (
                                                    <span key={label} className="flex items-center gap-1.5 text-slate-600">
                                                        <span className={`w-2 h-2 rounded-full ${color}`} />
                                                        {label} <span className="font-semibold text-slate-800">{n}</span>
                                                        <span className="text-slate-400">({pct(n)}%)</span>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {/* Type breakdown */}
                                            <div className="border border-slate-200/80 rounded-xl p-4">
                                                <div className={`${sectionTitle} mb-3`}>Application Types</div>
                                                <div className="space-y-2.5">
                                                    {types.map(([label, n]) => (
                                                        <div key={label}>
                                                            <div className="flex justify-between items-center gap-2">
                                                                <span className="text-slate-600 truncate">{label}</span>
                                                                <span className="font-semibold text-slate-800 shrink-0">
                                                                    {n || 0} <span className="text-[10px] font-normal text-slate-400">({pct(n)}%)</span>
                                                                </span>
                                                            </div>
                                                            <div className="h-1 rounded-full bg-slate-100 mt-1 overflow-hidden">
                                                                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct(n)}%` }} />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Trend + barangays */}
                                            <div className="border border-slate-200/80 rounded-xl p-4 flex flex-col gap-4">
                                                <div>
                                                    <div className={`${sectionTitle} mb-2.5`}>Last 6 Months</div>
                                                    <div
                                                        className="flex items-end gap-1.5 h-16"
                                                        role="img"
                                                        aria-label={`Applications encoded per month: ${trend.map((t) => `${t.label} ${t.count}`).join(", ")}`}
                                                    >
                                                        {trend.map((t) => (
                                                            <div key={t.label} className="flex-1 flex flex-col items-center justify-end h-full gap-1" title={`${t.label}: ${t.count}`}>
                                                                <span className="text-[9px] font-semibold text-slate-500">{t.count || ""}</span>
                                                                <div className="w-full rounded-t bg-blue-500/80" style={{ height: `${(t.count / maxTrend) * 100}%`, minHeight: t.count ? 3 : 1 }} />
                                                                <span className="text-[9px] text-slate-400">{t.label}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className={`${sectionTitle} mb-2`}>Top Barangays</div>
                                                    {st.top_barangays?.length ? (
                                                        <ol className="space-y-1.5">
                                                            {st.top_barangays.map((b, i) => (
                                                                <li key={b.name} className="flex justify-between gap-2">
                                                                    <span className="text-slate-600 truncate">{i + 1}. {b.name}</span>
                                                                    <span className="font-semibold text-slate-800">{b.count}</span>
                                                                </li>
                                                            ))}
                                                        </ol>
                                                    ) : (
                                                        <p className="text-slate-400">No data yet</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Recent applications */}
                                        <div className="border border-slate-200/80 rounded-xl overflow-hidden">
                                            <div className={`${sectionTitle} px-4 pt-4 pb-2.5`}>Recent Applications</div>
                                            {st.recent?.length ? (
                                                <ul className="divide-y divide-slate-100">
                                                    {st.recent.map((app) => (
                                                        <li key={app.id}>
                                                            <Link
                                                                href={`/applications/${app.id}`}
                                                                className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none transition-colors"
                                                            >
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-mono font-semibold text-blue-700 truncate">
                                                                            {app.reference_number || `#${app.id}`}
                                                                        </span>
                                                                        <span className="text-slate-400 shrink-0">· {fmtDate(app.created_at)}</span>
                                                                    </div>
                                                                    <div className="text-slate-600 truncate mt-0.5">
                                                                        {app.applicant_name || "Unnamed applicant"}
                                                                        <span className="text-slate-400"> — {app.application_type || "—"}</span>
                                                                    </div>
                                                                </div>
                                                                <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border font-semibold ${statusBadge(app.status)}`}>
                                                                    {app.status || "—"}
                                                                </span>
                                                            </Link>
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <p className="px-4 pb-4 text-slate-400">No applications encoded yet.</p>
                                            )}
                                        </div>
                                    </>
                                );
                            })()}

                            {statsModalUser.role === "Site Inspector" && (
                                <>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 text-center">
                                            <div className="text-[10px] text-slate-400 uppercase font-semibold">Total Caseload</div>
                                            <div className="text-lg font-bold text-slate-900 mt-0.5">
                                                {statsModalUser.inspector_stats?.total_caseload || 0}
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 text-center">
                                            <div className="text-[10px] text-slate-400 uppercase font-semibold">Compliance</div>
                                            <div className="text-lg font-bold text-blue-700 mt-0.5">
                                                {statsModalUser.inspector_stats?.compliance_rate || 0}%
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 text-center">
                                            <div className="text-[10px] text-slate-400 uppercase font-semibold">Checklist Acc.</div>
                                            <div className="text-lg font-bold text-blue-700 mt-0.5">
                                                {statsModalUser.inspector_stats?.checklist_accuracy || 0}%
                                            </div>
                                        </div>
                                    </div>

                                    <div className="border border-slate-200/80 rounded-xl p-4">
                                        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
                                            Inspection Status
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center py-1 border-b border-slate-100">
                                                <span className="text-slate-600">Completed Inspections</span>
                                                <span className="font-semibold text-slate-800">{statsModalUser.inspector_stats?.status?.completed || 0}</span>
                                            </div>
                                            <div className="flex justify-between items-center py-1 border-b border-slate-100">
                                                <span className="text-slate-600">In Progress</span>
                                                <span className="font-semibold text-slate-800">{statsModalUser.inspector_stats?.status?.in_progress || 0}</span>
                                            </div>
                                            <div className="flex justify-between items-center py-1">
                                                <span className="text-slate-600">Pending Assignment</span>
                                                <span className="font-semibold text-slate-800">{statsModalUser.inspector_stats?.status?.pending || 0}</span>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end shrink-0">
                            <button
                                type="button"
                                onClick={() => setStatsModalUser(null)}
                                className="px-3.5 py-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-600 cursor-pointer transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )
        }

        {/* ── MODAL 2: ACCOUNT (Edit Profile, with Reset Password as an in-modal view) ── */}
        {
            editingUser && (
                <div
                    role="dialog"
                    aria-modal="true"
                    className="fixed inset-0 z-[900] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
                >
                    <div className="bg-white rounded-2xl w-full max-w-md flex flex-col shadow-2xl border border-slate-200/80 overflow-hidden">
                        <div className="flex items-center justify-between gap-3 p-5 border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white shrink-0">
                            <div className="flex items-center gap-3 min-w-0">
                                {accountModalView === "password" && (
                                    <button
                                        type="button"
                                        onClick={backToProfileView}
                                        title="Back to Account"
                                        className="shrink-0 text-slate-400 hover:text-slate-700 p-1.5 -ml-1 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                                        </svg>
                                    </button>
                                )}
                                <div className="relative shrink-0">
                                    <div
                                        className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs border ${getRoleBadge(editingUser.role).avatarBg}`}
                                    >
                                        {getInitials(editingUser.name)}
                                    </div>
                                    <div
                                        className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white text-white shadow-sm transition-colors ${accountModalView === "password" ? "bg-rose-600" : "bg-blue-600"
                                            }`}
                                    >
                                        {accountModalView === "password" ? (
                                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                                            </svg>
                                        ) : (
                                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                                            </svg>
                                        )}
                                    </div>
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="text-sm font-bold text-slate-900 tracking-tight truncate">
                                            {accountModalView === "password" ? "Reset Password" : "Edit Account"}
                                        </h3>
                                        <span
                                            className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${accountModalView === "password"
                                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                                : "border-blue-200 bg-blue-50 text-blue-700"
                                                }`}
                                        >
                                            {accountModalView === "password" ? "Security" : editingUser.role}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-0.5 truncate">{editingUser.email}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={closeAccountModal}
                                className="shrink-0 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {accountModalView === "profile" ? (
                            <form
                                key="profile-view"
                                onSubmit={submitEditProfile}
                                className="p-5 space-y-4 animate-in fade-in slide-in-from-left-2 duration-200"
                            >
                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                                    <input
                                        type="text"
                                        value={editingUser.name}
                                        onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">Email Address</label>
                                    <input
                                        type="email"
                                        value={editingUser.email}
                                        onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Account Status</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setEditingUser({ ...editingUser, is_active: true })}
                                            className={`px-3 py-2 rounded-lg border text-xs font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors ${editingUser.is_active
                                                ? "bg-blue-50 border-blue-300 text-blue-800 font-semibold"
                                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                                }`}
                                        >
                                            <span className={`w-1.5 h-1.5 rounded-full ${editingUser.is_active ? "bg-blue-500" : "bg-slate-300"}`}></span>
                                            Active
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setEditingUser({ ...editingUser, is_active: false })}
                                            className={`px-3 py-2 rounded-lg border text-xs font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors ${!editingUser.is_active
                                                ? "bg-rose-50 border-rose-300 text-rose-800 font-semibold"
                                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                                }`}
                                        >
                                            <span className={`w-1.5 h-1.5 rounded-full ${!editingUser.is_active ? "bg-rose-500" : "bg-slate-300"}`}></span>
                                            Suspended
                                        </button>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={openPasswordView}
                                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 cursor-pointer transition-colors"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                                        </svg>
                                        Reset Password
                                    </button>

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={closeAccountModal}
                                            className="px-3.5 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600 cursor-pointer transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isSavingProfile}
                                            className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm disabled:opacity-50 cursor-pointer transition-colors"
                                        >
                                            {isSavingProfile ? "Saving…" : "Save Changes"}
                                        </button>
                                    </div>
                                </div>
                            </form>
                        ) : (
                            <form
                                key="password-view"
                                onSubmit={submitForcePasswordReset}
                                className="p-5 space-y-3 animate-in fade-in slide-in-from-right-2 duration-200"
                            >
                                {passwordResetError && (
                                    <div className="p-2 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-700">
                                        {passwordResetError}
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">New Password</label>
                                    <input
                                        type={showResetPassword ? "text" : "password"}
                                        value={newPasswordInput}
                                        onChange={(e) => setNewPasswordInput(e.target.value)}
                                        placeholder="At least 8 characters"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">Confirm Password</label>
                                    <input
                                        type={showResetPassword ? "text" : "password"}
                                        value={confirmPasswordInput}
                                        onChange={(e) => setConfirmPasswordInput(e.target.value)}
                                        placeholder="Re-type new password"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">Your Admin Password</label>
                                    <input
                                        type="password"
                                        autoComplete="current-password"
                                        value={adminPasswordInput}
                                        onChange={(e) => setAdminPasswordInput(e.target.value)}
                                        placeholder="Confirm it's you"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                                        required
                                    />
                                </div>

                                <div className="flex items-center gap-1.5 pt-1">
                                    <input
                                        id="show-pass"
                                        type="checkbox"
                                        checked={showResetPassword}
                                        onChange={(e) => setShowResetPassword(e.target.checked)}
                                        className="rounded border-slate-300 text-blue-600 text-xs"
                                    />
                                    <label htmlFor="show-pass" className="text-xs text-slate-500 cursor-pointer">
                                        Show password
                                    </label>
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-2">
                                    <button
                                        type="button"
                                        onClick={backToProfileView}
                                        className="px-3.5 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600 cursor-pointer transition-colors"
                                    >
                                        Back
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isResettingPassword}
                                        className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm disabled:opacity-50 cursor-pointer transition-colors"
                                    >
                                        {isResettingPassword ? "Updating…" : "Confirm Reset"}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )
        }

        {/* ── MODAL 4: PER-USER ACTIVITY LOGS ── */}
        {
            logsModalUser && (
                <div
                    role="dialog"
                    aria-modal="true"
                    className="fixed inset-0 z-[900] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
                >
                    <div className="bg-white rounded-2xl w-full max-w-5xl flex flex-col shadow-2xl border border-slate-200/80 overflow-hidden max-h-[70vh]">
                        <div className="flex items-center justify-between gap-3 p-5 border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white shrink-0">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="relative shrink-0">
                                    <div
                                        className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs border ${getRoleBadge(logsModalUser.role).avatarBg}`}
                                    >
                                        {getInitials(logsModalUser.name)}
                                    </div>
                                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white bg-blue-600 text-white shadow-sm">
                                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    </div>
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h2 className="text-sm font-bold text-slate-900 tracking-tight truncate">
                                            {logsModalUser.name}
                                        </h2>
                                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-blue-200 bg-blue-50 font-semibold text-blue-700">
                                            Activity Log
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                                        {logsModalUser.email}
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    setLogsModalUser(null);
                                    setUserLogs([]);
                                    setLogsError("");
                                    setExpandedLogId(null);
                                }}
                                className="shrink-0 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="overflow-x-auto overflow-y-auto flex-1">
                            {isLoadingLogs ? (
                                <div className="p-12 text-center">
                                    <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin mx-auto mb-3" />
                                    <p className="text-xs text-slate-400 font-medium">Loading activity logs…</p>
                                </div>
                            ) : logsError ? (
                                <div className="p-12 text-center">
                                    <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-500 mx-auto flex items-center justify-center mb-3">
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                        </svg>
                                    </div>
                                    <h3 className="text-sm font-semibold text-slate-800">Couldn't load logs</h3>
                                    <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">{logsError}</p>
                                </div>
                            ) : userLogs.length === 0 ? (
                                <div className="p-12 text-center">
                                    <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-3">
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <h3 className="text-sm font-semibold text-slate-800">No activity recorded</h3>
                                    <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                                        This user has no audit trail events yet.
                                    </p>
                                </div>
                            ) : (
                                <table className="w-full text-left border-collapse">
                                    <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200/80">
                                        <tr className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                                            <th className="py-2.5 px-5 w-28">Time</th>
                                            <th className="py-2.5 px-4">Event</th>
                                            <th className="py-2.5 px-4">Reference</th>
                                            <th className="py-2.5 px-4">Description</th>
                                            <th className="py-2.5 px-4 w-8"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-xs">
                                        {userLogs.map((log) => {
                                            const isExpanded = expandedLogId === log.id;
                                            return (
                                                <React.Fragment key={log.id}>
                                                    <tr
                                                        onClick={() => setExpandedLogId((prev) => (prev === log.id ? null : log.id))}
                                                        className="hover:bg-slate-50/70 transition-colors cursor-pointer select-none"
                                                    >
                                                        <td className="py-3 px-5 align-top font-mono whitespace-nowrap">
                                                            <div className="text-xs font-semibold text-slate-800">
                                                                {formatLogTime(log.performed_at) || "—"}
                                                            </div>
                                                            <div className="text-[10.5px] text-slate-400 font-medium">
                                                                {formatDateOnly(log.performed_at)}
                                                            </div>
                                                        </td>
                                                        <td className="py-3 px-4 align-top whitespace-nowrap">
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                                                {formatActionLabel(log.action)}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-4 align-top whitespace-nowrap">
                                                            {log.reference_number ? (
                                                                <Link
                                                                    href={`/applications?search=${log.reference_number}`}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="font-mono text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline"
                                                                >
                                                                    {log.reference_number}
                                                                </Link>
                                                            ) : (
                                                                <span className="text-slate-300">—</span>
                                                            )}
                                                        </td>
                                                        <td className="py-3 px-4 align-top text-slate-600 max-w-sm truncate">
                                                            {log.note || "Routine compliance event recorded with no additional remarks."}
                                                        </td>
                                                        <td className="py-3 px-4 align-top text-right">
                                                            <svg
                                                                className={`w-4 h-4 text-slate-400 inline-block transition-transform duration-200 ${isExpanded ? "rotate-180 text-blue-600" : ""}`}
                                                                fill="none"
                                                                viewBox="0 0 24 24"
                                                                stroke="currentColor"
                                                                strokeWidth="2"
                                                            >
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                                            </svg>
                                                        </td>
                                                    </tr>

                                                    {isExpanded && (
                                                        <tr>
                                                            <td colSpan={5} className="px-5 pb-4 pt-0 bg-slate-50/90 border-t border-slate-100 text-xs">
                                                                <div className="p-3 rounded-lg bg-white border border-slate-200/90 shadow-2xs space-y-2 font-mono">
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[11px]">
                                                                        <div>
                                                                            <span className="text-slate-400">Exact Timestamp: </span>
                                                                            <span className="text-slate-800 font-medium">{log.performed_at || "—"}</span>
                                                                        </div>
                                                                        <div>
                                                                            <span className="text-slate-400">Action Type: </span>
                                                                            <span className="text-slate-800 font-medium">{log.action}</span>
                                                                        </div>
                                                                        {log.applicant_name && (
                                                                            <div className="sm:col-span-2">
                                                                                <span className="text-slate-400">Applicant: </span>
                                                                                <span className="text-slate-800 font-medium">{log.applicant_name}</span>
                                                                            </div>
                                                                        )}
                                                                        <div className="sm:col-span-2">
                                                                            <span className="text-slate-400">Description: </span>
                                                                            <span className="text-slate-800 font-sans">
                                                                                {log.note || "No additional remarks."}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between shrink-0">
                            <span className="text-[11px] font-medium text-slate-400">
                                {userLogs.length} {userLogs.length === 1 ? "event" : "events"} recorded
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    setLogsModalUser(null);
                                    setUserLogs([]);
                                    setLogsError("");
                                    setExpandedLogId(null);
                                }}
                                className="px-3.5 py-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-600 cursor-pointer transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )
        }
        </div>
    </>
);
}
