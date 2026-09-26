import React, { useState, useEffect, useMemo, useRef } from "react";
import { Head, router, Link } from "@inertiajs/react";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const rosarioCenter = [13.8458, 121.2067];
const brgyStyle = { color: "#475569", weight: 1, opacity: 0.4, fillColor: "#e2e8f0", fillOpacity: 0.1, dashArray: "4" };

// ── Status badge config for Drafts ──
const STATUS_CONFIG = {
    "Auto-saved": { bg: "bg-slate-50 text-slate-600 border-slate-200", dot: "bg-slate-400" },
    "Incomplete": { bg: "bg-slate-50 text-slate-500 border-slate-200", dot: "bg-slate-300" },
};

const STATUSES = ["Auto-saved", "Incomplete"];
const APP_TYPES = ["Locational Clearance", "Zoning Certificate", "Development Permit", "Preliminary Approval and Locational Clearance (PALC)"];

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
        application_type: "Preliminary Approval and Locational Clearance (PALC)",
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
        application_type: "Zoning Certificate",
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
    const [statusFilter, setStatusFilter] = useState(filters?.status || "");
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

    const [brgyMapData, setBrgyMapData] = useState(null);
    useEffect(() => {
        fetch("/api/map/barangay_boundary")
            .then((res) => res.json())
            .then((data) => setBrgyMapData(data))
            .catch(() => {});
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
        if (newFilters.status !== undefined) setStatusFilter(newFilters.status);
        if (!isUsingPlaceholders) {
            router.get("/applications/drafts", { ...filters, ...newFilters, application_type: selectedCategory, page: 1 }, { preserveState: true, replace: true });
        } else {
            setCurrentPage(1);
        }
    };

    const clearFilters = () => {
        setSearch("");
        setSelectedCategory("");
        setStatusFilter("");
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

        if (statusFilter) {
            list = list.filter((item) => item.status === statusFilter);
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
    }, [drafts, isUsingPlaceholders, statusFilter, selectedCategory, search]);

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
                .leaflet-container { width: 100%; height: 100%; z-index: 0; }
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

                <div className="flex-1 overflow-hidden relative flex flex-col lg:flex-row min-w-0">
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
                            className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px] z-[750] transition-opacity duration-300 lg:hidden"
                        />
                    )}

                    <main className="flex-1 w-full h-full flex flex-col bg-white overflow-hidden relative">
                {/* ── HEADER (Top Bar) ── */}
                <div className="bg-slate-100/60 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-[0_4px_20px_-12px_rgba(0,0,0,0.1)] z-20">
                    <div className="flex items-center gap-4">
                        <Link href="/applications" className="flex items-center justify-center w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm" title="Back to Registry">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
                            Application Drafts
                            {isUsingPlaceholders && (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200/60 shadow-sm">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                                    Preview
                                </span>
                            )}
                        </h2>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {userRole === "Planning Officer" && (
                            <Link
                                href="/applications/encode"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 transition-all shadow-sm active:scale-95"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                </svg>
                                <span>New Draft</span>
                            </Link>
                        )}
                    </div>
                </div>

                {/* ── WORKSPACE ── */}
                <div className="flex-1 w-full h-full flex flex-col bg-slate-50 overflow-hidden relative">
                    {/* Background: Subtle Blurred Map */}
                    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none">
                        <div className="absolute inset-0 filter blur-[1.5px] opacity-40 scale-105">
                            <MapContainer 
                                center={rosarioCenter} 
                                zoom={12} 
                                zoomControl={false} 
                                scrollWheelZoom={false} 
                                dragging={false} 
                                doubleClickZoom={false} 
                                touchZoom={false}
                                attributionControl={false}
                            >
                                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                {brgyMapData && <GeoJSON data={brgyMapData} style={brgyStyle} />}
                            </MapContainer>
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-b from-slate-100/40 via-slate-50/60 to-slate-100/75" />
                    </div>

                    {/* Foreground: Centered Master Elevated Floating Modal */}
                    <div className="relative z-10 flex-1 w-full h-full flex items-center justify-center p-3 sm:p-5 lg:p-6 overflow-hidden">
                        <div className="w-full max-w-6xl h-[calc(100vh-8.5rem)] max-h-[750px] min-h-[380px] bg-white/95 backdrop-blur-md rounded-3xl border border-slate-200/90 shadow-2xl overflow-hidden flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.12)]">
                                    
                                    {/* Filters & Search Toolbar */}
                                    <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between bg-slate-50/30">
                                        
                                        {/* Premium Segmented Control */}
                                        <div className="inline-flex items-center bg-slate-100 border border-slate-200 rounded-xl p-1 shrink-0 overflow-x-auto no-scrollbar shadow-inner">
                                            {["", ...STATUSES].map((s) => {
                                                const isSelected = (statusFilter || "") === s;
                                                return (
                                                    <button
                                                        key={s || "all"}
                                                        onClick={() => applyFilter({ status: s })}
                                                        className={`text-[13px] font-semibold px-5 py-2 rounded-lg transition-all whitespace-nowrap ${
                                                            isSelected
                                                                ? "bg-white text-blue-700 shadow-sm border border-slate-200/60 ring-1 ring-black/5"
                                                                : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 border border-transparent"
                                                        }`}
                                                    >
                                                        {s || "All Drafts"}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Right Side: Dropdown & Search */}
                                        <div className="flex items-center gap-3">
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

                                            <div className="relative w-full sm:w-72">
                                                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                                </svg>
                                                <input
                                                    type="text"
                                                    value={search}
                                                    onChange={(e) => setSearch(e.target.value)}
                                                    placeholder="Search drafts, applicants..."
                                                    className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-9 py-2.5 text-xs font-semibold text-slate-800 transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm placeholder:text-slate-400 placeholder:font-medium"
                                                />
                                                {search && (
                                                    <button
                                                        onClick={() => setSearch("")}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 p-1 rounded-full transition-colors"
                                                    >
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Data Table */}
                                    {filteredList.length === 0 ? (
                                        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-slate-50/30">
                                            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center border border-slate-200 mb-4 shadow-sm ring-4 ring-slate-50">
                                                <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                                </svg>
                                            </div>
                                            <h3 className="text-sm font-bold text-slate-900">No drafts found</h3>
                                            <p className="text-xs text-slate-500 mt-1 max-w-sm">
                                                {hasFilters
                                                    ? "No records match your search filters."
                                                    : "You don't have any unfinished drafts at the moment."}
                                            </p>
                                            {hasFilters && (
                                                <button
                                                    onClick={clearFilters}
                                                    className="mt-5 px-5 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-sm transition-all"
                                                >
                                                    Clear Filters
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex-1 overflow-auto">
                                            <table className="w-full text-left border-collapse whitespace-nowrap">
                                                <thead className="sticky top-0 bg-slate-50/90 backdrop-blur-sm z-10 shadow-[0_1px_0_0_#e2e8f0]">
                                                    <tr>
                                                        {["Draft Identifier", "Applicant", "Application Type", "Barangay", "Last Modified", "Status", ""].map((h, i) => (
                                                            <th key={i} className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                                                {h}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 bg-white">
                                                    {filteredList.map((draft) => (
                                                        <tr 
                                                            key={draft.id} 
                                                            onClick={(e) => handleResumeDraft(draft.id, e)}
                                                            className="border-l-[3px] border-transparent hover:border-blue-500 hover:bg-blue-50/40 transition-all group cursor-pointer"
                                                        >
                                                            <td className="px-6 py-4.5">
                                                                <div className="flex items-center gap-2.5 text-xs font-mono font-bold text-slate-600 group-hover:text-blue-700 transition-colors">
                                                                    <div className="w-7 h-7 rounded bg-slate-50 flex items-center justify-center border border-slate-200/80 group-hover:bg-white group-hover:border-blue-200 group-hover:shadow-sm transition-all">
                                                                        <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                                                        </svg>
                                                                    </div>
                                                                    {draft.temp_reference_number || `DRAFT-${draft.id}`}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4.5">
                                                                <p className="text-[13px] font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                                                                    {draft.applicant_name || "Unspecified"}
                                                                </p>
                                                            </td>
                                                            <td className="px-6 py-4.5">
                                                                <span className="text-[13px] font-semibold text-slate-600 group-hover:text-slate-800 transition-colors">
                                                                    {draft.application_type || "Unspecified Category"}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4.5">
                                                                <span className="text-[13px] font-medium text-slate-500 group-hover:text-slate-700 transition-colors">{draft.barangay || "—"}</span>
                                                            </td>
                                                            <td className="px-6 py-4.5 text-xs font-semibold text-slate-400">
                                                                {formatDateTime(draft.updated_at)}
                                                            </td>
                                                            <td className="px-6 py-4.5">
                                                                <StatusBadge status={draft.status || "Auto-saved"} />
                                                            </td>
                                                            <td className="px-6 py-4.5 text-right">
                                                                <div className="flex items-center justify-end gap-2 transition-opacity duration-200" onClick={(e) => e.stopPropagation()}>
                                                                <button 
                                                                    type="button"
                                                                    title="Resume Draft"
                                                                    onClick={(e) => handleResumeDraft(draft.id, e)}
                                                                    className="flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-slate-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300 shadow-sm transition-all active:scale-95"
                                                                >
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                                                                    </svg>
                                                                </button>
                                                                <button 
                                                                    type="button"
                                                                    title="Discard Draft"
                                                                    onClick={(e) => handleDiscardDraft(draft.id, e)}
                                                                    className="flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-slate-200 text-rose-500 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-600 shadow-sm transition-all active:scale-95"
                                                                >
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </main>
                </div>
            </div>
        </>
    );
}