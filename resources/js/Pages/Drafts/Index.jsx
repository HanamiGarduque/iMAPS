import { useState, useEffect, useMemo, useRef } from "react";
import { Head, router, Link } from "@inertiajs/react";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import { confirmSignOut } from "@/utils/signOut";

// Layout and styling mirror the Registry (Pages/Applications/Index.jsx) so the
// two pages read as one module.

const KNOWN_TYPES = ["Locational Clearance", "Zoning Certificate", "Development Permit", "Petition for Rezoning", "Preliminary Approval and Locational Clearance (PALC)"];

// Activity tabs. Every draft is auto-saved, so the useful split is how
// recently it was touched: "inactive" drafts (7+ days) are the ones to
// resume or discard. Filtering and counts are done by the server.
const TABS = [
    { label: "All", activity: "", d: "M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm0 5.25h.007v.008H3.75V12zm0 5.25h.007v.008H3.75v-.008z" },
    { label: "Recent", activity: "recent", hint: "Edited in the last 7 days", d: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" },
    { label: "Inactive", activity: "inactive", hint: "Not edited for over 7 days", d: "M14.25 9v6m-4.5 0V9M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
];

const swalClasses = {
    popup: "!rounded-md !p-0 !w-[400px] max-w-[calc(100vw-2rem)] overflow-hidden",
    title: "!text-[15px] !font-semibold !text-slate-900 !text-left !px-5 !pt-4 !pb-0 !m-0",
    htmlContainer: "!text-left !m-0 !px-5 !pt-2 !pb-4 !text-[13px] !text-slate-600",
    actions: "!flex !justify-end !gap-2 !w-full !m-0 !px-5 !py-3 !bg-slate-50 !border-t !border-slate-200",
    confirmButton: "px-4 py-2 rounded-md bg-red-700 hover:bg-red-800 text-white text-[12.5px] font-semibold cursor-pointer",
    cancelButton: "px-4 py-2 rounded-md bg-white hover:bg-slate-50 text-slate-700 text-[12.5px] font-semibold border border-slate-300 cursor-pointer",
};

// "3 min ago", "2 h ago", "Yesterday", or a date.
function relativeTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    const mins = Math.round((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} h ago`;
    if (hours < 48) return "Yesterday";
    return date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

const fullDate = (value) =>
    value ? new Date(value).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

export default function DraftsIndex({ drafts, filters = {}, activity_counts = {}, auth }) {
    const [clock, setClock] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [search, setSearch] = useState(filters?.search || "");
    const searchInputRef = useRef(null);
    const loadMoreRef = useRef(null);

    const userName = auth?.user?.name || "Planning Officer";
    const userRole = auth?.user?.role || "Planning Officer";
    const rows = drafts?.data || [];
    const total = drafts?.total ?? rows.length;

    // Server pages of 25 are accumulated into one list (infinite scroll, like
    // the Registry). Page 1 replaces the list; later pages append.
    const removedIds = useRef(new Set());
    const [list, setList] = useState(rows);
    useEffect(() => {
        const fresh = rows.filter((d) => !removedIds.current.has(d.id));
        setList((prev) =>
            (drafts?.current_page || 1) > 1
                ? [...prev, ...fresh.filter((d) => !prev.some((p) => p.id === d.id))]
                : fresh
        );
    }, [drafts]);

    const hasMore = Boolean(drafts?.next_page_url);
    const [loadingMore, setLoadingMore] = useState(false);
    const loadMore = () => {
        if (!hasMore || loadingMore) return;
        setLoadingMore(true);
        router.get(drafts.next_page_url, {}, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
            only: ["drafts"],
            onFinish: () => setLoadingMore(false),
        });
    };

    useEffect(() => {
        const el = loadMoreRef.current;
        if (!el || !hasMore) return;
        const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) loadMore(); }, { rootMargin: "200px" });
        observer.observe(el);
        return () => observer.disconnect();
    }, [hasMore, list.length, loadingMore]);

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
        const id = setInterval(tick, 30000);
        return () => clearInterval(id);
    }, []);

    // "/" focuses search, as on the Registry.
    useEffect(() => {
        const onKey = (e) => {
            const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
            if (!isInput && e.key === "/" && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    // Every filter goes to the server, which owns filtering and pagination.
    const applyFilters = (next) => {
        const params = { ...filters, search, ...next };
        Object.keys(params).forEach((k) => (params[k] === "" || params[k] == null) && delete params[k]);
        router.get("/applications/drafts", params, { preserveState: true, preserveScroll: true, replace: true });
    };

    useEffect(() => {
        if (search === (filters?.search || "")) return;
        const t = setTimeout(() => applyFilters({ search, page: undefined }), 350);
        return () => clearTimeout(t);
    }, [search]);

    const typeOptions = useMemo(
        () => [...new Set([...KNOWN_TYPES, ...rows.map((d) => d.application_type).filter(Boolean), filters?.application_type].filter(Boolean))],
        [rows, filters?.application_type]
    );

    const hasFilters = Boolean(filters?.search || filters?.activity || filters?.application_type);
    const clearFilters = () => {
        setSearch("");
        router.get("/applications/drafts", {}, { preserveState: true, replace: true });
    };

    const countFor = (activity) => Number(activity_counts?.[activity || "all"] || 0);

    const handleLogout = confirmSignOut;

    const resume = (id) => router.get(`/applications/encode?draft_id=${id}`);

    const discard = (draft) => {
        Swal.fire({
            title: "Discard this draft?",
            text: `${draft.applicant_name || "This draft"} (${draft.temp_reference_number || `DRAFT-${draft.id}`}) will be deleted. This cannot be undone.`,
            showCancelButton: true,
            confirmButtonText: "Discard draft",
            cancelButtonText: "Keep",
            buttonsStyling: false,
            focusCancel: true,
            customClass: swalClasses,
        }).then((r) => {
            if (!r.isConfirmed) return;
            router.delete(`/applications/drafts/${draft.id}`, {
                preserveScroll: true,
                onSuccess: () => {
                    removedIds.current.add(draft.id);
                    setList((prev) => prev.filter((d) => d.id !== draft.id));
                },
            });
        });
    };

    return (
        <>
            <Head title="Drafts | iMAPS" />
            <style>{`

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

            <div id="dashboard-root" className="bg-slate-50 font-sans text-slate-800 h-screen flex flex-col overflow-hidden">
                <Header userName={userName} userRole={userRole} clock={clock} onLogout={handleLogout} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

                <div className="flex-1 overflow-hidden relative flex flex-col min-w-0">
                    <Sidebar userName={userName} userRole={userRole} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} onLogout={handleLogout} activePage="drafts" />

                    {sidebarOpen && (
                        <div
                            onClick={() => setSidebarOpen(false)}
                            className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px] z-[750] transition-opacity duration-300"
                        />
                    )}

                    <main className="flex-1 w-full h-full flex flex-col overflow-hidden">
                        <div className="p-4 sm:p-6 flex-1 flex flex-col h-full overflow-hidden max-w-[1580px] mx-auto w-full gap-5">
                            <div className="flex-1 min-w-0 bg-white rounded-xl border border-slate-200 flex flex-col min-h-0 overflow-hidden">

                                {/* —— TITLE ROW + FOLDER TABS —— */}
                                <div className="bg-slate-100/80 border-b border-slate-200 shrink-0">
                                    <div className="px-5 pt-3 flex items-center gap-3 min-w-0">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Link
                                                href="/applications"
                                                aria-label="Back to Registry"
                                                title="Back to Registry"
                                                className="-ml-1.5 w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-slate-500 hover:text-blue-700 hover:bg-white hover:shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.25" aria-hidden="true">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                                                </svg>
                                            </Link>
                                            <div className="flex items-baseline gap-2.5 min-w-0">
                                                <h1 className="text-[16px] font-bold text-slate-900 tracking-tight">Drafts</h1>
                                                <span
                                                    title="Unfinished applications, saved automatically as you encode"
                                                    className="self-center shrink-0 inline-flex items-center gap-1.5 h-6 px-2.5 rounded-md bg-blue-50 ring-1 ring-inset ring-blue-200/70 text-[11.5px] font-medium text-blue-700"
                                                >
                                                    <svg className="w-3.5 h-3.5 text-blue-600" viewBox="0 0 24 24" aria-hidden="true">
                                                        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
                                                        <path d="M12 4a8 8 0 010 16z" fill="currentColor" />
                                                    </svg>
                                                    Partially encoded
                                                </span>
                                            </div>
                                        </div>
                                        <div className="ml-auto flex items-center gap-2 shrink-0">
                                            {userRole === "Planning Officer" && (
                                                <Link
                                                    href="/applications/encode"
                                                    className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border border-blue-600 bg-blue-600 shadow-sm shadow-blue-900/10 hover:bg-blue-700 hover:border-blue-700 active:bg-blue-800 text-white text-[13px] font-semibold transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.25" aria-hidden="true">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                                    </svg>
                                                    New application
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-end gap-3 px-4 pt-2.5 overflow-x-auto">
                                        <div className="flex items-end gap-1" role="group" aria-label="Filter by activity">
                                            {TABS.map((tab) => {
                                                const isActive = (filters?.activity || "") === tab.activity;
                                                return (
                                                    <button
                                                        key={tab.label}
                                                        type="button"
                                                        aria-pressed={isActive}
                                                        onClick={() => applyFilters({ activity: tab.activity, page: undefined })}
                                                        title={tab.hint}
                                                        className={`relative -mb-px flex items-center gap-2 px-4 py-2.5 rounded-t-xl border text-[12.5px] font-semibold whitespace-nowrap transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                                            isActive
                                                                ? "bg-white border-slate-200 border-b-white text-blue-700"
                                                                : "bg-slate-50 border-slate-200/70 text-slate-500 hover:text-slate-800 hover:bg-white/70"
                                                        }`}
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d={tab.d} />
                                                        </svg>
                                                        {tab.label}
                                                        <span className={`text-[10.5px] font-bold tabular-nums px-1.5 py-px rounded-full ${isActive ? "bg-blue-700 text-white" : "bg-slate-200 text-slate-600"}`}>
                                                            {countFor(tab.activity)}
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
                                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                        </svg>
                                        <input
                                            ref={searchInputRef}
                                            type="text"
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            placeholder="Search applicant or reference…"
                                            aria-label="Search drafts"
                                            className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50/60 pl-9 pr-8 text-[13px] text-slate-800 transition-colors focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 placeholder:text-slate-400"
                                        />
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                                            {search ? (
                                                <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer">
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            ) : (
                                                <kbd className="text-[10px] font-mono text-slate-400 bg-white border border-slate-200 px-1.5 rounded">/</kbd>
                                            )}
                                        </div>
                                    </div>

                                    <label className="sr-only" htmlFor="draft-type">Application type</label>
                                    <select
                                        id="draft-type"
                                        value={filters?.application_type || ""}
                                        onChange={(e) => applyFilters({ application_type: e.target.value, page: undefined })}
                                        className={`h-9 pl-3 pr-8 rounded-lg border text-[13px] font-medium transition-colors cursor-pointer focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 ${
                                            filters?.application_type ? "border-blue-200 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                        }`}
                                    >
                                        <option value="">All application types</option>
                                        {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                                    </select>

                                    {hasFilters && (
                                        <button type="button" onClick={clearFilters} className="h-9 px-2 text-[13px] font-medium text-slate-500 hover:text-slate-900 transition-colors cursor-pointer">
                                            Reset
                                        </button>
                                    )}
                                </div>

                                {/* —— TABLE —— */}
                                <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
                                    <div className="flex-1 overflow-auto custom-scrollbar">
                                        <table className="tabular-nums w-full text-left border-separate border-spacing-0 min-w-[760px] text-[13px] table-fixed">
                                            <thead className="sticky top-0 z-10 bg-slate-100">
                                                <tr className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 [&>th]:border-y [&>th]:border-slate-200 [&>th]:py-2.5 [&>th]:px-3 [&>th]:whitespace-nowrap [&>th]:font-semibold">
                                                    <th className="w-[160px] !pl-5">Reference no.</th>
                                                    <th className="w-[24%]">Applicant</th>
                                                    <th>Application type</th>
                                                    <th className="w-[140px]">Barangay</th>
                                                    <th className="w-[130px]">Last edited</th>
                                                    <th className="w-[104px] !pr-5 text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {list.map((draft) => {
                                                    const ref = draft.temp_reference_number || `DRAFT-${draft.id}`;
                                                    return (
                                                        <tr
                                                            key={draft.id}
                                                            onClick={() => resume(draft.id)}
                                                            className="cursor-pointer transition-colors align-middle bg-white hover:bg-slate-50/80 [&>td]:border-b [&>td]:border-slate-100 [&>td]:py-2 [&>td]:px-3"
                                                        >
                                                            <td className="whitespace-nowrap !pl-5">
                                                                <span className="text-[12px] font-medium text-slate-500 tracking-wide">{ref}</span>
                                                            </td>
                                                            <td>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); resume(draft.id); }}
                                                                    className="block max-w-full text-left font-medium text-slate-900 truncate hover:text-blue-700 focus:outline-none focus-visible:underline cursor-pointer"
                                                                    title={draft.applicant_name || undefined}
                                                                >
                                                                    {draft.applicant_name || <span className="text-slate-400 font-normal">Unnamed applicant</span>}
                                                                </button>
                                                            </td>
                                                            <td className="truncate text-slate-700" title={draft.application_type || undefined}>
                                                                {draft.application_type || <span className="text-slate-300">Not chosen yet</span>}
                                                            </td>
                                                            <td className="truncate text-slate-700">
                                                                {draft.barangay || <span className="text-slate-300">—</span>}
                                                            </td>
                                                            <td className="whitespace-nowrap">
                                                                <span className="text-slate-600" title={fullDate(draft.updated_at)}>{relativeTime(draft.updated_at)}</span>
                                                            </td>
                                                            <td className="!pr-4" onClick={(e) => e.stopPropagation()}>
                                                                <div className="flex items-center justify-end gap-1">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => resume(draft.id)}
                                                                        aria-label={`Resume draft for ${draft.applicant_name || "unnamed applicant"}`}
                                                                        title="Resume draft"
                                                                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                                                    >
                                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                                                                        </svg>
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => discard(draft)}
                                                                        aria-label={`Discard draft for ${draft.applicant_name || "unnamed applicant"}`}
                                                                        title="Discard draft"
                                                                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                                                                    >
                                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.35 9m-4.78 0L9.26 9m9.97-3.21c.34.05.68.11 1.02.17m-1.02-.17L18.16 19.67A2.25 2.25 0 0115.92 21.75H8.08a2.25 2.25 0 01-2.24-2.08L4.77 5.79m14.46 0a48.1 48.1 0 00-3.48-.4m-12 .57c.34-.06.68-.11 1.02-.17m0 0a48.1 48.1 0 013.48-.4m7.5 0v-.91c0-1.18-.91-2.16-2.09-2.2a52 52 0 00-3.32 0c-1.18.04-2.09 1.02-2.09 2.2v.91m7.5 0a48.7 48.7 0 00-7.5 0" />
                                                                        </svg>
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>

                                        {list.length === 0 && (
                                            <div className="flex flex-col items-center justify-center text-slate-400 py-16">
                                                <p className="font-bold text-[14px] text-slate-700">{hasFilters ? "No drafts match your filter" : "No drafts"}</p>
                                                <p className="text-xs mt-1 text-slate-400">
                                                    {hasFilters ? "Try clearing active filters or adjusting your search term" : "Applications you start encoding are saved here until submitted."}
                                                </p>
                                                {hasFilters && (
                                                    <button
                                                        type="button"
                                                        onClick={clearFilters}
                                                        className="mt-3 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 cursor-pointer"
                                                    >
                                                        Clear All Filters
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {/* End of list: auto-loads the next server page on scroll; the
                                            button is the keyboard / screen-reader path to the same action. */}
                                        {list.length > 0 && (
                                            <div ref={loadMoreRef} className="py-4 flex items-center justify-center gap-3 text-[12px] text-slate-400" aria-live="polite">
                                                {hasMore ? (
                                                    <button
                                                        type="button"
                                                        onClick={loadMore}
                                                        className="inline-flex items-center gap-2 h-8 px-3 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer transition-colors"
                                                    >
                                                        <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 border-t-blue-600 animate-spin" aria-hidden="true" />
                                                        Load more · {list.length} of {total}
                                                    </button>
                                                ) : (
                                                    <>
                                                        <span className="h-px w-10 bg-slate-200" aria-hidden="true" />
                                                        All {list.length} {list.length === 1 ? "draft" : "drafts"} shown
                                                        <span className="h-px w-10 bg-slate-200" aria-hidden="true" />
                                                    </>
                                                )}
                                            </div>
                                        )}
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
