import React, { useState, useEffect } from "react";
import { Head, usePage, router } from "@inertiajs/react";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import DropdownSelect from "@/Components/DropdownSelect";
import { detailUrlFromFolder } from "@/Components/folderOrigin";
import { confirmSignOut } from "@/utils/signOut";


const ROSARIO_BARANGAYS = [
    "Alupay", "Antipolo", "Bagong Pook", "Balibago", "Bayawang", "Baybayin", "Bulihan", "Cahigam",
    "Calantas", "Colongan", "Itlugan", "Leviste", "Lumbangan", "Maalas-as", "Mabato", "Mabunga",
    "Macalamcam A", "Macalamcam B", "Malaya", "Maligaya", "Marilag", "Masaya", "Matamis", "Mavalor",
    "Mayuro", "Namuco", "Namunga", "Natu", "Nasi", "Palacpac", "Pinagsibaan", "Poblacion A",
    "Poblacion B", "Poblacion C", "Poblacion D", "Poblacion E", "Putingkahoy", "Quilib", "Salao",
    "San Carlos", "San Ignacio", "San Isidro", "San Jose", "San Roque", "Santa Cruz", "Timbugan",
    "Tiquiwan", "Tulos"
];

const SORT_OPTIONS = [
    { value: "newest", label: "Newest Filing First" },
    { value: "oldest", label: "Oldest Filing First" },
    { value: "applicant_asc", label: "Applicant Name (A-Z)" },
    { value: "applicant_desc", label: "Applicant Name (Z-A)" },
];

const DATE_PRESETS = [
    { label: "All Time", value: "all" },
    { label: "Today", value: "today" },
    { label: "This Week", value: "this_week" },
    { label: "This Month", value: "this_month" },
    { label: "Custom Range", value: "custom" },
];

const STATUS_OPTIONS = [
    { value: "Assigned", label: "Assigned" },
    { value: "in-progress", label: "In-Progress" },
    { value: "completed", label: "Completed" }
];

export default function SiteInspectionsIndex() {
    const { auth, pendingInspections = [], completedInspections = [], operations = {}, poReview = {}, counters = null, flash = {} } = usePage().props;
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [clock, setClock] = useState("");
    // The open applicant folder is read from the URL, not held only in state, so
    // a refresh or a pasted link returns the user to the folder they were in.
    // Without it the back control on a detail page has nothing to restore.
    const [selectedFolder, setSelectedFolder] = useState(() => {
        if (typeof window === "undefined") return null;
        return new URLSearchParams(window.location.search).get("folder") || null;
    });

    // Keep the open folder in the URL so a refresh or a pasted link returns to the
    // same applicant folder. `replaceState` is used so opening and closing a
    // folder does not fill the browser's back stack with folder toggles.
    useEffect(() => {
        if (typeof window === "undefined") return;
        const params = new URLSearchParams(window.location.search);
        if (selectedFolder) params.set("folder", selectedFolder);
        else params.delete("folder");
        // `from` describes how a DETAIL page was reached; it means nothing here.
        params.delete("from");
        const query = params.toString();
        window.history.replaceState({}, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
    }, [selectedFolder]);

    // New filtering state
    const [searchInput, setSearchInput] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [currentPage, setCurrentPage] = useState(1);

    const [selectedStatus, setSelectedStatus] = useState("");
    const [selectedCategory, setSelectedCategory] = useState(""); // Keeping this just in case, user snippet has it
    const [selectedLandUse, setSelectedLandUse] = useState(""); // Keeping this just in case, user snippet has it
    const [selectedBarangay, setSelectedBarangay] = useState("");
    const [selectedSort, setSelectedSort] = useState("newest");

    const [dateFilterOpen, setDateFilterOpen] = useState(false);
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [dateRangePreset, setDateRangePreset] = useState("all");
    const dateFilterRef = React.useRef(null);

    // Debounce Search
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchInput);
            setCurrentPage(1);
        }, 300);
        return () => clearTimeout(handler);
    }, [searchInput]);

    const hasActiveFilters = Boolean(
        debouncedSearch || selectedStatus || selectedCategory || selectedLandUse || selectedBarangay ||
        selectedSort !== "newest" || dateFrom || dateTo || dateRangePreset !== "all"
    );

    const clearFilters = () => {
        setSearchInput("");
        setDebouncedSearch("");
        setSelectedStatus("");
        setSelectedCategory("");
        setSelectedLandUse("");
        setSelectedBarangay("");
        setSelectedSort("newest");
        setDateFrom("");
        setDateTo("");
        setDateRangePreset("all");
        setCurrentPage(1);
    };

    const handleDatePreset = (preset) => {
        setDateRangePreset(preset);
        const today = new Date();
        const formatDateStr = (d) => d.toISOString().split("T")[0];

        switch (preset) {
            case "today":
                setDateFrom(formatDateStr(today));
                setDateTo(formatDateStr(today));
                break;
            case "this_week":
                const firstDay = new Date(today.setDate(today.getDate() - today.getDay()));
                const lastDay = new Date(today.setDate(today.getDate() - today.getDay() + 6));
                setDateFrom(formatDateStr(firstDay));
                setDateTo(formatDateStr(lastDay));
                break;
            case "this_month":
                const firstDayMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                const lastDayMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                setDateFrom(formatDateStr(firstDayMonth));
                setDateTo(formatDateStr(lastDayMonth));
                break;
            case "all":
                setDateFrom("");
                setDateTo("");
                break;
            default:
                break;
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return "";
        return new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    };

    // Close date filter when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dateFilterRef.current && !dateFilterRef.current.contains(event.target)) {
                setDateFilterOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);


    useEffect(() => {
        if (flash?.success) {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: flash.success,
                showConfirmButton: false,
                timer: 3000
            });
        }
        if (flash?.error) {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'error',
                title: flash.error,
                showConfirmButton: false,
                timer: 4000
            });
        }
    }, [flash]);

    const handleLogout = confirmSignOut;

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

        const allInspections = React.useMemo(() => {
        return [...(pendingInspections || []), ...(completedInspections || [])];
    }, [pendingInspections, completedInspections]);

    const filteredInspections = React.useMemo(() => {
        let items = allInspections;

        if (selectedStatus) {
            items = items.filter(i => String(i.status || "").toLowerCase() === selectedStatus.toLowerCase());
        }

        if (selectedBarangay) {
            items = items.filter(i => {
                const brgy = (i.zoning_application?.project_location || i.zoning_application?.barangay || i.barangay || "");
                return String(brgy).toLowerCase().includes(selectedBarangay.toLowerCase());
            });
        }

        if (debouncedSearch) {
            const q = debouncedSearch.toLowerCase();
            items = items.filter(i => {
                const app = i.zoning_application || {};
                const matchName = String(app.applicant_name || "").toLowerCase().includes(q);
                const matchCorp = String(app.corporation_name || "").toLowerCase().includes(q);
                const matchRef = String(app.reference_number || "").toLowerCase().includes(q);
                return matchName || matchCorp || matchRef;
            });
        }

        if (dateFrom) {
             items = items.filter(i => {
                 const itemDate = new Date(i.created_at).toISOString().split("T")[0];
                 return itemDate >= dateFrom;
             });
        }
        if (dateTo) {
             items = items.filter(i => {
                 const itemDate = new Date(i.created_at).toISOString().split("T")[0];
                 return itemDate <= dateTo;
             });
        }

        // Apply sorting
        items = items.sort((a, b) => {
            switch (selectedSort) {
                case "oldest":
                    return new Date(a.created_at) - new Date(b.created_at);
                case "applicant_asc":
                    const nameA = (a.zoning_application?.applicant_name || "").toLowerCase();
                    const nameB = (b.zoning_application?.applicant_name || "").toLowerCase();
                    return nameA.localeCompare(nameB);
                case "applicant_desc":
                    const descA = (a.zoning_application?.applicant_name || "").toLowerCase();
                    const descB = (b.zoning_application?.applicant_name || "").toLowerCase();
                    return descB.localeCompare(descA);
                case "newest":
                default:
                    return new Date(b.created_at) - new Date(a.created_at);
            }
        });

        return items;
    }, [allInspections, selectedStatus, selectedBarangay, debouncedSearch, dateFrom, dateTo, selectedSort]);

    const folderGroups = React.useMemo(() => {
        const groups = {};
        filteredInspections.forEach(i => {
            const app = i.zoning_application || {};
            const name = (app.corporation_name || app.applicant_name)?.trim() || 'Unknown Applicant';
            if (!groups[name]) groups[name] = [];
            groups[name].push(i);
        });
        return groups;
    }, [filteredInspections]);


    return (
        <>
            <Head title="Site Inspections | iMAPS" />

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

                #site-inspections-page-root {
                    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                }
                .font-mono {
                    font-family: 'JetBrains Mono', monospace !important;
                }

                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 6px; }
                ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            `}</style>

            <div id="site-inspections-page-root" className="bg-slate-50/75 text-slate-800 h-screen flex flex-col overflow-hidden antialiased">
                <Header
                    userName={auth?.user?.name || 'Staff Member'}
                    userRole={auth?.user?.role || 'Planning Officer'}
                    clock={clock}
                    sidebarOpen={sidebarOpen}
                    setSidebarOpen={setSidebarOpen}
                    onLogout={handleLogout}
                    activePage="Site Inspections"
                />

                <div className="flex-1 overflow-hidden relative flex flex-col min-w-0">
                    <Sidebar
                        userName={auth?.user?.name || 'Staff Member'}
                        userRole={auth?.user?.role || 'Planning Officer'}
                        sidebarOpen={sidebarOpen}
                        setSidebarOpen={setSidebarOpen}
                        onLogout={handleLogout}
                        activePage="Site Inspections"
                    />

                    {sidebarOpen && (
                        <div
                            onClick={() => setSidebarOpen(false)}
                            className="absolute inset-0 bg-slate-900/20 backdrop-blur-xs z-[750] transition-opacity duration-200"
                        />
                    )}

                    <main className="flex-1 w-full h-full flex flex-col overflow-hidden">
                        <div className="p-6 sm:p-5 flex-1 flex flex-col h-full overflow-y-auto w-full gap-3">

                            {/* ── HEADER SECTION ── */}
                            <div className="px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
                                <div>
                                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Site Inspections</h1>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Manage and review site inspections conducted from iMAPS-FieldSync.
                                        {/* PHASE 2B1: page-level counters. Each is derived ONLY from
                                            locally provable state, supplied by
                                            InspectionOperationsSummary::counters(). "Awaiting PO Review" is
                                            deliberately absent: with reviewed_site_inspection_id NULL on every
                                            existing review, "no decision yet" cannot be distinguished from
                                            "never linked", so any count would be a guess. */}
                                        {counters && (
                                            <div className="flex flex-wrap items-center gap-2 mt-2">
                                                {[["Under Inspection", counters.under_inspection, "bg-blue-50 text-blue-700"],
                                                    ["Completed", counters.completed, "bg-emerald-50 text-emerald-700"],
                                                    ["Reinspection", counters.reinspections, "bg-violet-50 text-violet-700"],
                                                    ["Delivery Issues", counters.delivery_issues, "bg-rose-50 text-rose-700"]].map(([label, value, tone]) => (
                                                    <span key={label} className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${tone}`}>
                                                        {label} {value ?? 0}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </p>
                                </div>

                                {/* PHASE 2A: the former global "Refresh Data" button is
                                    REMOVED. It posted to an unscoped bulk reverse sync
                                    (no --local-inspection-id) and its label implied a
                                    read, so one click could write every completed
                                    inspection in the namespace. Nothing on this list
                                    performs a reverse sync now. Manual support sync is
                                    scoped to a single round and lives on that round's
                                    DETAIL page, beside the record it acts on. */}
                            </div>

                            {/* ── TABS & DATA CONTAINER ── */}
                            <div className="flex-1 flex flex-col min-h-0 animate-in fade-in duration-300">
                                                                {/* ── 2. UNIFIED COMMAND & SEARCH BAR ── */}
                                <div className="bg-white p-2.5 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col gap-2 shrink-0 no-print mt-2 mb-5 z-10 relative">
                                    <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
                                        {/* Main Search Input */}
                                        <div className="relative w-full lg:w-80 shrink-0">
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
                                                value={searchInput}
                                                onChange={(e) => setSearchInput(e.target.value)}
                                                placeholder="Search ref #, applicant, purpose, OR #..."
                                                className="w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-9 pr-10 py-2 text-xs font-medium text-slate-800 transition-all focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 shadow-2xs placeholder:text-slate-400"
                                            />
                                            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                                {searchInput ? (
                                                    <button
                                                        onClick={() => { setSearchInput(""); setDebouncedSearch(""); setCurrentPage(1); }}
                                                        className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                ) : (
                                                    <span className="text-[10px] font-mono text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">/</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Right Side: Filters & Controls */}
                                        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-4">
                                            {/* Dropdown Filters */}
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 items-center">
                                            {/* Status Filter */}
                                            <div className="min-w-[125px]">
                                                <DropdownSelect
                                                    value={selectedStatus}
                                                    onChange={(val) => { setSelectedStatus(val); setCurrentPage(1); }}
                                                    options={STATUS_OPTIONS}
                                                    allLabel="All Statuses"
                                                    withSearch={false}
                                                />
                                            </div>

                                            {/* Barangay Jurisdiction (Searchable) */}
                                            <div className="min-w-[130px]">
                                                <DropdownSelect
                                                    value={selectedBarangay}
                                                    onChange={(val) => { setSelectedBarangay(val); setCurrentPage(1); }}
                                                    options={ROSARIO_BARANGAYS}
                                                    allLabel="All Barangays"
                                                    searchPlaceholder="Search 48 barangays..."
                                                    prefix="Brgy."
                                                    withSearch={true}
                                                />
                                            </div>

                                            {/* Sort Order */}
                                            <div className="min-w-[135px]">
                                                <DropdownSelect
                                                    value={selectedSort}
                                                    onChange={(val) => { setSelectedSort(val || "newest"); setCurrentPage(1); }}
                                                    options={SORT_OPTIONS}
                                                    allLabel="Sort: Newest"
                                                    withSearch={false}
                                                />
                                            </div>
                                        </div>

                                        {/* Utility Controls: Date Range, Clear */}
                                        <div className="flex items-center gap-1.5 shrink-0 self-end lg:self-auto">
                                            {/* Date Range Popover Button */}
                                            <div className="relative" ref={dateFilterRef}>
                                                <button
                                                    type="button"
                                                    onClick={() => setDateFilterOpen(!dateFilterOpen)}
                                                    className={`text-xs font-semibold px-2.5 py-2 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                                                        dateFrom || dateTo || dateRangePreset !== "all"
                                                            ? "bg-blue-50 border-blue-300 text-blue-800 font-bold"
                                                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                                    }`}
                                                    title="Filter by filing date"
                                                >
                                                    <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
                                                    </svg>
                                                    <span>{dateFrom ? `${formatDate(dateFrom)} - ${formatDate(dateTo)}` : "Date"}</span>
                                                </button>

                                                {dateFilterOpen && (
                                                    <div className="absolute right-0 mt-1.5 z-50 bg-white rounded-2xl shadow-xl border border-slate-200/90 p-3 min-w-[260px] animate-in fade-in zoom-in-95">
                                                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Filing Date Presets</p>
                                                        <div className="grid grid-cols-2 gap-1 mb-3">
                                                            {DATE_PRESETS.map((p) => (
                                                                <button
                                                                    key={p.value}
                                                                    type="button"
                                                                    onClick={() => handleDatePreset(p.value)}
                                                                    className={`text-xs px-2 py-1.5 rounded-lg text-left font-medium transition-all ${
                                                                        dateRangePreset === p.value
                                                                            ? "bg-blue-600 text-white font-bold"
                                                                            : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                                                                    }`}
                                                                >
                                                                    {p.label}
                                                                </button>
                                                            ))}
                                                        </div>

                                                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Custom Date Range</p>
                                                        <div className="space-y-2">
                                                            <div>
                                                                <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Date From</label>
                                                                <input
                                                                    type="date"
                                                                    value={dateFrom}
                                                                    onChange={(e) => { setDateFrom(e.target.value); setDateRangePreset("custom"); }}
                                                                    className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-blue-500"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Date To</label>
                                                                <input
                                                                    type="date"
                                                                    value={dateTo}
                                                                    onChange={(e) => { setDateTo(e.target.value); setDateRangePreset("custom"); }}
                                                                    className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-blue-500"
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="mt-3 pt-2 border-t border-slate-100 flex justify-between">
                                                            <button
                                                                type="button"
                                                                onClick={() => { setDateFrom(""); setDateTo(""); setDateRangePreset("all"); setDateFilterOpen(false); }}
                                                                className="text-xs text-rose-600 hover:underline font-semibold cursor-pointer"
                                                            >
                                                                Reset
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setDateFilterOpen(false)}
                                                                className="text-xs bg-slate-900 text-white px-3 py-1 rounded-lg font-bold cursor-pointer"
                                                            >
                                                                Apply
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {hasActiveFilters && (
                                                <button
                                                    onClick={clearFilters}
                                                    className="text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/60 px-2.5 py-2 rounded-xl flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                                                    title="Clear active filters"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                    <span>Reset</span>
                                                </button>
                                            )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Active Filter Pills Strip */}
                                    {hasActiveFilters && (
                                        <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-100 text-xs">
                                            <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Active:</span>
                                            {selectedStatus && (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold">
                                                    Status: {selectedStatus}
                                                    <button onClick={() => setSelectedStatus("")} className="hover:text-rose-600 font-bold ml-0.5 cursor-pointer">✕</button>
                                                </span>
                                            )}
                                            {selectedBarangay && (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium">
                                                    Brgy: {selectedBarangay}
                                                    <button onClick={() => setSelectedBarangay("")} className="hover:text-rose-600 font-bold ml-0.5 cursor-pointer">✕</button>
                                                </span>
                                            )}
                                            {(dateFrom || dateTo) && (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium">
                                                    Date: {formatDate(dateFrom)} - {formatDate(dateTo)}
                                                    <button onClick={() => { setDateFrom(""); setDateTo(""); setDateRangePreset("all"); }} className="hover:text-rose-600 font-bold ml-0.5 cursor-pointer">✕</button>
                                                </span>
                                            )}
                                            {debouncedSearch && (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium">
                                                    Query: "{debouncedSearch}"
                                                    <button onClick={() => { setSearchInput(""); setDebouncedSearch(""); }} className="hover:text-rose-600 font-bold ml-0.5 cursor-pointer">✕</button>
                                                </span>
                                            )}
                                            <button
                                                onClick={clearFilters}
                                                className="text-xs font-semibold text-rose-600 hover:text-rose-700 ml-auto transition-colors cursor-pointer"
                                            >
                                                Clear All Filters
                                            </button>
                                        </div>
                                    )}
                                </div>




                                {/* ── DATA SECTION ── */}
                                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden flex flex-col flex-1 min-h-0 relative z-0">

                                    <div className="flex-1 overflow-y-auto relative bg-slate-50/40">
                                        <div className="absolute inset-0 opacity-[0.025] bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none"></div>
                                        <div className="p-6 sm:p-8 relative z-10 h-full flex flex-col">
                                            {selectedFolder ? (
                                                <>
                                                    <div className="flex items-center gap-3 mb-8">
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedFolder(null)}
                                                            className="flex items-center justify-center w-8 h-8 bg-white border border-slate-200/80 rounded-full hover:bg-slate-50 text-slate-500 hover:text-blue-600 shadow-sm transition-all ring-1 ring-black/[0.02]"
                                                        >
                                                            <svg className="w-4 h-4 -ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                                                        </button>
                                                        <div>
                                                            <h3 className="text-[15px] font-bold text-slate-900 tracking-tight">{selectedFolder}</h3>
                                                            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-widest mt-0.5">{(folderGroups[selectedFolder] || []).length} Inspection{(folderGroups[selectedFolder] || []).length !== 1 ? 's' : ''}</p>
                                                        </div>
                                                    </div>
                                                    {/* INSPECTION ENTRIES INSIDE AN OPEN FOLDER.
                                                        These were an 8-column icon-first grid at large
                                                        viewports, which left roughly 110px of content
                                                        width beside a 72px drop-shadowed icon and forced
                                                        `line-clamp-1` onto the application reference, so
                                        APP-2026-00030 rendered as "APP-2026-…". Identity data
                                                        was also smaller and lighter than the decoration.
                                        Now a left-aligned info-card: fewer, wider columns, a
                                        proportionally smaller icon, the reference allowed to wrap,
                                        status promoted to a real badge, and the INS id given
                                        a legible size. Decorative gradients are unchanged. */}
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                        {(folderGroups[selectedFolder] || []).map((item, idx) => {
                                                            // PHASE 2B2C: server-resolved review visibility for this
                                                            // round. Read, never computed here - the browser cannot
                                                            // tell a round decision from parcel-level context.
                                                            const review = poReview?.[item.id] || null;

                                                            return (
                                                            <div
                                                                key={idx}
                                                                className="group flex items-start gap-3 p-3 rounded-xl transition-all cursor-pointer bg-white/70 hover:bg-white hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-slate-200/70 hover:border-blue-200"
                                                                onClick={() => {
                                                                    router.visit(
                                                                        detailUrlFromFolder(
                                                                            "/site-inspections",
                                                                            item.id,
                                                                            selectedFolder,
                                                                            typeof window !== "undefined" ? window.location.search : "",
                                                                        ),
                                                                    );
                                                                }}
                                                            >
                                                                <div className="relative shrink-0 text-slate-300 group-hover:text-blue-500">
                                                                    <svg width="44" height="44" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-sm transition-all duration-300">
                                                                        <path d="M22 14C22 10.6863 24.6863 8 28 8H60L82 30V86C82 89.3137 79.3137 92 76 92H28C24.6863 92 22 89.3137 22 86V14Z" fill="url(#doc-base)"/>
                                                                        <path d="M60 8V24C60 27.3137 62.6863 30 66 30H82L60 8Z" fill="url(#doc-fold)"/>
                                                                        <rect x="34" y="44" width="32" height="5" rx="2.5" fill="#CBD5E1"/>
                                                                        <rect x="34" y="58" width="20" height="5" rx="2.5" fill="#CBD5E1"/>
                                                                        <rect x="34" y="72" width="26" height="5" rx="2.5" fill="#CBD5E1"/>
                                                                        <rect x="34" y="24" width="12" height="12" rx="4" fill="#3B82F6"/>
                                                                        <defs>
                                                                            <linearGradient id="doc-base" x1="52" y1="8" x2="52" y2="92" gradientUnits="userSpaceOnUse">
                                                                                <stop stopColor="#ffffff"/>
                                                                                <stop offset="1" stopColor="#F1F5F9"/>
                                                                            </linearGradient>
                                                                            <linearGradient id="doc-fold" x1="71" y1="8" x2="71" y2="30" gradientUnits="userSpaceOnUse">
                                                                                <stop stopColor="#E0E7FF"/>
                                                                                <stop offset="1" stopColor="#93C5FD"/>
                                                                            </linearGradient>
                                                                        </defs>
                                                                    </svg>
                                                                    {item.status === 'completed' && (
                                                                        <span className="absolute -bottom-1 -right-1 bg-emerald-500 text-white p-1 rounded-full shadow-sm ring-2 ring-white">
                                                                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {/* Identity is left-aligned and allowed to wrap. The
                                                                    reference is the primary identifier, so it is
                                                                    never clamped: a truncated application
                                                                    reference is not an acceptable rendering of
                                                                    a unique key. */}
                                                                <div className="min-w-0 flex-1 flex flex-col items-start gap-1">
                                                                    <span className="text-[13px] font-bold text-slate-800 leading-snug break-words group-hover:text-blue-700 transition-colors">
                                                                        {item.display_reference || `Application #${item.zoning_application_id}`}
                                                                    </span>
                                                                    {/* PHASE 2B2B: round identity is one PARCEL's visit sequence, resolved by
                                                                        the server. A historical row whose parcel was never
                                                                        recorded carries no round_number at all and says so,
                                                                        rather than being given a fabricated "Round 1".
                                                                        Everything else about the record stays visible. */}
                                                                    <span className="text-[11px] font-semibold text-slate-600 leading-tight">
                                                                        {item.round_number
                                                                            ? `Round ${item.round_number} · ${item.round_kind || "Inspection"}`
                                                                            : item.round_kind === "Historical Inspection"
                                                                              ? `${item.round_kind} · ${item.round_note || "Parcel not recorded"}`
                                                                              : item.round_kind || "Inspection"}
                                                                    </span>
                                                                    {/* PHASE 2B1: applicant and parcel, so a group is
                                                                        identifiable without opening the application. */}
                                                                    {(operations?.[item.id]?.applicant_name || operations?.[item.id]?.parcel_label) && (
                                                                        <span className="text-[11px] text-slate-600 leading-tight break-words">
                                                                            {[operations?.[item.id]?.applicant_name, operations?.[item.id]?.parcel_label].filter(Boolean).join(" · ")}
                                                                        </span>
                                                                    )}
                                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                                        <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${item.display_status === "Completed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                                                                            {item.display_status || "Assigned"}
                                                                        </span>
                                                                        {/* Delivery is the canonical Loop 9 vocabulary, per
                                                                            round. NULL is "No Delivery Record" and is
                                                                            deliberately NOT styled or labelled as a
                                                                            failure. */}
                                                                        {operations?.[item.id]?.delivery_label && (
                                                                            <span
                                                                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                                                                    operations?.[item.id]?.delivery_is_failure
                                                                                        ? "bg-rose-50 text-rose-700"
                                                                                        : "bg-slate-100 text-slate-600"
                                                                                }`}
                                                                            >
                                                                                {operations?.[item.id]?.delivery_label}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    {/* PHASE 2B2C - Planning Officer review visibility.
                                                                        A ROUND-SPECIFIC decision appears only where
                                                                        reviewed_site_inspection_id proves this exact
                                                                        round was judged. That column is NULL on
                                                                        every existing review, so this renders nothing
                                                                        today - honest, not a gap.

                                                                        PARCEL-LEVEL context is labelled as such and
                                                                        shown only on the NEWEST round of the parcel's
                                                                        chain, so one review is never repeated across
                                                                        every historical card of the same lot - which
                                                                        would read as though it applied to all. */}
                                                                    {review?.po_decision && (
                                                                        <span className="text-[10px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded">
                                                                            PO Decision: {review.po_decision}
                                                                        </span>
                                                                    )}
                                                                    {!review?.po_decision
                                                                        && review?.is_current_round
                                                                        && review?.parcel_review && (
                                                                            <span
                                                                                className="text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded"
                                                                                title={review.parcel_review.context}
                                                                            >
                                                                                Latest Parcel Review:{" "}
                                                                                {review.parcel_review.label}
                                                                            </span>
                                                                        )}
                                                                    <div className="flex items-baseline gap-2 mt-0.5 flex-wrap">
                                                                        <span className="text-[11px] text-slate-500 font-medium">
                                                                            {(() => {
                                                                                // Locally provable dates only: when the inspection
                                                                                // came back, otherwise when it was scheduled.
                                                                                const stamp = item.submitted_at || item.completed_at || item.scheduled_date;
                                                                                return stamp
                                                                                    ? new Date(stamp).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})
                                                                                    : "—";
                                                                            })()}
                                                                        </span>
                                                                        {operations?.[item.id]?.scheduled_date && (
                                                                            <span className="text-[10px] text-slate-500">
                                                                                Sched {operations?.[item.id]?.scheduled_date}
                                                                            </span>
                                                                        )}
                                                                        {operations?.[item.id]?.inspector_name && (
                                                                            <span className="text-[10px] text-slate-500">
                                                                                {operations?.[item.id]?.inspector_name}
                                                                            </span>
                                                                        )}
                                                                        {/* The internal record id stays available as a quiet
                                                                            secondary reference, but it must remain
                                                                            legible rather than near-invisible. */}
                                                                        <span className="text-[10px] font-mono text-slate-400">INS-{item.id}</span>
                                                                    </div>
                                                                </div>
                                                                </div>
                                                        );
                                                        })}
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-6 gap-y-10 text-center">
                                                        {Object.entries(folderGroups).map(([applicant, items]) => (
                                                            <div
                                                                key={applicant}
                                                                className="group cursor-pointer flex flex-col items-center p-3 rounded-2xl transition-all hover:bg-white hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-1 border border-transparent hover:border-slate-200/60"
                                                                onClick={() => {
                                                                    setSelectedFolder(applicant);
                                                                }}
                                                                title={`View ${items.length} inspection(s) for ${applicant}`}
                                                            >
                                                                <div className="relative mb-4 transition-transform duration-300">
                                                                    <svg width="84" height="84" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-md text-blue-500 group-hover:drop-shadow-lg transition-all duration-300">
                                                                        <path d="M10 28C10 24.6863 12.6863 22 16 22H36.1716C37.7628 22 39.2889 22.6321 40.4142 23.7574L46.5858 29.9289C47.7111 31.0543 49.2372 31.6863 50.8284 31.6863H84C87.3137 31.6863 90 34.3726 90 37.6863V76C90 79.3137 87.3137 82 84 82H16C12.6863 82 10 79.3137 10 76V28Z" fill="url(#folder-back-si)"/>
                                                                        <path d="M10 40C10 36.6863 12.6863 34 16 34H84C87.3137 34 90 36.6863 90 40V76C90 79.3137 87.3137 82 84 82H16C12.6863 82 10 79.3137 10 76V40Z" fill="url(#folder-front-si)"/>
                                                                        <defs>
                                                                            <linearGradient id="folder-back-si" x1="50" y1="22" x2="50" y2="82" gradientUnits="userSpaceOnUse"><stop stopColor="#60A5FA" /><stop offset="1" stopColor="#2563EB" /></linearGradient>
                                                                            <linearGradient id="folder-front-si" x1="50" y1="34" x2="50" y2="82" gradientUnits="userSpaceOnUse"><stop stopColor="#93C5FD" /><stop offset="1" stopColor="#1D4ED8" /></linearGradient>
                                                                        </defs>
                                                                    </svg>
                                                                    <span className="absolute -bottom-1 -right-1 bg-white text-slate-700 text-[11px] font-bold px-2 py-0.5 min-w-[24px] rounded-full shadow-sm ring-1 ring-slate-900/5">
                                                                        {items.length}
                                                                    </span>
                                                                </div>
                                                                <span className="text-[12px] font-bold text-slate-700 leading-snug line-clamp-2 px-1 group-hover:text-blue-700 transition-colors">
                                                                    {applicant}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    {Object.keys(folderGroups).length === 0 && (
                                                        <div className="flex flex-col items-center justify-center h-full text-slate-400 p-10 mt-10">
                                                            <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-200/60 flex items-center justify-center mb-4">
                                                                <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                                                            </div>
                                                            <p className="font-semibold text-slate-500">No folders found</p>
                                                            <p className="text-[11px] text-slate-400 mt-1 max-w-xs text-center">There are currently no site inspections that match your criteria.</p>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
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

