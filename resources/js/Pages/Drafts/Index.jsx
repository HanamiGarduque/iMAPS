import { useState, useEffect, useMemo } from "react";
import { Head, router, Link } from "@inertiajs/react";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import { confirmSignOut } from "@/utils/signOut";
import "leaflet/dist/leaflet.css";

const rosarioCenter = [13.7850, 121.2500];
const brgyStyle = { color: "#475569", weight: 1, opacity: 0.4, fillColor: "#e2e8f0", fillOpacity: 0.1, dashArray: "4" };

// ── Status badge config for Drafts ──
const STATUS_CONFIG = {
    "Auto-saved": { bg: "bg-slate-50 text-slate-600 border-slate-200", dot: "bg-slate-400" },
    "Incomplete": { bg: "bg-slate-50 text-slate-500 border-slate-200", dot: "bg-slate-300" },
};

const STATUSES = ["Auto-saved", "Incomplete"];
const KNOWN_TYPES = ["Locational Clearance", "Zoning Certificate", "Development Permit", "Petition for Rezoning", "Preliminary Approval and Locational Clearance (PALC)"];

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

export default function DraftsIndex({ drafts, filters = {}, auth }) {
    const [clock, setClock] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [search, setSearch] = useState(filters?.search || "");

    const userName = auth?.user?.name || "Planning Officer";
    const userRole = auth?.user?.role || "Planning Officer";
    const rows = drafts?.data || [];
    const total = drafts?.total ?? rows.length;

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

    const hasFilters = Boolean(filters?.search || filters?.status || filters?.application_type);

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
            if (r.isConfirmed) router.delete(`/applications/drafts/${draft.id}`, { preserveScroll: true });
        });
    };

    const field = "h-9 px-3 text-[13px] bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:border-[#0b2a5b] focus:ring-2 focus:ring-[#0b2a5b]/15";

    return (
        <>
            <Head title="Drafts | iMAPS" />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
                #dashboard-root { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
                #dashboard-root .font-mono { font-family: 'JetBrains Mono', monospace !important; }
            `}</style>
            <div id="dashboard-root" className="h-screen flex flex-col overflow-hidden bg-[#f4f5f7] text-slate-800">
                <Header userName={userName} userRole={userRole} clock={clock} onLogout={handleLogout} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

                <div className="flex-1 relative overflow-hidden flex">
                    <Sidebar userName={userName} userRole={userRole} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} onLogout={handleLogout} activePage="drafts" />
                    {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="absolute inset-0 bg-slate-950/20 z-[750]" aria-hidden="true" />}

                    <main className="flex-1 min-w-0 overflow-y-auto">
                        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
                            {/* Page header */}
                            <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
                                <div className="flex items-center gap-3">
                                    <Link
                                        href="/applications"
                                        className="w-8 h-8 flex items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                                        aria-label="Back to applications"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                                    </Link>
                                    <div>
                                        <h1 className="text-[20px] font-semibold text-slate-900 leading-tight">Drafts</h1>
                                        <p className="text-[12.5px] text-slate-500">
                                            {total} unfinished application{total === 1 ? "" : "s"} · saved automatically as you encode
                                        </p>
                                    </div>
                                </div>
                                {userRole === "Planning Officer" && (
                                    <Link
                                        href="/applications/encode"
                                        className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-[#0b2a5b] hover:bg-[#0e3574] text-white text-[13px] font-semibold"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                        New application
                                    </Link>
                                )}
                            </div>

                            <section className="bg-white border border-slate-200 rounded-lg shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                                {/* Toolbar */}
                                <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-200">
                                    <div className="inline-flex rounded-md border border-slate-300 overflow-hidden" role="group" aria-label="Filter by status">
                                        {["", ...STATUSES].map((s, i) => {
                                            const on = (filters?.status || "") === s;
                                            return (
                                                <button
                                                    key={s || "all"}
                                                    type="button"
                                                    aria-pressed={on}
                                                    onClick={() => applyFilters({ status: s, page: undefined })}
                                                    className={`h-9 px-3.5 text-[13px] cursor-pointer ${i ? "border-l border-slate-300" : ""} ${
                                                        on ? "bg-[#0b2a5b] text-white font-semibold" : "bg-white text-slate-600 hover:bg-slate-50"
                                                    }`}
                                                >
                                                    {s || "All"}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <label className="sr-only" htmlFor="draft-type">Application type</label>
                                    <select
                                        id="draft-type"
                                        value={filters?.application_type || ""}
                                        onChange={(e) => applyFilters({ application_type: e.target.value, page: undefined })}
                                        className={`${field} pr-8 py-0`}
                                    >
                                        <option value="">All application types</option>
                                        {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                                    </select>

                                    <div className="relative ml-auto w-full sm:w-72">
                                        <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m0 0A7.5 7.5 0 105.2 5.2a7.5 7.5 0 0010.6 10.6z" /></svg>
                                        <label className="sr-only" htmlFor="draft-search">Search drafts</label>
                                        <input
                                            id="draft-search"
                                            type="search"
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            placeholder="Search applicant or reference"
                                            className={`${field} w-full pl-9`}
                                        />
                                    </div>
                                </div>

                                {rows.length === 0 ? (
                                    <div className="px-6 py-16 text-center">
                                        <p className="text-[14px] font-semibold text-slate-800">{hasFilters ? "No drafts match these filters" : "No drafts"}</p>
                                        <p className="text-[12.5px] text-slate-500 mt-1">
                                            {hasFilters ? "Try a different search or clear the filters." : "Applications you start encoding are saved here until submitted."}
                                        </p>
                                        {hasFilters && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSearch("");
                                                    router.get("/applications/drafts", {}, { preserveState: true, replace: true });
                                                }}
                                                className="mt-4 h-9 px-4 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-[13px] font-semibold text-slate-700 cursor-pointer"
                                            >
                                                Clear filters
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="text-[11.5px] text-slate-500 border-b border-slate-200 bg-slate-50/70">
                                                    <th className="px-4 py-2.5 font-medium">Applicant</th>
                                                    <th className="px-4 py-2.5 font-medium">Application type</th>
                                                    <th className="px-4 py-2.5 font-medium">Barangay</th>
                                                    <th className="px-4 py-2.5 font-medium">Last edited</th>
                                                    <th className="px-4 py-2.5 font-medium">Status</th>
                                                    <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {rows.map((draft) => {
                                                    const incomplete = draft.status === "Incomplete";
                                                    return (
                                                        <tr key={draft.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                                                            <td className="px-4 py-3">
                                                                <button type="button" onClick={() => resume(draft.id)} className="text-left cursor-pointer group">
                                                                    <span className="block text-[13.5px] font-semibold text-slate-900 group-hover:text-[#0b2a5b] group-hover:underline underline-offset-2">
                                                                        {draft.applicant_name || "Unnamed applicant"}
                                                                    </span>
                                                                    <span className="block text-[11.5px] font-mono text-slate-400">{draft.temp_reference_number || `DRAFT-${draft.id}`}</span>
                                                                </button>
                                                            </td>
                                                            <td className="px-4 py-3 text-[13px] text-slate-700">{draft.application_type || <span className="text-slate-400">Not chosen yet</span>}</td>
                                                            <td className="px-4 py-3 text-[13px] text-slate-700">{draft.barangay || <span className="text-slate-400">—</span>}</td>
                                                            <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap" title={fullDate(draft.updated_at)}>{relativeTime(draft.updated_at)}</td>
                                                            <td className="px-4 py-3">
                                                                <span className={`inline-flex items-center gap-1.5 text-[12px] ${incomplete ? "text-amber-700" : "text-slate-600"}`}>
                                                                    <span className={`w-1.5 h-1.5 rounded-full ${incomplete ? "bg-amber-500" : "bg-slate-400"}`} aria-hidden="true" />
                                                                    {draft.status || "Auto-saved"}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <div className="flex items-center justify-end gap-1.5">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => resume(draft.id)}
                                                                        className="h-8 px-3 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-[12.5px] font-semibold text-slate-800 cursor-pointer"
                                                                    >
                                                                        Resume
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => discard(draft)}
                                                                        aria-label={`Discard draft for ${draft.applicant_name || "unnamed applicant"}`}
                                                                        title="Discard draft"
                                                                        className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-red-700 hover:bg-red-50 cursor-pointer"
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
                                    </div>
                                )}

                                {drafts?.last_page > 1 && (
                                    <nav className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 text-[12.5px] text-slate-600" aria-label="Pagination">
                                        <span>
                                            {drafts.from}–{drafts.to} of {drafts.total}
                                        </span>
                                        <div className="flex gap-1.5">
                                            {[
                                                { label: "Previous", url: drafts.prev_page_url },
                                                { label: "Next", url: drafts.next_page_url },
                                            ].map((p) => (
                                                <button
                                                    key={p.label}
                                                    type="button"
                                                    disabled={!p.url}
                                                    onClick={() => p.url && router.get(p.url, {}, { preserveState: true, preserveScroll: false })}
                                                    className="h-8 px-3 rounded-md border border-slate-300 bg-white hover:bg-slate-50 font-semibold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                                >
                                                    {p.label}
                                                </button>
                                            ))}
                                        </div>
                                    </nav>
                                )}
                            </section>
                        </div>
                    </main>
                </div>
            </div>
        </>
    );
}
