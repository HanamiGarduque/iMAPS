import React, { useState, useEffect, useMemo, useRef } from "react";
import { Head, router, Link } from "@inertiajs/react";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";

// ── Status badge config for Drafts ──
const STATUS_CONFIG = {
    "Auto-saved": { bg: "bg-amber-50 text-amber-700 border-amber-200/70", dot: "bg-amber-500" },
    "Incomplete": { bg: "bg-rose-50 text-rose-700 border-rose-200/70", dot: "bg-rose-500" },
};

const STATUSES = ["Auto-saved", "Incomplete"];
const APP_TYPES = ["Locational Clearance", "Zoning Certification", "Development Permit", "Special Land Use Permit"];

const SAMPLE_DRAFTS = [
    {
        id: 201,
        temp_reference_number: "TMP-88A92F10B",
        applicant_name: "Marasigan Commercial Ventures",
        application_type: "Locational Clearance",
        barangay: "Poblacion A",
        updated_at: "2026-08-30T13:45:00Z",
        status: "Auto-saved",
    },
    {
        id: 202,
        temp_reference_number: "TMP-41BC09E83",
        applicant_name: "Rosario Solar Farm Dev.",
        application_type: "Special Land Use Permit",
        barangay: "Bulihan",
        updated_at: "2026-08-30T10:15:00Z",
        status: "Incomplete",
    },
    {
        id: 203,
        temp_reference_number: "TMP-901FE872A",
        applicant_name: "Green Horizon Agro Estate",
        application_type: "Development Permit",
        barangay: "San Jose",
        updated_at: "2026-08-29T16:20:00Z",
        status: "Auto-saved",
    },
    {
        id: 204,
        temp_reference_number: "TMP-33D72091C",
        applicant_name: "Engr. Roberto Mendoza",
        application_type: "Zoning Certification",
        barangay: "Itlugan",
        updated_at: "2026-08-28T11:05:00Z",
        status: "Auto-saved",
    },
];

function StatusBadge({ status }) {
    const cfg = STATUS_CONFIG[status] || { bg: "bg-slate-100 text-slate-700 border-slate-200", dot: "bg-slate-400" };
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.bg}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} shrink-0`} />
            {status || "Auto-saved"}
        </span>
    );
}

// ── Searchable Combobox Component (Minimizes Scrolling) ──
function SearchableSelect({
    value,
    onChange,
    options = [],
    placeholder = "Select...",
    searchPlaceholder = "Type to search...",
    allLabel = "All",
    prefix = "",
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const dropdownRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
        if (!isOpen) {
            setSearchQuery("");
        }
    }, [isOpen]);

    const filteredOptions = useMemo(() => {
        if (!searchQuery.trim()) return options;
        const q = searchQuery.toLowerCase();
        return options.filter((opt) => opt.toLowerCase().includes(q));
    }, [options, searchQuery]);

    const selectedLabel = value ? (prefix ? `${prefix} ${value}` : value) : allLabel;

    return (
        <div className="relative w-full" ref={dropdownRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full text-xs font-medium px-3 py-1.5 rounded-xl border transition-all flex items-center justify-between gap-2 shadow-xs ${
                    isOpen
                        ? "border-blue-500 ring-2 ring-blue-500/10 bg-white text-slate-900"
                        : value
                        ? "border-blue-300 bg-blue-50/50 text-blue-900 font-semibold hover:border-blue-400"
                        : "border-slate-200 bg-slate-50/50 hover:bg-white text-slate-700 hover:border-slate-300"
                }`}
            >
                <span className="truncate">{selectedLabel}</span>
                <svg
                    className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-150 ${isOpen ? "rotate-180 text-blue-600" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-white rounded-2xl shadow-xl border border-slate-200/90 p-2 min-w-[200px] max-w-sm animate-in fade-in zoom-in-95 duration-150">
                    <div className="relative mb-1.5">
                        <svg
                            className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                        </svg>
                        <input
                            ref={inputRef}
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={searchPlaceholder}
                            className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-800 placeholder:text-slate-400 font-medium"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                            >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>

                    <div className="max-h-48 overflow-y-auto space-y-0.5">
                        <button
                            type="button"
                            onClick={() => {
                                onChange("");
                                setIsOpen(false);
                            }}
                            className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg flex items-center justify-between transition-colors ${
                                !value ? "bg-blue-50 text-blue-700 font-bold" : "text-slate-700 hover:bg-slate-50 font-medium"
                            }`}
                        >
                            <span>{allLabel}</span>
                            {!value && (
                                <svg className="w-3.5 h-3.5 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                            )}
                        </button>

                        {filteredOptions.length === 0 ? (
                            <div className="py-3 text-center text-xs text-slate-400 font-medium">
                                No matching options found
                            </div>
                        ) : (
                            filteredOptions.map((opt) => {
                                const isSelected = value === opt;
                                return (
                                    <button
                                        key={opt}
                                        type="button"
                                        onClick={() => {
                                            onChange(opt);
                                            setIsOpen(false);
                                        }}
                                        className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg flex items-center justify-between transition-colors ${
                                            isSelected ? "bg-blue-50 text-blue-700 font-bold" : "text-slate-700 hover:bg-slate-50 font-medium"
                                        }`}
                                    >
                                        <span className="truncate">{prefix ? `${prefix} ${opt}` : opt}</span>
                                        {isSelected && (
                                            <svg className="w-3.5 h-3.5 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                            </svg>
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function DraftsIndex({ drafts, filters = {}, auth }) {
    const [clock, setClock] = useState("");
    const [search, setSearch] = useState(filters?.search || "");
    const [selectedCategory, setSelectedCategory] = useState(filters?.application_type || "");
    const [pageSize, setPageSize] = useState(5);
    const [currentPage, setCurrentPage] = useState(1);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const userName = auth?.user?.name || "Planning Officer";
    const userRole = auth?.user?.role || "Planning Officer";

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

    const isUsingPlaceholders = !drafts || !drafts.data || drafts.data.length === 0;

    useEffect(() => {
        const t = setTimeout(() => {
            if (!isUsingPlaceholders && search !== (filters?.search || "")) {
                router.get("/applications/drafts", { ...filters, search, application_type: selectedCategory, page: 1 }, { preserveState: true, replace: true });
            }
        }, 350);
        return () => clearTimeout(t);
    }, [search]);

    const applyFilter = (newFilters) => {
        if (!isUsingPlaceholders) {
            router.get("/applications/drafts", { ...filters, ...newFilters, application_type: selectedCategory, page: 1 }, { preserveState: true, replace: true });
        } else {
            setCurrentPage(1);
            if (newFilters.status !== undefined) filters.status = newFilters.status;
        }
    };

    const clearFilters = () => {
        setSearch("");
        setSelectedCategory("");
        filters.status = "";
        setCurrentPage(1);
        if (!isUsingPlaceholders) {
            router.get("/applications/drafts", {}, { preserveState: true, replace: true });
        }
    };

    const formatDateTime = (d) => {
        if (!d) return "—";
        const date = new Date(d);
        return `${date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })} · ${date.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}`;
    };

    const hasFilters = Boolean(search || filters?.status || selectedCategory);

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

    const handleResumeDraft = (id, e) => {
        e.stopPropagation();
        router.get(`/applications/encode?draft_id=${id}`);
    };

    const handleDiscardDraft = (id, e) => {
        e.stopPropagation();
        if (confirm("Are you sure you want to discard this draft? This action cannot be undone.")) {
            router.delete(`/applications/drafts/${id}`);
        }
    };

    const filteredList = useMemo(() => {
        let list = isUsingPlaceholders ? [...SAMPLE_DRAFTS] : [...drafts.data];

        if (filters?.status) {
            list = list.filter((item) => item.status === filters.status);
        }

        if (selectedCategory) {
            list = list.filter((item) => item.application_type === selectedCategory);
        }

        if (search) {
            const q = search.toLowerCase();
            list = list.filter((item) => {
                const matchRef = item.temp_reference_number?.toLowerCase().includes(q);
                const matchName = item.applicant_name?.toLowerCase().includes(q);
                const matchBrgy = item.barangay?.toLowerCase().includes(q);
                return matchRef || matchName || matchBrgy;
            });
        }

        return list;
    }, [drafts, isUsingPlaceholders, filters?.status, selectedCategory, search]);

    const totalPages = Math.max(1, Math.ceil(filteredList.length / pageSize));
    const paginatedRecords = useMemo(() => {
        if (!isUsingPlaceholders) return drafts.data;
        const start = (currentPage - 1) * pageSize;
        return filteredList.slice(start, start + pageSize);
    }, [filteredList, currentPage, pageSize, isUsingPlaceholders, drafts]);

    const startIndex = (currentPage - 1) * pageSize + 1;
    const endIndex = Math.min(currentPage * pageSize, filteredList.length);

    return (
        <>
            <Head title="Drafts Workspace | iMAPS" />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
                
                #dashboard-root {
                    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }
                .font-mono {
                    font-family: 'JetBrains Mono', monospace !important;
                }

                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 6px; }
                ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            `}</style>

            <div id="dashboard-root" className="bg-slate-100/60 font-sans text-slate-800 h-screen flex flex-col overflow-hidden">
                <Header 
                    userName={userName} 
                    userRole={userRole} 
                    clock={clock} 
                    onLogout={handleLogout} 
                    sidebarOpen={sidebarOpen} 
                    setSidebarOpen={setSidebarOpen} 
                />

                <div className="flex-1 overflow-hidden relative flex flex-col min-w-0">
                    <Sidebar 
                        userName={userName} 
                        userRole={userRole} 
                        sidebarOpen={sidebarOpen} 
                        setSidebarOpen={setSidebarOpen} 
                        onLogout={handleLogout} 
                        activePage="drafts" 
                    />

                    {sidebarOpen && (
                        <div
                            onClick={() => setSidebarOpen(false)}
                            className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px] z-[750] transition-opacity duration-300"
                        />
                    )}

                    <main className="flex-1 w-full h-full flex flex-col overflow-hidden">
                        <div className="p-4 sm:p-6 flex-1 flex flex-col h-full overflow-hidden max-w-[1550px] mx-auto w-full gap-4">
                            
                            {/* ── HEADER BANNER ── */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-0.5">
                                        <Link href="/applications" className="hover:text-blue-600 transition-colors">Applications</Link>
                                        <span>/</span>
                                        <span className="text-slate-600">Drafts Workspace</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                                            Application Drafts
                                        </h1>
                                        {isUsingPlaceholders && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/60">
                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                                Preview Data
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2.5">
                                    <Link
                                        href="/applications"
                                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all active:scale-98"
                                    >
                                        <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                                        </svg>
                                        <span>Back to Registry</span>
                                    </Link>

                                    {userRole === "Planning Officer" && (
                                        <Link
                                            href="/applications/encode"
                                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm shadow-blue-600/20 transition-all active:scale-98"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                            </svg>
                                            <span>New Application</span>
                                        </Link>
                                    )}
                                </div>
                            </div>

                            {/* ── FILTER & SEARCH BAR ── */}
                            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
                                {/* Status Pills */}
                                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
                                    {["", ...STATUSES].map((s) => {
                                        const isSelected = (filters?.status || "") === s;
                                        return (
                                            <button
                                                key={s || "all"}
                                                onClick={() => applyFilter({ status: s })}
                                                className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition-all shrink-0 ${
                                                    isSelected
                                                        ? "bg-slate-900 text-white shadow-xs"
                                                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                                }`}
                                            >
                                                {s || "All Drafts"}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Searchable Dropdown and Search */}
                                <div className="flex items-center gap-2.5 shrink-0 flex-1 lg:flex-none justify-end">
                                    <div className="w-48 sm:w-56">
                                        <SearchableSelect
                                            value={selectedCategory}
                                            onChange={(val) => {
                                                setSelectedCategory(val);
                                                setCurrentPage(1);
                                            }}
                                            options={APP_TYPES}
                                            allLabel="All Categories"
                                            searchPlaceholder="Search category..."
                                        />
                                    </div>

                                    <div className="relative flex-1 sm:w-64">
                                        <svg
                                            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
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
                                            placeholder="Search draft ID, applicant..."
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-8 py-1.5 text-xs font-medium text-slate-800 transition-all focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 shadow-xs placeholder:text-slate-400"
                                        />
                                        {search && (
                                            <button
                                                onClick={() => setSearch("")}
                                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>

                                    {hasFilters && (
                                        <button
                                            onClick={clearFilters}
                                            className="text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 border border-rose-200/60 px-3 py-1.5 rounded-xl flex items-center gap-1 transition-all"
                                            title="Clear active filters"
                                        >
                                            <span>Reset</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* ── DATA TABLE / EMPTY STATE ── */}
                            <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden flex flex-col min-h-0">
                                {paginatedRecords.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
                                        <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-200/60 mb-4 shadow-xs">
                                            <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                            </svg>
                                        </div>
                                        <h3 className="text-base font-bold text-slate-900">No drafts found</h3>
                                        <p className="text-xs text-slate-500 mt-1 max-w-sm">
                                            {hasFilters
                                                ? "No draft records match your active search filters."
                                                : "There are currently no unfinished drafts in progress."}
                                        </p>
                                        <div className="flex items-center gap-3 mt-5">
                                            {hasFilters && (
                                                <button
                                                    onClick={clearFilters}
                                                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all"
                                                >
                                                    Clear Filters
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 overflow-auto">
                                        <table className="w-full text-left border-collapse whitespace-nowrap">
                                            <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-10 border-b border-slate-200/80">
                                                <tr>
                                                    {["Draft Identifier", "Applicant (Partial)", "Application Type", "Barangay Location", "Last Modified", "Status", "Actions"].map((h, i) => (
                                                        <th key={i} className="px-5 py-3 text-[11px] font-semibold text-slate-500 tracking-wider">
                                                            {h}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {paginatedRecords.map((draft) => (
                                                    <tr 
                                                        key={draft.id} 
                                                        onClick={(e) => handleResumeDraft(draft.id, e)}
                                                        className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                                                    >
                                                        <td className="px-5 py-3.5">
                                                            <span className="font-mono text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-md">
                                                                {draft.temp_reference_number || `DRAFT-${draft.id}`}
                                                            </span>
                                                        </td>
                                                        <td className="px-5 py-3.5">
                                                            <div className="flex items-center gap-2.5">
                                                                <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0">
                                                                    {draft.applicant_name ? draft.applicant_name.charAt(0).toUpperCase() : "D"}
                                                                </div>
                                                                <div>
                                                                    <p className="text-xs font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                                                                        {draft.applicant_name || "Unspecified Applicant"}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-5 py-3.5">
                                                            <p className="text-xs font-medium text-slate-800">{draft.application_type || "Unspecified Category"}</p>
                                                        </td>
                                                        <td className="px-5 py-3.5">
                                                            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                                                                <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                                                                </svg>
                                                                <span>{draft.barangay ? `Brgy. ${draft.barangay}` : "—"}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-5 py-3.5 text-xs text-slate-500 font-mono">
                                                            {formatDateTime(draft.updated_at)}
                                                        </td>
                                                        <td className="px-5 py-3.5">
                                                            <StatusBadge status={draft.status || "Auto-saved"} />
                                                        </td>
                                                        <td className="px-5 py-3.5 text-right">
                                                            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                                                <button 
                                                                    type="button"
                                                                    onClick={(e) => handleResumeDraft(draft.id, e)}
                                                                    className="text-xs font-semibold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors"
                                                                >
                                                                    Resume
                                                                </button>
                                                                <button 
                                                                    type="button"
                                                                    onClick={(e) => handleDiscardDraft(draft.id, e)}
                                                                    className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded-lg transition-colors"
                                                                >
                                                                    Discard
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* ── NUMBERED PAGINATION BAR ── */}
                                <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/70 shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <p className="text-xs text-slate-500 font-medium">
                                            Showing <span className="font-semibold text-slate-800">{filteredList.length > 0 ? startIndex : 0}</span> to <span className="font-semibold text-slate-800">{endIndex}</span> of{" "}
                                            <span className="font-semibold text-slate-800">{filteredList.length}</span> drafts
                                        </p>

                                        <div className="flex items-center gap-1.5 text-xs text-slate-400 pl-3 border-l border-slate-200">
                                            <span>Show:</span>
                                            <select
                                                value={pageSize}
                                                onChange={(e) => {
                                                    setPageSize(Number(e.target.value));
                                                    setCurrentPage(1);
                                                }}
                                                className="bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-xs font-semibold text-slate-700 outline-none cursor-pointer"
                                            >
                                                <option value={5}>5</option>
                                                <option value={10}>10</option>
                                                <option value={25}>25</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            disabled={currentPage <= 1}
                                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all border ${
                                                currentPage <= 1
                                                    ? "opacity-30 cursor-not-allowed border-slate-200 bg-white text-slate-400"
                                                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:border-slate-300"
                                            }`}
                                        >
                                            Previous
                                        </button>

                                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                                            const isActive = currentPage === pageNum;
                                            return (
                                                <button
                                                    key={pageNum}
                                                    type="button"
                                                    onClick={() => setCurrentPage(pageNum)}
                                                    className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-bold transition-all border ${
                                                        isActive
                                                            ? "bg-blue-600 border-blue-600 text-white shadow-xs"
                                                            : "bg-white border-slate-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300"
                                                    }`}
                                                >
                                                    {pageNum}
                                                </button>
                                            );
                                        })}

                                        <button
                                            type="button"
                                            disabled={currentPage >= totalPages}
                                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all border ${
                                                currentPage >= totalPages
                                                    ? "opacity-30 cursor-not-allowed border-slate-200 bg-white text-slate-400"
                                                    : "border-slate-200 bg-white text-blue-600 hover:bg-blue-50 hover:border-blue-300"
                                            }`}
                                        >
                                            Next
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        </>
    );
}