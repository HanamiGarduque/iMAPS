import React, { useState, useEffect, useMemo, useRef } from "react";
import { Head, Link, usePage, router } from "@inertiajs/react";
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

// "priority" is the default and is rendered as the dropdown's all-label.
const SORT_OPTIONS = [
    { value: "newest", label: "Newest round" },
    { value: "oldest", label: "Oldest round" },
    { value: "applicant_asc", label: "Applicant (A-Z)" },
    { value: "applicant_desc", label: "Applicant (Z-A)" },
    { value: "sched_asc", label: "Scheduled (earliest)" },
    { value: "sched_desc", label: "Scheduled (latest)" },
];

const DATE_PRESETS = [
    { label: "All Time", value: "all" },
    { label: "Today", value: "today" },
    { label: "This Week", value: "this_week" },
    { label: "This Month", value: "this_month" },
    { label: "Custom Range", value: "custom" },
];

const DATE_FIELDS = [
    { value: "scheduled", label: "Scheduled" },
    { value: "completed", label: "Completed" },
];

/*
 * Folder tabs. The unit is an APPLICATION under field inspection, judged by its
 * latest round - the same unit the Registry lists. Every tab is derived ONLY
 * from server-provided facts: the locally provable display status, the
 * canonical round kind and the canonical Loop 9 delivery state. Nothing reads
 * live FieldSync progress, which iMAPS cannot see.
 */
const TABS = [
    { key: "", label: "All", d: "M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm0 5.25h.007v.008H3.75V12zm0 5.25h.007v.008H3.75v-.008z" },
    { key: "open", label: "Assigned", d: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" },
    { key: "completed", label: "Completed", d: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
    { key: "reinspection", label: "With reinspection", d: "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" },
    { key: "failed", label: "Delivery failed", d: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" },
];

// Delivery pill colour per canonical state. The text is always the server label;
// "No Delivery Record" is deliberately quiet, never styled as a failure.
const DELIVERY_TONE = {
    delivery_failed: "bg-rose-50 text-rose-700 border-rose-200",
    pending_delivery: "bg-amber-50 text-amber-700 border-amber-200",
    delivered: "bg-blue-50 text-blue-700 border-blue-200",
    no_delivery_record: "bg-slate-50 text-slate-500 border-slate-200",
};

// Local calendar day as YYYY-MM-DD. A bare date string is already a day and is
// returned as-is; parsing it through Date would shift it across time zones.
const dayOf = (value) => {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const dateOfDay = (day) => {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y, m - 1, d);
};

const formatDate = (value) => {
    const day = dayOf(value);
    if (!day) return "";
    return dateOfDay(day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// "Today", "in 3 days", "2 days ago" - plain distance from today, no judgement.
const relativeDay = (value) => {
    const day = dayOf(value);
    if (!day) return "";
    const diff = Math.round((dateOfDay(day) - dateOfDay(dayOf(new Date()))) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
    return diff > 0 ? `in ${diff} days` : `${-diff} days ago`;
};

const urlParam = (key) => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get(key));

// Folder name and applicant sort use the same identity, so A-Z matches the folders.
const applicantOf = (i) => {
    const app = i.zoning_application || {};
    return (app.corporation_name || app.applicant_name)?.trim() || "Unknown Applicant";
};
const locationOf = (i) => {
    const app = i.zoning_application || {};
    return app.project_location || app.barangay || i.barangay || "";
};
const isDone = (i) => i.display_status === "Completed";
const completedOf = (i) => i.completed_at || i.submitted_at || null;
const time = (v) => (v ? new Date(v).getTime() || 0 : 0);

// Sortable table header: faint arrows when idle, blue arrow when active (as on the Registry).
function SortHeader({ label, dir, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`group inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] cursor-pointer transition-colors ${
                dir ? "text-slate-900" : "text-slate-500 hover:text-slate-800"
            }`}
        >
            {label}
            <svg className={`w-3 h-3 ${dir ? "text-blue-600" : "text-slate-300 group-hover:text-slate-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                {dir === "asc" ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19.5v-15m0 0l-6 6m6-6l6 6" />
                ) : dir === "desc" ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0 0l6-6m-6 6l-6-6" />
                ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
                )}
            </svg>
        </button>
    );
}

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

    // Every view setting is restored from the URL, so returning from a detail
    // page (whose back link carries this query) lands on the same view.
    const [viewMode, setViewMode] = useState(() => (urlParam("view") === "folder" || urlParam("folder") ? "folder" : "list"));
    const [searchInput, setSearchInput] = useState(() => urlParam("q") || "");
    const [debouncedSearch, setDebouncedSearch] = useState(() => urlParam("q") || "");
    const [selectedTab, setSelectedTab] = useState(() => (TABS.some(t => t.key && t.key === urlParam("status")) ? urlParam("status") : ""));
    const [selectedBarangay, setSelectedBarangay] = useState(() => urlParam("brgy") || "");
    const [selectedSort, setSelectedSort] = useState(() => urlParam("sort") || "priority");
    const [dateField, setDateField] = useState(() => (urlParam("date_by") === "completed" ? "completed" : "scheduled"));
    const [dateFrom, setDateFrom] = useState(() => urlParam("date_from") || "");
    const [dateTo, setDateTo] = useState(() => urlParam("date_to") || "");
    const [dateRangePreset, setDateRangePreset] = useState(() => (urlParam("date_from") || urlParam("date_to") ? "custom" : "all"));
    const [dateFilterOpen, setDateFilterOpen] = useState(false);
    const [peekKey, setPeekKey] = useState(null);
    const dateFilterRef = useRef(null);
    const searchInputRef = useRef(null);

    // The list's own state as a query string, without the folder or origin markers.
    const listQuery = useMemo(() => {
        const params = new URLSearchParams();
        if (viewMode === "folder") params.set("view", "folder");
        if (selectedTab) params.set("status", selectedTab);
        if (debouncedSearch) params.set("q", debouncedSearch);
        if (selectedBarangay) params.set("brgy", selectedBarangay);
        if (selectedSort !== "priority") params.set("sort", selectedSort);
        if (dateFrom || dateTo) {
            params.set("date_by", dateField);
            if (dateFrom) params.set("date_from", dateFrom);
            if (dateTo) params.set("date_to", dateTo);
        }
        return params.toString();
    }, [viewMode, selectedTab, debouncedSearch, selectedBarangay, selectedSort, dateField, dateFrom, dateTo]);

    // Keep the open folder and the list state in the URL so a refresh or a pasted
    // link returns to the same view. `replaceState` is used so changing a filter
    // does not fill the browser's back stack.
    useEffect(() => {
        if (typeof window === "undefined") return;
        const params = new URLSearchParams(listQuery);
        if (selectedFolder) params.set("folder", selectedFolder);
        else params.delete("folder");
        const query = params.toString();
        window.history.replaceState(window.history.state, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
    }, [selectedFolder, listQuery]);

    // Debounce Search
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
        return () => clearTimeout(handler);
    }, [searchInput]);

    // "/" focuses search, as the hint inside the field promises. Escape closes
    // the preview panel.
    useEffect(() => {
        const onKey = (e) => {
            const tag = (e.target?.tagName || "").toLowerCase();
            const typing = tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable;
            if (e.key === "Escape" && !typing) {
                setPeekKey(null);
                return;
            }
            if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || typing) return;
            e.preventDefault();
            searchInputRef.current?.focus();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    const hasActiveFilters = Boolean(
        debouncedSearch || selectedTab || selectedBarangay || selectedSort !== "priority" || dateFrom || dateTo
    );

    const clearFilters = () => {
        setSearchInput("");
        setDebouncedSearch("");
        setSelectedTab("");
        setSelectedBarangay("");
        setSelectedSort("priority");
        setDateFrom("");
        setDateTo("");
        setDateRangePreset("all");
    };

    const handleDatePreset = (preset) => {
        setDateRangePreset(preset);
        const today = new Date();
        const y = today.getFullYear();
        const m = today.getMonth();
        const d = today.getDate();

        switch (preset) {
            case "today":
                setDateFrom(dayOf(today));
                setDateTo(dayOf(today));
                break;
            case "this_week":
                setDateFrom(dayOf(new Date(y, m, d - today.getDay())));
                setDateTo(dayOf(new Date(y, m, d - today.getDay() + 6)));
                break;
            case "this_month":
                setDateFrom(dayOf(new Date(y, m, 1)));
                setDateTo(dayOf(new Date(y, m + 1, 0)));
                break;
            case "all":
                setDateFrom("");
                setDateTo("");
                break;
            default:
                break;
        }
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

    const allInspections = useMemo(() => {
        return [...(pendingInspections || []), ...(completedInspections || [])];
    }, [pendingInspections, completedInspections]);

    const opsOf = (i) => operations?.[i.id] || {};
    const scheduledOf = (i) => opsOf(i).scheduled_date || i.scheduled_date || null;
    const hasFailed = (i) => Boolean(opsOf(i).delivery_is_failure);

    // One entry per APPLICATION, with its rounds oldest -> newest. The latest
    // round decides what the row shows; the full history lives in the preview.
    const cases = useMemo(() => {
        const groups = new Map();
        allInspections.forEach(i => {
            const key = i.zoning_application_id ? `app-${i.zoning_application_id}` : `ins-${i.id}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(i);
        });
        return [...groups.entries()].map(([key, rounds]) => {
            const ordered = [...rounds].sort((a, b) => (time(a.created_at) - time(b.created_at)) || (a.id - b.id));
            return { key, rounds: ordered, item: ordered[ordered.length - 1] };
        });
    }, [allInspections]);

    const inTab = (c, key) => {
        switch (key) {
            case "open": return !isDone(c.item);
            case "completed": return isDone(c.item);
            case "reinspection": return c.rounds.some(r => r.round_kind === "Reinspection");
            case "failed": return hasFailed(c.item);
            default: return true;
        }
    };

    // Every filter except the tab. The tabs count this set, so their numbers
    // always describe what the toolbar is currently looking at.
    const baseCases = useMemo(() => {
        let items = cases;

        if (selectedBarangay) {
            const brgy = selectedBarangay.toLowerCase();
            items = items.filter(c => String(locationOf(c.item)).toLowerCase().includes(brgy));
        }

        if (debouncedSearch) {
            const q = debouncedSearch.toLowerCase();
            items = items.filter(c => c.rounds.some(i => {
                const app = i.zoning_application || {};
                const ops = opsOf(i);
                return [
                    app.applicant_name, app.corporation_name, app.reference_number, i.display_reference,
                    `INS-${i.id}`, ops.inspector_name, ops.parcel_label,
                ].some(v => String(v || "").toLowerCase().includes(q));
            }));
        }

        if (dateFrom || dateTo) {
            items = items.filter(c => c.rounds.some(i => {
                const day = dayOf(dateField === "completed" ? completedOf(i) : scheduledOf(i));
                if (!day) return false;
                if (dateFrom && day < dateFrom) return false;
                if (dateTo && day > dateTo) return false;
                return true;
            }));
        }

        // Needs attention first: a failed latest delivery, then open
        // applications (longest waiting first), then completed (newest first).
        const rank = (c) => (hasFailed(c.item) ? 0 : isDone(c.item) ? 2 : 1);

        return [...items].sort((a, b) => {
            switch (selectedSort) {
                case "newest":
                    return time(b.item.created_at) - time(a.item.created_at);
                case "oldest":
                    return time(a.item.created_at) - time(b.item.created_at);
                case "applicant_asc":
                    return applicantOf(a.item).localeCompare(applicantOf(b.item));
                case "applicant_desc":
                    return applicantOf(b.item).localeCompare(applicantOf(a.item));
                case "sched_asc":
                    return time(scheduledOf(a.item)) - time(scheduledOf(b.item));
                case "sched_desc":
                    return time(scheduledOf(b.item)) - time(scheduledOf(a.item));
                case "priority":
                default: {
                    const r = rank(a) - rank(b);
                    if (r !== 0) return r;
                    if (rank(a) === 2) return time(completedOf(b.item) || b.item.created_at) - time(completedOf(a.item) || a.item.created_at);
                    return time(scheduledOf(a.item) || a.item.created_at) - time(scheduledOf(b.item) || b.item.created_at);
                }
            }
        });
    }, [cases, operations, selectedBarangay, debouncedSearch, dateField, dateFrom, dateTo, selectedSort]);

    const tabCounts = useMemo(() => {
        const counts = {};
        TABS.forEach(t => { counts[t.key] = baseCases.filter(c => inTab(c, t.key)).length; });
        return counts;
    }, [baseCases]);

    const filteredCases = useMemo(() => baseCases.filter(c => inTab(c, selectedTab)), [baseCases, selectedTab]);
    const filteredRounds = useMemo(() => filteredCases.flatMap(c => c.rounds), [filteredCases]);
    const peekCase = peekKey ? cases.find(c => c.key === peekKey) || null : null;

    const folderGroups = useMemo(() => {
        const groups = {};
        filteredRounds.forEach(i => {
            const name = applicantOf(i);
            if (!groups[name]) groups[name] = [];
            groups[name].push(i);
        });
        return groups;
    }, [filteredRounds]);

    const folderItems = selectedFolder ? (folderGroups[selectedFolder] || []) : [];

    // Detail links carry the list state so the detail page's back control
    // restores this exact view: `from=list` for the list, the folder origin for
    // a folder.
    const listDetailUrl = (item) => {
        const params = new URLSearchParams(listQuery);
        params.set("from", "list");
        return `/site-inspections/${item.id}?${params.toString()}`;
    };
    const folderDetailUrl = (item) => detailUrlFromFolder("/site-inspections", item.id, selectedFolder, listQuery);

    // Wide screens preview the application beside the table, as the Registry
    // does. Without room for the panel, a row opens the latest round directly.
    const openCase = (c) => {
        if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
            setPeekKey(c.key);
        } else {
            router.visit(listDetailUrl(c.item));
        }
    };

    const switchView = (mode) => {
        setViewMode(mode);
        if (mode === "list") setSelectedFolder(null);
        else setPeekKey(null);
    };

    const toggleSort = (field) => {
        const asc = `${field}_asc`;
        setSelectedSort(current => (current === asc ? `${field}_desc` : asc));
    };
    const sortDir = (field) => (selectedSort === `${field}_asc` ? "asc" : selectedSort === `${field}_desc` ? "desc" : null);

    const emptyState = (title) => (
        <div className="flex flex-col items-center justify-center text-slate-400 py-16">
            <p className="font-bold text-[14px] text-slate-700">{title}</p>
            {hasActiveFilters ? (
                <>
                    <p className="text-xs mt-1 text-slate-400">Try clearing active filters or adjusting your search term</p>
                    <button
                        type="button"
                        onClick={clearFilters}
                        className="mt-3 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 cursor-pointer"
                    >
                        Clear All Filters
                    </button>
                </>
            ) : (
                <p className="text-xs mt-1 text-slate-400">Applications sent for field inspection will appear here.</p>
            )}
        </div>
    );

    const statusBadge = (item) => (
        <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium ${item.display_status === "Completed" ? "text-emerald-700" : "text-amber-700"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${item.display_status === "Completed" ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden="true" />
            {item.display_status || "Assigned"}
        </span>
    );

    const deliveryPill = (ops) => ops.delivery_label && (
        <span className={`inline-block text-[11px] font-medium px-1.5 py-px rounded border ${DELIVERY_TONE[ops.delivery_state] || DELIVERY_TONE.no_delivery_record}`}>
            {ops.delivery_label}
        </span>
    );

    const reviewBadges = (review) => (
        <>
            {review?.po_decision && (
                <span className="inline-block text-[10.5px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded">
                    PO Decision: {review.po_decision}
                </span>
            )}
            {!review?.po_decision
                && review?.is_current_round
                && review?.parcel_review && (
                    <span
                        className="inline-block text-[10.5px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded"
                        title={review.parcel_review.context}
                    >
                        Latest Parcel Review:{" "}
                        {review.parcel_review.label}
                    </span>
                )}
        </>
    );

    return (
        <>
            <Head title="Inspections | iMAPS" />

            <style>{`

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

            <div id="site-inspections-page-root" className="bg-slate-50 text-slate-800 h-screen flex flex-col overflow-hidden">
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
                            className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px] z-[750] transition-opacity duration-300"
                        />
                    )}

                    <main className="flex-1 w-full h-full flex flex-col overflow-hidden">
                        <div className="p-4 sm:p-6 flex-1 flex flex-col h-full overflow-hidden max-w-[1580px] mx-auto w-full gap-5">

                            {/* —— MASTER WORKSPACE ROW (TABLE CARD + QUICK PREVIEW PANEL) —— */}
                            <div className="flex-1 flex gap-4 min-h-0">

                            {/* —— UNIFIED MASTER WORKSPACE CARD —— */}
                            <div className="flex-1 min-w-0 bg-white rounded-xl border border-slate-200 flex flex-col min-h-0 overflow-hidden">

                                {/* —— TITLE + FOLDER TABS —— */}
                                <div className="bg-slate-100/80 border-b border-slate-200 shrink-0">
                                    <div className="px-5 pt-3 flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                                        <div className="flex items-baseline gap-2.5 min-w-0">
                                            <h1 className="text-[16px] font-bold text-slate-900 tracking-tight">Inspections</h1>
                                            <p className="text-[12px] text-slate-500 truncate">Applications sent for field inspection through iMAPS-FieldSync</p>
                                        </div>
                                        {/* PHASE 2B1: server totals for every round on record, from
                                            InspectionOperationsSummary::counters(). The tabs count
                                            applications; these count rounds, and stay fixed while
                                            the filters change. "Awaiting PO Review" is deliberately
                                            absent: with reviewed_site_inspection_id NULL on every
                                            existing review, "no decision yet" cannot be
                                            distinguished from "never linked". */}
                                        {counters && (
                                            <p className="ml-auto text-[12px] text-slate-500 whitespace-nowrap">
                                                <span className="font-semibold text-slate-700 tabular-nums">{counters.total ?? allInspections.length}</span> rounds on record
                                                <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                                                <span className="font-semibold text-slate-700 tabular-nums">{counters.reinspections ?? 0}</span> reinspections
                                            </p>
                                        )}
                                        {/* PHASE 2A: the former global "Refresh Data" button is
                                            REMOVED. It posted to an unscoped bulk reverse sync
                                            (no --local-inspection-id) and its label implied a
                                            read, so one click could write every completed
                                            inspection in the namespace. Nothing on this list
                                            performs a reverse sync now. Manual support sync is
                                            scoped to a single round and lives on that round's
                                            DETAIL page, beside the record it acts on. */}
                                    </div>
                                    <div className="flex items-end gap-3 px-4 pt-2.5 overflow-x-auto">
                                        <div className="flex items-end gap-1" role="group" aria-label="Filter by status">
                                            {TABS.map((tab) => {
                                                const isActive = selectedTab === tab.key;
                                                const count = tabCounts[tab.key] ?? 0;
                                                const alert = tab.key === "failed" && count > 0;
                                                return (
                                                    <button
                                                        key={tab.label}
                                                        type="button"
                                                        aria-pressed={isActive}
                                                        onClick={() => setSelectedTab(tab.key)}
                                                        className={`relative -mb-px flex items-center gap-2 px-4 py-2.5 rounded-t-xl border text-[12.5px] font-semibold whitespace-nowrap transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                                            isActive
                                                                ? `bg-white border-slate-200 border-b-white ${alert ? "text-rose-700" : "text-blue-700"}`
                                                                : `bg-slate-50 border-slate-200/70 hover:bg-white/70 ${alert ? "text-rose-600 hover:text-rose-700" : "text-slate-500 hover:text-slate-800"}`
                                                        }`}
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d={tab.d} />
                                                        </svg>
                                                        {tab.label}
                                                        <span className={`text-[10.5px] font-bold tabular-nums px-1.5 py-px rounded-full ${
                                                            alert
                                                                ? isActive ? "bg-rose-600 text-white" : "bg-rose-100 text-rose-700"
                                                                : isActive ? "bg-blue-700 text-white" : "bg-slate-200 text-slate-600"
                                                        }`}>
                                                            {count}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* —— FILTER TOOLBAR —— */}
                                <div className="px-4 py-3 flex flex-wrap items-center gap-2 shrink-0">
                                    <div className="relative w-full sm:w-72 shrink-0">
                                        <svg
                                            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            aria-hidden="true"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                        </svg>
                                        <input
                                            ref={searchInputRef}
                                            type="text"
                                            value={searchInput}
                                            onChange={(e) => setSearchInput(e.target.value)}
                                            placeholder="Search applicant, reference, inspector…"
                                            aria-label="Search inspections"
                                            className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50/60 pl-9 pr-8 text-[13px] text-slate-800 transition-colors focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 placeholder:text-slate-400"
                                        />
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                                            {searchInput ? (
                                                <button
                                                    type="button"
                                                    onClick={() => { setSearchInput(""); setDebouncedSearch(""); }}
                                                    aria-label="Clear search"
                                                    className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            ) : (
                                                <kbd className="text-[10px] font-mono text-slate-400 bg-white border border-slate-200 px-1.5 rounded">/</kbd>
                                            )}
                                        </div>
                                    </div>

                                    {/* DropdownSelect is w-full by design; the wrapper sets its width. */}
                                    <div className="w-44">
                                        <DropdownSelect
                                            value={selectedBarangay}
                                            onChange={(val) => setSelectedBarangay(val)}
                                            options={ROSARIO_BARANGAYS}
                                            allLabel="All barangays"
                                            searchPlaceholder="Search 48 barangays..."
                                            withSearch={true}
                                        />
                                    </div>

                                    {/* Date Range Popover Button */}
                                    <div className="relative" ref={dateFilterRef}>
                                        <button
                                            type="button"
                                            onClick={() => setDateFilterOpen(!dateFilterOpen)}
                                            aria-expanded={dateFilterOpen}
                                            className={`h-9 px-3 rounded-lg border text-[13px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                                                dateFrom || dateTo
                                                    ? "border-blue-200 bg-blue-50 text-blue-800"
                                                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                                            }`}
                                        >
                                            <svg className="w-4 h-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                                            </svg>
                                            {dateFrom || dateTo
                                                ? `${dateField === "completed" ? "Completed" : "Scheduled"} ${formatDate(dateFrom) || "…"} – ${formatDate(dateTo) || "…"}`
                                                : "Inspection date"}
                                        </button>

                                        {dateFilterOpen && (
                                            <div className="absolute left-0 mt-1 z-50 bg-white rounded-xl shadow-lg border border-slate-200/90 p-3 w-[272px] animate-in fade-in zoom-in-95">
                                                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Filter by</p>
                                                <div className="grid grid-cols-2 gap-0.5 p-0.5 mb-3 rounded-lg bg-slate-100" role="group" aria-label="Date to filter by">
                                                    {DATE_FIELDS.map((f) => (
                                                        <button
                                                            key={f.value}
                                                            type="button"
                                                            aria-pressed={dateField === f.value}
                                                            onClick={() => setDateField(f.value)}
                                                            className={`h-7 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                                                                dateField === f.value ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                                                            }`}
                                                        >
                                                            {f.label}
                                                        </button>
                                                    ))}
                                                </div>

                                                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Presets</p>
                                                <div className="grid grid-cols-2 gap-1 mb-3">
                                                    {DATE_PRESETS.map((p) => (
                                                        <button
                                                            key={p.value}
                                                            type="button"
                                                            onClick={() => handleDatePreset(p.value)}
                                                            className={`text-xs px-2 py-1.5 rounded-md text-left font-medium transition-all cursor-pointer ${
                                                                dateRangePreset === p.value
                                                                    ? "bg-blue-600 text-white font-semibold"
                                                                    : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                                                            }`}
                                                        >
                                                            {p.label}
                                                        </button>
                                                    ))}
                                                </div>

                                                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Custom Range</p>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <label htmlFor="inspections-date-from" className="text-[10px] font-semibold text-slate-500 block mb-0.5">From</label>
                                                        <input
                                                            id="inspections-date-from"
                                                            type="date"
                                                            value={dateFrom}
                                                            max={dateTo || undefined}
                                                            onChange={(e) => { setDateFrom(e.target.value); setDateRangePreset("custom"); }}
                                                            className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-md outline-none focus:bg-white focus:border-blue-500"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label htmlFor="inspections-date-to" className="text-[10px] font-semibold text-slate-500 block mb-0.5">To</label>
                                                        <input
                                                            id="inspections-date-to"
                                                            type="date"
                                                            value={dateTo}
                                                            min={dateFrom || undefined}
                                                            onChange={(e) => { setDateTo(e.target.value); setDateRangePreset("custom"); }}
                                                            className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-md outline-none focus:bg-white focus:border-blue-500"
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
                                                        className="text-xs bg-slate-900 text-white px-3 py-1 rounded-md font-semibold cursor-pointer"
                                                    >
                                                        Done
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {hasActiveFilters && (
                                        <button
                                            type="button"
                                            onClick={clearFilters}
                                            className="h-9 px-2 text-[13px] font-medium text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                                        >
                                            Reset
                                        </button>
                                    )}

                                    {/* Sort + View switcher */}
                                    <div className="flex items-center gap-2 ml-auto">
                                        <div className="w-48">
                                            <DropdownSelect
                                                value={selectedSort === "priority" ? "" : selectedSort}
                                                onChange={(val) => setSelectedSort(val || "priority")}
                                                options={SORT_OPTIONS}
                                                allLabel="Needs attention first"
                                            />
                                        </div>
                                        <div className="shrink-0 border border-slate-200 p-0.5 rounded-lg flex items-center" role="group" aria-label="View mode">
                                            {[
                                                { mode: "list", label: "List view", d: "M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" },
                                                { mode: "folder", label: "Folder view", d: "M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" },
                                            ].map((v) => (
                                                <button
                                                    key={v.mode}
                                                    type="button"
                                                    onClick={() => switchView(v.mode)}
                                                    aria-label={v.label}
                                                    aria-pressed={viewMode === v.mode}
                                                    title={v.label}
                                                    className={`w-8 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
                                                        viewMode === v.mode ? "bg-slate-100 text-slate-900" : "text-slate-400 hover:text-slate-700"
                                                    }`}
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d={v.d} />
                                                    </svg>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                            {/* —— DATA VIEW (LIST / FOLDERS) —— */}
                            {viewMode === "list" ? (
                                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                                    <div className="flex-1 overflow-auto">
                                        <table className="tabular-nums w-full text-left border-separate border-spacing-0 min-w-[900px] text-[13px] table-fixed">
                                            <thead className="sticky top-0 z-10 bg-slate-100">
                                                <tr className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 [&>th]:border-y [&>th]:border-slate-200 [&>th]:py-2.5 [&>th]:px-3 [&>th]:whitespace-nowrap [&>th]:font-semibold">
                                                    <th className="w-[160px] !pl-5">Reference no.</th>
                                                    <th aria-sort={sortDir("applicant") === "asc" ? "ascending" : sortDir("applicant") === "desc" ? "descending" : "none"}>
                                                        <SortHeader label="Applicant" dir={sortDir("applicant")} onClick={() => toggleSort("applicant")} />
                                                    </th>
                                                    <th className="w-[190px]">Round</th>
                                                    <th className="w-[200px]">Inspector</th>
                                                    <th className="w-[130px]" aria-sort={sortDir("sched") === "asc" ? "ascending" : sortDir("sched") === "desc" ? "descending" : "none"}>
                                                        <SortHeader label="Scheduled" dir={sortDir("sched")} onClick={() => toggleSort("sched")} />
                                                    </th>
                                                    <th className="w-[160px] !pr-5">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredCases.map((c) => {
                                                    const item = c.item;
                                                    const ops = opsOf(item);
                                                    const isSelected = peekKey === c.key;
                                                    const failed = hasFailed(item);
                                                    const scheduled = scheduledOf(item);
                                                    // PHASE 2B2B: a parcel-unknown row is never given a number.
                                                    const roundShort = item.round_number
                                                        ? `Round ${item.round_number}${item.round_kind === "Reinspection" ? " · Reinspection" : ""}`
                                                        : "Historical";
                                                    const roundTitle = item.round_number
                                                        ? `Round ${item.round_number} · ${item.round_kind || "Inspection"}`
                                                        : `${item.round_kind || "Historical Inspection"} · ${item.round_note || "Parcel not recorded"}`;

                                                    return (
                                                        <tr
                                                            key={c.key}
                                                            tabIndex={0}
                                                            onClick={() => openCase(c)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Enter" || e.key === " ") {
                                                                    e.preventDefault();
                                                                    openCase(c);
                                                                }
                                                            }}
                                                            aria-selected={isSelected}
                                                            className={`cursor-pointer transition-colors align-middle focus:outline-none focus-visible:bg-blue-50/60 [&>td]:border-b [&>td]:border-slate-100 [&>td]:py-2.5 [&>td]:px-3 ${
                                                                isSelected ? "bg-blue-50/60" : "bg-white hover:bg-slate-50/80"
                                                            }`}
                                                        >
                                                            <td className={`!pl-5 ${isSelected ? "shadow-[inset_3px_0_0_#2563eb]" : failed ? "shadow-[inset_3px_0_0_#e11d48]" : ""}`}>
                                                                {/* The reference is never clamped - it is a unique key. */}
                                                                <span className="block text-[12px] font-medium text-slate-500 tracking-wide break-words">
                                                                    {item.display_reference || `Application #${item.zoning_application_id}`}
                                                                </span>
                                                            </td>

                                                            <td>
                                                                <p className="font-medium text-slate-900 truncate" title={applicantOf(item)}>{applicantOf(item)}</p>
                                                            </td>

                                                            {/* Short form only; the canonical round label, parcel
                                                                and INS id are in the preview panel. */}
                                                            <td>
                                                                <p className={`truncate ${roundShort === "Historical" ? "text-slate-400" : "text-slate-700"}`} title={roundTitle}>
                                                                    {roundShort}
                                                                </p>
                                                            </td>

                                                            <td>
                                                                {ops.inspector_name ? (
                                                                    <p className="text-slate-700 truncate" title={ops.inspector_name}>{ops.inspector_name}</p>
                                                                ) : <span className="text-slate-300">—</span>}
                                                            </td>

                                                            <td className="whitespace-nowrap">
                                                                {scheduled ? (
                                                                    <span className="text-slate-600" title={relativeDay(scheduled)}>{formatDate(scheduled)}</span>
                                                                ) : <span className="text-slate-300">—</span>}
                                                            </td>

                                                            <td className="!pr-5">
                                                                {statusBadge(item)}
                                                                {/* Only a delivery problem is surfaced in the row;
                                                                    the full delivery state lives in the preview. */}
                                                                {failed && (
                                                                    <p className="mt-0.5 text-[11px] font-medium text-red-700">{ops.delivery_label}</p>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>

                                        {filteredCases.length === 0 ? (
                                            emptyState(allInspections.length ? "No inspections match your filter" : "No inspections yet")
                                        ) : (
                                            <div className="py-4 flex items-center justify-center gap-3 text-[12px] text-slate-400" aria-live="polite">
                                                <span className="h-px w-10 bg-slate-200" aria-hidden="true" />
                                                {filteredCases.length === cases.length
                                                    ? `All ${cases.length} ${cases.length === 1 ? "application" : "applications"} shown`
                                                    : `${filteredCases.length} of ${cases.length} applications shown`}
                                                {" · "}{filteredRounds.length} {filteredRounds.length === 1 ? "round" : "rounds"}
                                                <span className="h-px w-10 bg-slate-200" aria-hidden="true" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                /* —— FOLDER ARCHIVE VIEW —— */
                                <div className="flex-1 overflow-y-auto p-6 relative border-t border-slate-200">
                                    {selectedFolder ? (
                                        <>
                                            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedFolder(null)}
                                                    className="flex items-center justify-center w-8 h-8 bg-white border border-slate-200/90 rounded-lg hover:bg-slate-50 text-slate-600 hover:text-blue-700 shadow-2xs transition-all cursor-pointer"
                                                    title="Back to applicants"
                                                    aria-label="Back to applicants"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                                                </button>
                                                <div className="flex flex-col min-w-0">
                                                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                                                        <button
                                                            type="button"
                                                            className="hover:text-blue-600 cursor-pointer transition-colors"
                                                            onClick={() => setSelectedFolder(null)}
                                                        >
                                                            Applicants
                                                        </button>
                                                        <span className="text-slate-300">/</span>
                                                        <span className="text-slate-700 font-semibold truncate">{selectedFolder}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-0.5 min-w-0">
                                                        <h2 className="text-base font-bold text-slate-900 tracking-tight truncate">{selectedFolder}</h2>
                                                        <span className="shrink-0 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200/60 font-mono text-[11px] font-bold">
                                                            {folderItems.length} Inspection{folderItems.length !== 1 ? 's' : ''}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {folderItems.length > 0 ? (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                    {folderItems.map((item, idx) => {
                                                        // PHASE 2B2C: server-resolved review visibility for this
                                                        // round. Read, never computed here - the browser cannot
                                                        // tell a round decision from parcel-level context.
                                                        const review = poReview?.[item.id] || null;
                                                        // Locally provable dates only: when the inspection came
                                                        // back, otherwise when it was scheduled.
                                                        const stamp = item.submitted_at || item.completed_at || item.scheduled_date;

                                                        return (
                                                            <Link
                                                                key={item.id ?? idx}
                                                                href={folderDetailUrl(item)}
                                                                className="group flex flex-col gap-2 p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                                            >
                                                                {/* Identity row. The reference is the primary
                                                                    identifier, so it is never clamped. */}
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="min-w-0">
                                                                        <span className="block text-[13.5px] font-semibold text-slate-900 leading-snug break-words group-hover:text-blue-700 transition-colors">
                                                                            {item.display_reference || `Application #${item.zoning_application_id}`}
                                                                        </span>
                                                                        <span className="font-mono text-[10.5px] text-slate-400">INS-{item.id}</span>
                                                                    </div>
                                                                    <span className="shrink-0">
                                                                        {statusBadge(item)}
                                                                        {item.status === 'completed' && <span className="sr-only">, report received</span>}
                                                                    </span>
                                                                </div>

                                                                <div>
                                                                    <p className="text-[12.5px] font-medium text-slate-700 leading-snug">
                                                                        {item.round_number
                                                                            ? `Round ${item.round_number} · ${item.round_kind || "Inspection"}`
                                                                            : item.round_kind === "Historical Inspection"
                                                                              ? `${item.round_kind} · ${item.round_note || "Parcel not recorded"}`
                                                                              : item.round_kind || "Inspection"}
                                                                    </p>
                                                                    {/* PHASE 2B1: applicant and parcel, so a record is
                                                                        identifiable without opening the application. */}
                                                                    {(operations?.[item.id]?.applicant_name || operations?.[item.id]?.parcel_label) && (
                                                                        <p className="text-[11.5px] text-slate-500 leading-snug break-words">
                                                                            {[operations?.[item.id]?.applicant_name, operations?.[item.id]?.parcel_label].filter(Boolean).join(" · ")}
                                                                        </p>
                                                                    )}
                                                                </div>

                                                                {/* Delivery is the canonical Loop 9 vocabulary, per
                                                                    round; NULL is not a failure. PARCEL-LEVEL review
                                                                    context shows only on the NEWEST round of the
                                                                    parcel's chain. */}
                                                                {(operations?.[item.id]?.delivery_label || review?.po_decision || (review?.is_current_round && review?.parcel_review)) && (
                                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                                        {operations?.[item.id]?.delivery_label && (
                                                                            <span
                                                                                className={`text-[10.5px] font-semibold px-1.5 py-0.5 rounded ${
                                                                                    operations?.[item.id]?.delivery_is_failure
                                                                                        ? "bg-rose-50 text-rose-700"
                                                                                        : "bg-slate-100 text-slate-600"
                                                                                }`}
                                                                            >
                                                                                {operations?.[item.id]?.delivery_label}
                                                                            </span>
                                                                        )}
                                                                        {reviewBadges(review)}
                                                                    </div>
                                                                )}

                                                                <div className="mt-auto flex items-center gap-x-2 flex-wrap pt-2 border-t border-slate-100 text-[11.5px] text-slate-500">
                                                                    <span>{formatDate(stamp) || "No date"}</span>
                                                                    {operations?.[item.id]?.inspector_name && (
                                                                        <>
                                                                            <span className="text-slate-300" aria-hidden="true">·</span>
                                                                            <span className="truncate">{operations?.[item.id]?.inspector_name}</span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </Link>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                emptyState("No inspections match your filter")
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-200/60">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                                                        </svg>
                                                    </div>
                                                    <h2 className="text-sm font-bold text-slate-800 tracking-tight">Applicant Folders</h2>
                                                </div>
                                                <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200/60 font-mono text-xs font-bold">
                                                    {Object.keys(folderGroups).length} Applicant{Object.keys(folderGroups).length !== 1 ? 's' : ''}
                                                </span>
                                            </div>
                                            {Object.keys(folderGroups).length > 0 ? (
                                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-6 gap-y-8 text-center">
                                                    {Object.entries(folderGroups)
                                                        .sort(([a], [b]) => a.localeCompare(b))
                                                        .map(([applicant, items]) => {
                                                            const failedCount = items.filter(hasFailed).length;
                                                            return (
                                                                <button
                                                                    key={applicant}
                                                                    type="button"
                                                                    className="group cursor-pointer flex flex-col items-center p-2 rounded-xl hover:bg-blue-50/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                                                    onClick={() => setSelectedFolder(applicant)}
                                                                    title={`View ${items.length} inspection(s) for ${applicant}${failedCount ? ` · ${failedCount} delivery failed` : ""}`}
                                                                >
                                                                    <div className="relative mb-3 transition-transform duration-200 group-hover:scale-105 group-hover:-translate-y-1">
                                                                        <svg width="76" height="76" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-sm" aria-hidden="true">
                                                                            <path d="M10 28C10 24.6863 12.6863 22 16 22H36.1716C37.7628 22 39.2889 22.6321 40.4142 23.7574L46.5858 29.9289C47.7111 31.0543 49.2372 31.6863 50.8284 31.6863H84C87.3137 31.6863 90 34.3726 90 37.6863V76C90 79.3137 87.3137 82 84 82H16C12.6863 82 10 79.3137 10 76V28Z" fill="url(#folder-back-si)"/>
                                                                            <path d="M26 14C26 12.8954 26.8954 12 28 12H58L72 26V48C72 49.1046 71.1046 50 70 50H28C26.8954 50 26 49.1046 26 48V14Z" fill="white" />
                                                                            <path d="M72 26H60C58.8954 26 58 25.1046 58 24V12L72 26Z" fill="#E2E8F0" />
                                                                            <rect x="34" y="22" width="18" height="3" rx="1.5" fill="#CBD5E1" />
                                                                            <rect x="34" y="28" width="24" height="3" rx="1.5" fill="#CBD5E1" />
                                                                            <rect x="34" y="34" width="20" height="3" rx="1.5" fill="#CBD5E1" />
                                                                            <path d="M10 40C10 36.6863 12.6863 34 16 34H84C87.3137 34 90 36.6863 90 40V76C90 79.3137 87.3137 82 84 82H16C12.6863 82 10 79.3137 10 76V40Z" fill="url(#folder-front-si)"/>
                                                                            <defs>
                                                                                <linearGradient id="folder-back-si" x1="50" y1="22" x2="50" y2="82" gradientUnits="userSpaceOnUse"><stop stopColor="#F59E0B" /><stop offset="1" stopColor="#D97706" /></linearGradient>
                                                                                <linearGradient id="folder-front-si" x1="50" y1="34" x2="50" y2="82" gradientUnits="userSpaceOnUse"><stop stopColor="#FCD34D" /><stop offset="1" stopColor="#F59E0B" /></linearGradient>
                                                                            </defs>
                                                                        </svg>
                                                                        <span className="absolute -bottom-1 -right-1 bg-white text-slate-800 text-[10px] font-black px-1.5 py-0.5 min-w-[20px] rounded-full shadow-sm border border-slate-200">
                                                                            {items.length}
                                                                        </span>
                                                                        {failedCount > 0 && (
                                                                            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-rose-500 ring-2 ring-white" aria-hidden="true" />
                                                                        )}
                                                                    </div>
                                                                    <span className="text-[11px] font-bold text-slate-700 leading-snug line-clamp-2 px-1 group-hover:text-blue-700">
                                                                        {applicant}
                                                                    </span>
                                                                </button>
                                                            );
                                                        })}
                                                </div>
                                            ) : (
                                                emptyState(allInspections.length ? "No inspections match your filter" : "No inspections yet")
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                            </div>

                            {/* —— QUICK PREVIEW PANEL —— */}
                            {viewMode === "list" && peekCase && (() => {
                                const item = peekCase.item;
                                const ops = opsOf(item);
                                const scheduled = scheduledOf(item);
                                return (
                                    <aside id="quick-preview" aria-label="Quick preview" className="hidden lg:flex w-[300px] shrink-0 bg-white rounded-xl border border-slate-200 flex-col min-h-0 overflow-hidden">
                                        <div className="flex-1 overflow-y-auto">
                                            {/* Identity */}
                                            <div className="px-4 pt-3 pb-3.5 border-b border-slate-100">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-mono text-[11px] text-slate-500">
                                                        {item.display_reference || `Application #${item.zoning_application_id}`}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setPeekKey(null)}
                                                        aria-label="Close preview"
                                                        className="-mr-2 w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                </div>
                                                <h3 className="text-[15px] font-bold text-slate-900 leading-snug mt-0.5">{applicantOf(item)}</h3>
                                                <p className="text-[12px] text-slate-500 mt-0.5">
                                                    {locationOf(item) || "Location not recorded"}
                                                </p>
                                            </div>

                                            {/* Latest round */}
                                            <div className="px-4 py-3 border-b border-slate-100">
                                                <div className="flex items-center justify-between mb-2">
                                                    <h4 className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wide">Latest round</h4>
                                                    {statusBadge(item)}
                                                </div>
                                                <dl className="grid grid-cols-[76px_1fr] gap-x-2 gap-y-1.5 text-[12px]">
                                                    <dt className="text-slate-500">Round</dt>
                                                    <dd className="text-slate-900">
                                                        {item.round_number
                                                            ? `Round ${item.round_number} · ${item.round_kind || "Inspection"}`
                                                            : item.round_kind === "Historical Inspection"
                                                              ? `${item.round_kind} · ${item.round_note || "Parcel not recorded"}`
                                                              : item.round_kind || "Inspection"}
                                                    </dd>
                                                    <dt className="text-slate-500">Parcel</dt>
                                                    <dd className="text-slate-900 break-words">{ops.parcel_label || "—"}</dd>
                                                    <dt className="text-slate-500">Inspector</dt>
                                                    <dd className="text-slate-900">{ops.inspector_name || "—"}</dd>
                                                    <dt className="text-slate-500">Scheduled</dt>
                                                    <dd className="text-slate-900 whitespace-nowrap">
                                                        {scheduled ? <>{formatDate(scheduled)} <span className="text-slate-400">· {relativeDay(scheduled)}</span></> : "—"}
                                                    </dd>
                                                    {ops.deadline_date && (
                                                        <>
                                                            <dt className="text-slate-500">Deadline</dt>
                                                            <dd className="text-slate-900">{formatDate(ops.deadline_date)}</dd>
                                                        </>
                                                    )}
                                                    {completedOf(item) && (
                                                        <>
                                                            <dt className="text-slate-500">Completed</dt>
                                                            <dd className="text-slate-900">{formatDate(completedOf(item))}</dd>
                                                        </>
                                                    )}
                                                    <dt className="text-slate-500">Delivery</dt>
                                                    <dd>{deliveryPill(ops) || "—"}</dd>
                                                </dl>
                                                {(poReview?.[item.id]?.po_decision || poReview?.[item.id]?.parcel_review) && (
                                                    <div className="mt-2 flex flex-wrap gap-1.5">{reviewBadges(poReview?.[item.id])}</div>
                                                )}
                                            </div>

                                            {/* Round history, newest first */}
                                            <div className="px-4 py-3">
                                                <h4 className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wide mb-2.5">
                                                    Round history <span className="text-slate-400 font-medium normal-case tracking-normal">· {peekCase.rounds.length}</span>
                                                </h4>
                                                <ol>
                                                    {[...peekCase.rounds].reverse().map((item, idx, arr) => {
                                                        const isLast = idx === arr.length - 1;
                                                        const rOps = opsOf(item);
                                                        const dot = hasFailed(item) ? "bg-rose-500" : isDone(item) ? "bg-emerald-500" : "bg-amber-500";
                                                        const rDate = completedOf(item) || scheduledOf(item);
                                                        return (
                                                            <li key={item.id} className="flex gap-2.5">
                                                                <div className="flex flex-col items-center pt-1">
                                                                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white ${dot}`} aria-hidden="true" />
                                                                    {!isLast && <span className="w-px flex-1 min-h-[12px] bg-slate-200" aria-hidden="true" />}
                                                                </div>
                                                                <Link
                                                                    href={listDetailUrl(item)}
                                                                    className={`group flex-1 min-w-0 -mt-0.5 rounded-md px-1.5 py-1 -mx-1.5 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isLast ? "" : "mb-1.5"}`}
                                                                >
                                                                    <span className="flex items-center justify-between gap-2">
                                                                        <span className="font-mono text-[11px] text-slate-500 group-hover:text-blue-700">INS-{item.id}</span>
                                                                        <span className="text-[11px] text-slate-400">{item.display_status || "Assigned"}</span>
                                                                    </span>
                                                                    <span className="block text-[12px] text-slate-800 leading-snug">
                                                                        {item.round_number
                                                                            ? `Round ${item.round_number} · ${item.round_kind || "Inspection"}`
                                                                            : item.round_kind === "Historical Inspection"
                                                                              ? `${item.round_kind} · ${item.round_note || "Parcel not recorded"}`
                                                                              : item.round_kind || "Inspection"}
                                                                    </span>
                                                                    <span className="block text-[10.5px] text-slate-400">
                                                                        {[rDate && formatDate(rDate), rOps.delivery_label].filter(Boolean).join(" · ")}
                                                                    </span>
                                                                </Link>
                                                            </li>
                                                        );
                                                    })}
                                                </ol>
                                            </div>
                                        </div>

                                        <div className="p-3 border-t border-slate-100 flex items-center gap-2 shrink-0">
                                            <Link
                                                href={listDetailUrl(item)}
                                                className="flex-1 h-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[12.5px] font-semibold transition-colors flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                                            >
                                                Open latest round
                                            </Link>
                                            {item.zoning_application_id && (
                                                <Link
                                                    href={`/applications/${item.zoning_application_id}`}
                                                    title="Open the application record"
                                                    className="h-8 px-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-[12px] font-semibold flex items-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                                >
                                                    Application
                                                </Link>
                                            )}
                                        </div>
                                    </aside>
                                );
                            })()}
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        </>
    );
}
