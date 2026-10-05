import React, { useEffect, useRef, useState } from "react";
import { Head, Link, router, usePage } from "@inertiajs/react";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import ApplicationsSubNav from "@/Components/ApplicationsSubNav";
import { confirmSignOut } from "@/utils/signOut";

/**
 * Technical Review work queue.
 *
 * Admin/PO audit (P0): `TechnicalReviewController@index()` rendered
 * `TechnicalReview/Index`, but that component did not exist, so the route was
 * never a usable queue. This page restores it as the SMALLEST functional queue
 * built on the controller payload that already exists.
 *
 * Deliberate scope:
 *  - This queue is NAVIGATION ONLY. It answers "what needs technical review?"
 *    and "which application do I open next?".
 *  - The technical decision itself (approve / needs site inspection / decline /
 *    schedule reinspection, and inspector assignment) stays in the existing
 *    Application Detail workflow, which already owns those controls and is the
 *    only place they should be edited. Nothing is duplicated here.
 *  - No Planning Officer decision control is rendered on this page, so a role
 *    that may only read the route (Admin) cannot accidentally acquire decision
 *    authority by visiting it. Backend role middleware remains the boundary.
 */

const APPLICATION_TYPES = [
    "Locational Clearance",
    "Zoning Certificate",
    "Development Permit",
    "Preliminary Approval and Locational Clearance (PALC)",
    "Petition for Rezoning",
    "Petition for Reclassification",
];

const formatDate = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};

const formatArea = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const num = Number(value);
    if (Number.isNaN(num)) return null;
    return `${num.toLocaleString("en-PH", { maximumFractionDigits: 2 })} sq.m`;
};

export default function TechnicalReviewIndex({ applications, filters = {} }) {
    const { auth } = usePage().props;
    const userRole = auth?.user?.role || "Planning Officer";
    const isPlanningOfficer = userRole === "Planning Officer";
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [clock, setClock] = useState("");
    const [search, setSearch] = useState(filters.search || "");

    useEffect(() => {
        const tick = () => {
            const now = new Date();
            setClock(
                now.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) +
                " • " +
                now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })
            );
        };
        tick();
        const id = setInterval(tick, 30000);
        return () => clearInterval(id);
    }, []);

    // Debounced server-side search.
    //
    // The first run is deliberately skipped. This effect previously fired on
    // mount and re-requested the queue with no parameters, which silently
    // dropped any ?page= the officer arrived with — so Previous/Next and any
    // direct page link snapped back to page 1. Search and filter changes still
    // re-query, and they intentionally return to the first page because the
    // result set has changed and the previous page may no longer exist.
    const isFirstSearchRun = useRef(true);
    useEffect(() => {
        if (isFirstSearchRun.current) {
            isFirstSearchRun.current = false;
            return undefined;
        }

        const id = setTimeout(() => {
            const params = {};
            if (search.trim()) params.search = search.trim();
            if (filters.application_type) params.application_type = filters.application_type;

            router.get("/technical-review", params, {
                preserveState: true,
                preserveScroll: true,
                replace: true,
            });
        }, 350);
        return () => clearTimeout(id);
    }, [search]);

    const applyType = (value) => {
        const params = {};
        if (search.trim()) params.search = search.trim();
        if (value) params.application_type = value;
        router.get("/technical-review", params, { preserveState: true, preserveScroll: true, replace: true });
    };

    const handleLogout = confirmSignOut;

    const rows = applications?.data || [];

    return (
        <>
            <Head title="Technical Review | iMAPS" />

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

                #technical-review-page-root {
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

            <div id="technical-review-page-root" className="bg-slate-50/75 text-slate-800 h-screen flex flex-col overflow-hidden antialiased">
                <Header
                    userName={auth?.user?.name || "Staff Member"}
                    userRole={auth?.user?.role || "Planning Officer"}
                    clock={clock}
                    sidebarOpen={sidebarOpen}
                    setSidebarOpen={setSidebarOpen}
                    onLogout={handleLogout}
                    activePage="technical-review"
                />

                <div className="flex-1 overflow-hidden relative flex flex-col min-w-0">
                    <Sidebar
                        userName={auth?.user?.name || "Staff Member"}
                        userRole={auth?.user?.role || "Planning Officer"}
                        sidebarOpen={sidebarOpen}
                        setSidebarOpen={setSidebarOpen}
                        onLogout={handleLogout}
                        activePage="technical-review"
                    />

                    {sidebarOpen && (
                        <div
                            onClick={() => setSidebarOpen(false)}
                            className="absolute inset-0 bg-slate-900/20 backdrop-blur-xs z-[750] transition-opacity duration-200"
                        />
                    )}

                    <main className="flex-1 w-full h-full flex flex-col overflow-hidden">
                        <div className="p-6 sm:p-5 flex-1 flex flex-col h-full overflow-y-auto w-full gap-4">

                            {/* ── Page heading ──
                                The H1 names the SUBSECTION; the header badge above
                                names the parent module (APPLICATIONS). The persistent
                                sub-navigation below is what makes the sibling structure
                                explicit, so this page is never mistaken for a separate
                                top-level module. */}
                            <div className="px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
                                <div>
                                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                                        Technical Review
                                    </h1>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Applications waiting for your technical evaluation. Open an application to record
                                        the parcel decision and, when needed, assign a site inspector.
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                    <span className="text-[11px] font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-2xs">
                                        {applications?.total ?? 0} waiting
                                    </span>
                                    <ApplicationsSubNav active="technical-review" userRole={userRole} />
                                </div>
                            </div>

                            {/* ── Filters ── */}
                            <div className="px-4 flex flex-col sm:flex-row sm:items-center gap-2.5 shrink-0">
                                <div className="relative flex-1 max-w-md">
                                    <input
                                        type="text"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Search reference number or applicant..."
                                        aria-label="Search technical review queue"
                                        className="w-full rounded-xl border border-slate-200 bg-white/60 pl-9 pr-4 py-2.5 text-xs font-medium text-slate-800 transition-all focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                    />
                                    <svg
                                        className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                                        />
                                    </svg>
                                </div>

                                <select
                                    value={filters.application_type || ""}
                                    onChange={(e) => applyType(e.target.value)}
                                    aria-label="Filter by application type"
                                    className="rounded-xl border border-slate-200 bg-white/60 px-3 py-2.5 text-xs font-medium text-slate-700 focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                >
                                    <option value="">All application types</option>
                                    {APPLICATION_TYPES.map((type) => (
                                        <option key={type} value={type}>
                                            {type}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* ── Queue ──
                                Layout note: this list is deliberately NOT a
                                shrinkable flex child (`flex-1 min-h-0`). Doing
                                that let the card column overflow its box and
                                paint over the pagination footer below it. The
                                list is now normal block flow inside the single
                                scrolling page column, so the footer always
                                follows the last card in document order. */}
                            <div className="px-4">
                                {rows.length === 0 ? (
                                    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-10 text-center">
                                        <p className="text-sm font-semibold text-slate-700">No applications found.</p>
                                        <p className="text-xs text-slate-500 mt-1">
                                            There are no applications currently waiting for technical review.
                                        </p>
                                        <Link
                                            href="/applications"
                                            className="inline-flex items-center gap-1.5 mt-4 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors"
                                        >
                                            Go to Applications
                                        </Link>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2.5 pb-2">
                                        {rows.map((application) => {
                                            const area = formatArea(application.lot_area_sqm);
                                            const location = [
                                                application.parcel_barangay || application.barangay,
                                                application.location_address,
                                            ]
                                                .filter(Boolean)
                                                .join(", ");

                                            return (
                                                <div
                                                    key={application.id}
                                                    className="group bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 hover:border-slate-300 hover:shadow-sm transition-all duration-200"
                                                >
                                                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                                                        {/* Identity */}
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200/60 rounded-md px-2 py-0.5">
                                                                    {application.reference_number || `APP-${application.id}`}
                                                                </span>
                                                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200/60">
                                                                    {application.status || "Technical Review"}
                                                                </span>
                                                                {application.application_type && (
                                                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200/60">
                                                                        {application.application_type}
                                                                    </span>
                                                                )}
                                                                {application.target_land_use_class && (
                                                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200/60">
                                                                        {application.target_land_use_class}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            <p className="text-sm font-bold text-slate-900 mt-1.5 truncate">
                                                                {application.applicant_name || "Unknown Applicant"}
                                                            </p>

                                                            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                                                                {location || "No parcel location recorded"}
                                                                {area ? ` • ${area}` : ""}
                                                                {application.property_index_number
                                                                    ? ` • PIN ${application.property_index_number}`
                                                                    : ""}
                                                            </p>
                                                        </div>

                                                        {/* Filed + action */}
                                                        <div className="flex items-center justify-between lg:justify-end gap-3 shrink-0">
                                                            <div className="text-left lg:text-right">
                                                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                                                    Filed
                                                                </p>
                                                                <p className="text-xs font-semibold text-slate-700">
                                                                    {formatDate(application.created_at)}
                                                                </p>
                                                            </div>

                                                            {/* Wording is role-aware. "Review" is the Planning
                                                                Officer's action. A read-only role that reaches this
                                                                page for oversight must not be offered wording that
                                                                implies it performs the technical review, so it gets a
                                                                neutral "View". Presentation only: no role gains
                                                                decision authority from either label. */}
                                                            <Link
                                                                href={`/applications/${application.id}?from=technical-review`}
                                                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors"
                                                            >
                                                                {isPlanningOfficer ? "Review" : "View"}
                                                            </Link>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* ── Pagination ──
                                Sits in normal flow after the list, separated by a
                                rule and real spacing. It wraps rather than
                                squeezing, so a narrow viewport stacks the count
                                above the controls instead of overlapping rows. */}
                            {applications?.last_page > 1 && (
                                <div className="px-4 mt-4 pt-4 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 shrink-0">
                                    <p className="text-[11px] text-slate-500">
                                        Showing {applications.from}–{applications.to} of {applications.total}
                                    </p>
                                    <nav aria-label="Technical review queue pages" className="flex items-center flex-wrap gap-1.5">
                                        {applications.links?.map((link, i) =>
                                            link.url ? (
                                                <button
                                                    key={i}
                                                    onClick={() => router.get(link.url, {}, { preserveScroll: true })}
                                                    aria-current={link.active ? "page" : undefined}
                                                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                                                        link.active
                                                            ? "bg-blue-600 text-white border-blue-600"
                                                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                                                    }`}
                                                    dangerouslySetInnerHTML={{ __html: link.label }}
                                                />
                                            ) : (
                                                <span
                                                    key={i}
                                                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-300 border border-slate-100"
                                                    dangerouslySetInnerHTML={{ __html: link.label }}
                                                />
                                            )
                                        )}
                                    </nav>
                                </div>
                            )}

                        </div>
                    </main>
                </div>
            </div>
        </>
    );
}
