import React, { useEffect, useRef, useState } from "react";
import { Link, router } from "@inertiajs/react";
import { ReportShell, stamp, control, statuses, typeLabels } from "./ReportUi";
import { ReportWorkspace } from "./Show";
import { LoadingDots } from "@/Components/PageLoader";

const paths = {
    search: "m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z",
    x: "M6 18 18 6M6 6l12 12",
    warn: "M12 9v3.75m0 3.75h.008M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
    support: "M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z",
    technical: "M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437",
    check: "m4.5 12.75 6 6 9-13.5",
    sort: "M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5",
    filter: "M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z",
    inbox: "M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z",
};
function Icon({ d, className = "h-4 w-4", width = 1.8 }) {
    return <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={width}><path strokeLinecap="round" strokeLinejoin="round" d={d} /></svg>;
}
const ring = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600";
const sorts = [["date:desc", "Newest first"], ["date:asc", "Oldest first"], ["reference:asc", "Reference (A–Z)"], ["reference:desc", "Reference (Z–A)"],
    ["title:asc", "Title (A–Z)"], ["title:desc", "Title (Z–A)"], ["reporter:asc", "Reported by (A–Z)"], ["reporter:desc", "Reported by (Z–A)"],
    ["status:asc", "Status (open first)"], ["status:desc", "Status (closed first)"]];

const statusOptions = [["open", "Open (needs response)"], ["closed", "Done (resolved or won’t fix)"], ["all", "All statuses"], ...Object.entries(statuses)];
const isOpen = (report) => ["submitted", "in_review"].includes(report.status);
const wide = () => window.matchMedia("(min-width: 1280px)").matches;

/** The report type's icon: red warning when it blocks field work, light blue tint while open, grey once closed. */
function TypeTile({ report }) {
    const blocking = report.blocks_field_work === true;
    const tone = blocking ? "bg-red-50 text-red-600 ring-red-100" : isOpen(report) ? "bg-blue-50 text-blue-600 ring-blue-100" : "bg-slate-50 text-slate-400 ring-slate-200/70";
    return <span aria-hidden="true" className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ring-inset ${tone}`}>
        <Icon d={blocking ? paths.warn : report.report_type === "application_support" ? paths.support : paths.technical} className="h-[18px] w-[18px]" />
    </span>;
}
/** Open reports ask for attention in colour; closed ones state their outcome quietly. */
function RowStatus({ status }) {
    if (status === "submitted") return <span className="shrink-0 rounded-full bg-blue-50 px-1.5 py-px text-[10.5px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-200/80">Needs response</span>;
    if (status === "in_review") return <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-px text-[10.5px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200/80">In review</span>;
    return <span className="inline-flex shrink-0 items-center gap-1 text-[10.5px] font-medium text-slate-400">
        {status === "resolved" && <Icon d={paths.check} className="h-3 w-3 text-emerald-500" width={2.5} />}{statuses[status] || "Unknown status"}
    </span>;
}
/** One inbox tab: a file-folder tab; the open one is white and joins the list below. */
function RailItem({ active, count, children, ...rest }) {
    return <button type="button" {...rest} className={`relative flex min-w-0 flex-auto items-center justify-center gap-1.5 whitespace-nowrap rounded-t-lg border px-2.5 pb-2.5 pt-2 text-[12.5px] transition-colors duration-200 disabled:cursor-wait ${ring} ${active ? "z-10 border-slate-200/80 border-b-white bg-white font-semibold text-slate-900 shadow-[0_-2px_6px_-3px_rgba(15,23,42,0.08)]" : "border-transparent bg-transparent font-medium text-slate-500 hover:bg-slate-200/40 hover:text-slate-800"}`}>
        <span className="truncate">{children}</span>
        {count !== undefined && <span className={`min-w-5 shrink-0 rounded-md px-1.5 py-px text-center text-[10.5px] font-bold tabular-nums transition-colors ${active ? "bg-blue-600 text-white" : "bg-slate-200/70 text-slate-500"}`}>{count}</span>}
    </button>;
}

const shortUnits = [["y", 31536000], ["mo", 2592000], ["w", 604800], ["d", 86400], ["h", 3600], ["m", 60]];
/** Messenger-style age ("5d", "8h"); the full timestamp stays in the tooltip. */
function ShortAgo({ value }) {
    const date = value && new Date(value);
    if (!date || Number.isNaN(date.getTime())) return null;
    const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
    const [unit, size] = shortUnits.find(([, n]) => seconds >= n) || [];
    return <time dateTime={value} title={stamp(value)}>{unit ? `${Math.floor(seconds / size)}${unit}` : "now"}</time>;
}

/** Shown the instant a report is clicked: its known title over the app's loading spinner, until the data lands. */
function WorkspaceSkeleton({ report }) {
    return <div role="status" className="flex min-w-0 flex-1 animate-fade-in flex-col duration-100">
        <span className="sr-only">Loading report…</span>
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-2.5">
            <span className="h-8 w-8 shrink-0 rounded-full bg-blue-600 opacity-80" />
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{report?.title || "Untitled report"}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{report?.reference_code}</p>
            </div>
        </div>
        <div className="grid min-h-64 flex-1 place-items-center"><LoadingDots /></div>
    </div>;
}

/**
 * ONE REQUEST IN FLIGHT AT A TIME, ON PURPOSE.
 *
 * Inertia does NOT cancel a superseded `router.get`, and it applies whichever
 * response arrives last. So two rapid tab switches could land out of order and
 * paint the older, already-abandoned failure over the newer success - which is
 * exactly the "stale error after switching tabs" symptom. Serializing here means
 * a second switch is ignored while one is in flight, so only one response is ever
 * in a position to be applied. This changes no authorization and no data.
 */
export default function Index({ reports = [], counts = {}, allowedTypes = [], filters = {}, pagination = {}, loadError = null, selected = null }) {
    const [loading, setLoading] = useState(false);
    const [opening, setOpening] = useState(null);
    const [pendingType, setPendingType] = useState(null);
    const [query, setQuery] = useState(filters.q || "");
    const [notice, setNotice] = useState(null);
    const inFlight = useRef(false);
    const reportInFlight = useRef(false);
    const queued = useRef(null);
    const queuedVisit = useRef(null);
    // The server always sends a status; a missing one means nothing was filtered.
    const status = filters.status || "all";
    const support = filters.type === "application_support";
    const sort = filters.sort || "date";
    const dir = filters.dir || (sort === "date" ? "desc" : "asc");
    const listVisit = (changes) => ["/diagnostics", { ...filters, page: 1, ...changes }];
    // A list change asked for while a report is still loading is queued (latest
    // wins) and runs when that load lands, instead of being silently dropped.
    const visit = (changes) => {
        if (changes.type) setPendingType(changes.type);
        if (inFlight.current) { queuedVisit.current = changes; return; }
        inFlight.current = true;
        setLoading(true);
        setNotice(null);
        router.get("/diagnostics", listVisit(changes)[1], {
            preserveState: true, preserveScroll: true,
            onFinish: () => { inFlight.current = false; setLoading(false); setPendingType(null); runQueuedVisit(); },
        });
    };
    const runQueuedVisit = () => {
        const next = queuedVisit.current;
        queuedVisit.current = null;
        if (next) { visit(next); return true; }
        return false;
    };
    // Every inbox switch costs several remote round trips, so the other inbox is
    // loaded quietly in the background (and again on hover) and the switch then
    // lands from cache. Fresh for 30s; up to 5 min it still opens instantly while a
    // fresh copy loads behind it. Cached copies are flushed when a report is handled.
    const prefetchType = (type) => {
        if (type === filters.type || loadError) return;
        const [url, data] = listVisit({ type });
        router.prefetch(url, { data, preserveState: true, preserveScroll: true }, { cacheFor: ["30s", "5m"] });
    };
    const filterKey = JSON.stringify(filters);
    useEffect(() => { allowedTypes.forEach(prefetchType); }, [filterKey]); // eslint-disable-line react-hooks/exhaustive-deps
    // Opens (or, with null, closes) a report beside the list. Only `selected` is
    // reloaded; the server applies the same authorization as the report page.
    // The pane switches immediately (`opening`), so the click never feels stuck.
    // A pick made while another report is still loading (arrowing quickly) is
    // queued, latest wins, and opens when that load lands - still one request at a time.
    // `nextNotice` is only passed by auto-advance; any other open clears the notice.
    const reportVisit = (id) => ["/diagnostics", { ...filters, report: id || undefined }];
    const openReport = (report, nextNotice = null) => {
        if (inFlight.current) {
            if (reportInFlight.current) { queued.current = { report }; setOpening(report || false); setNotice(null); }
            return;
        }
        inFlight.current = reportInFlight.current = true;
        setOpening(report || false);
        setNotice(nextNotice);
        router.get(...reportVisit(report?.id), {
            only: ["selected"], preserveState: true, preserveScroll: true,
            onFinish: () => {
                inFlight.current = reportInFlight.current = false;
                const next = queued.current;
                queued.current = null;
                // A queued list change wins: it replaces the list (and closes the report) anyway.
                if (runQueuedVisit()) setOpening(null);
                else if (next && next.report?.id !== report?.id) openReport(next.report);
                else setOpening(null);
            },
        });
    };
    // After a clean Resolve / Won't fix: open the next report that still needs an
    // answer - below the answered one first, then above it - as long as the
    // refreshed list still holds it and it is still open. Otherwise stay put.
    // `reports` here is the list as it was when the report was answered; `freshProps` the reloaded one.
    const advanceFrom = (handled, outcome, freshProps) => {
        // The officer already moved on (or is moving): never override their choice.
        if (inFlight.current || freshProps?.selected?.report?.id !== handled.id) return;
        const at = reports.findIndex(r => r.id === handled.id);
        const order = at === -1 ? reports : [...reports.slice(at + 1), ...reports.slice(0, at).reverse()];
        const fresh = new Map((freshProps?.reports || []).map(r => [r.id, r]));
        const next = order.map(r => fresh.get(r.id)).find(r => r && r.id !== handled.id && isOpen(r));
        if (next) openReport(next, { reference: handled.reference_code || "The report", outcome: outcome === "resolved" ? "resolved" : "closed as won’t fix" });
    };
    // ↑/↓ on a focused report moves to the neighbouring one and, on wide screens, opens it.
    const moveWithArrows = (event) => {
        if (!["ArrowDown", "ArrowUp"].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        const rows = [...event.currentTarget.querySelectorAll("a[data-report]")];
        const at = rows.indexOf(document.activeElement);
        if (at === -1) return;
        event.preventDefault();
        const row = rows[at + (event.key === "ArrowDown" ? 1 : -1)];
        if (!row) return;
        row.focus();
        const report = reports.find(r => r.id === row.dataset.report);
        if (report && report.id !== openId && wide()) openReport(report);
    };
    // Hovering a report starts loading it, so most clicks open from cache.
    const preload = (report) => {
        if (report.id === openId || !wide()) return;
        const [url, data] = reportVisit(report.id);
        router.prefetch(url, { data, only: ["selected"], preserveState: true, preserveScroll: true }, { cacheFor: "20s" });
    };
    const shown = selected?.report;
    const openId = opening ? opening.id : opening === false ? null : shown?.id;
    const clearSearch = () => { setQuery(""); visit({ q: "" }); };
    const meta = (report) => support
        ? [report.context?.resolved ? report.context.application.reference_number : "Application context unavailable",
            report.context?.resolved && report.context.application.applicant_name,
            report.support_category_label]
        : [report.module];
    // Wide screens open the clicked report beside the list; narrower screens (and
    // modified clicks, e.g. open-in-new-tab) keep the link's normal navigation.
    const pick = (event, report) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !wide()) return;
        event.preventDefault();
        if (report.id !== openId) openReport(report);
    };
    // The clicked inbox highlights and titles the list immediately, before the data lands.
    const activeType = pendingType || filters.type;
    const switching = Boolean(pendingType) && pendingType !== filters.type;
    const typeLabel = typeLabels[activeType] || typeLabels[allowedTypes[0]] || "Application Support";
    // Status has no chip: the filter icon's dot and tooltip already show it.
    const chips = [
        filters.q && [`“${filters.q}”`, clearSearch],
        filters.application && ["One application", () => visit({ application: "" })],
    ].filter(Boolean);
    const sortValue = `${sort}:${dir}`;
    const statusLabel = (statusOptions.find(([key]) => key === status) || statusOptions[2])[1];
    const sortLabel = (sorts.find(([value]) => value === sortValue) || sorts[0])[1];

    return <ReportShell fill>
        <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_48px_-24px_rgba(15,23,42,0.18)] lg:min-h-0 lg:flex-1 lg:flex-row">

            {/* —— INBOX: report types, filters and the list, in one mail-style column —— */}
            {/* Below xl a click navigates to the report page instead, so the column takes the full width. */}
            <section aria-labelledby="report-list-title" className={`${openId ? "hidden xl:flex" : "flex"} min-w-0 flex-1 flex-col border-slate-200/70 lg:min-h-0 xl:w-[27rem] xl:flex-none xl:border-r 2xl:w-[28rem]`}>
                <header className={`shrink-0 border-b border-slate-200/80 bg-slate-50 px-5 pt-5 ${allowedTypes.length > 1 ? "" : "pb-4"}`}>
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <h1 className="text-[19px] font-bold leading-tight tracking-[-0.03em] text-slate-900">Support Desk</h1>
                            {/* With one inbox there is no tab bar, so its name shows here instead. */}
                            <h2 id="report-list-title" className={allowedTypes.length > 1 ? "sr-only" : "mt-0.5 text-xs font-medium text-slate-500"}>{typeLabel}</h2>
                            {/* The count is announced, not shown. */}
                            <span className="sr-only" aria-live="polite">{loading ? "Loading…" : !loadError ? `${pagination.total ?? 0} ${pagination.total === 1 ? "report" : "reports"}` : ""}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                        {/* Compact search beside the title; widens while in use. */}
                        <form role="search" className="w-36 min-w-0 transition-[width] duration-300 ease-out focus-within:w-44 motion-reduce:transition-none" onSubmit={e => { e.preventDefault(); visit({ q: query.trim() }); }}>
                            <label htmlFor="report-search" className="sr-only">Search reports by {support ? "reference or applicant" : "reference or module"}</label>
                            <div className="group relative">
                                <Icon d={paths.search} className="pointer-events-none absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-slate-500 transition-colors group-hover:text-slate-700 group-focus-within:text-blue-600" width={2.5} />
                                <input id="report-search" type="search" value={query} maxLength={100} onChange={e => setQuery(e.target.value)} disabled={loading}
                                    placeholder="Search…" title={support ? "Search reference, applicant…" : "Search reference, module…"}
                                    className="h-8 w-full rounded-full border-0 bg-gradient-to-b from-white to-slate-50 py-1 pl-[34px] pr-3 text-[13px] font-semibold tracking-[-0.01em] text-slate-900 shadow-[inset_0_1px_0_#fff,0_1px_2px_rgba(15,23,42,0.08),0_0_0_1px_rgba(15,23,42,0.1)] transition-all duration-300 ease-out placeholder:font-medium placeholder:text-slate-500 hover:shadow-[inset_0_1px_0_#fff,0_3px_10px_-3px_rgba(15,23,42,0.18),0_0_0_1px_rgba(15,23,42,0.16)] focus:bg-white focus:from-white focus:to-white focus:outline-none focus:ring-0 focus:shadow-[0_0_0_1px_rgba(37,99,235,0.6),0_0_0_4px_rgba(59,130,246,0.14),0_6px_16px_-6px_rgba(37,99,235,0.35)] disabled:cursor-wait motion-reduce:transition-none" />
                            </div>
                            <button type="submit" className="sr-only">Search</button>
                        </form>
                        {/* Icon-only filter and sort: a real native select laid invisibly over each
                            icon, so keyboard and screen readers still get a normal labelled dropdown.
                            The blue dot marks a non-default choice; the tooltip names the current one. */}
                        {[["report-status", "Filter by status", paths.filter, statusLabel, status !== "all", status, value => visit({ status: value }), statusOptions],
                          ["report-sort", "Sort reports", paths.sort, sortLabel, sortValue !== "date:desc", sortValue, value => { const [column, order] = value.split(":"); visit({ sort: column, dir: order }); }, sorts],
                        ].map(([id, label, icon, current, changed, value, change, options]) =>
                            <div key={id} title={`${label}: ${current}`}
                                className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-b from-white to-slate-50 text-slate-500 shadow-[inset_0_1px_0_#fff,0_1px_2px_rgba(15,23,42,0.08),0_0_0_1px_rgba(15,23,42,0.1)] transition-all duration-300 hover:text-slate-900 hover:shadow-[inset_0_1px_0_#fff,0_3px_10px_-3px_rgba(15,23,42,0.18),0_0_0_1px_rgba(15,23,42,0.16)] focus-within:text-blue-600 focus-within:shadow-[0_0_0_1px_rgba(37,99,235,0.6),0_0_0_4px_rgba(59,130,246,0.14)] motion-reduce:transition-none">
                                <Icon d={icon} className="pointer-events-none h-[15px] w-[15px]" width={2.2} />
                                {changed && <span aria-hidden="true" className="pointer-events-none absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-blue-600 ring-2 ring-slate-50" />}
                                <label htmlFor={id} className="sr-only">{label}</label>
                                <select id={id} value={value} disabled={loading} onChange={e => change(e.target.value)}
                                    className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full text-[13px] opacity-0 disabled:cursor-wait">
                                    {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
                                </select>
                            </div>)}
                        </div>
                    </div>
                    {/* Folder tabs overlap the header's bottom border so the open one joins the list. */}
                    {allowedTypes.length > 1 && <nav aria-label="Report types" className="-mb-px mt-4 flex gap-1">{allowedTypes.map(type =>
                        <RailItem key={type} active={activeType === type} aria-current={activeType === type ? "page" : undefined} disabled={loading} onMouseEnter={() => prefetchType(type)} onFocus={() => prefetchType(type)} onClick={() => type !== filters.type && visit({ type })} count={loadError ? "—" : counts[type] ?? 0}>{typeLabels[type]}</RailItem>)}</nav>}
                </header>

                {chips.length > 0 && <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-slate-100 bg-slate-50/50 px-4 py-2">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400"><Icon d={paths.filter} className="h-3.5 w-3.5" />Filters</span>
                    {chips.map(([label, remove]) =>
                        <span key={label} className="inline-flex h-7 max-w-[14rem] items-center gap-1 rounded-full bg-blue-50 pl-2.5 pr-1 text-xs font-semibold text-blue-800 ring-1 ring-inset ring-blue-200">
                            <span className="truncate">{label}</span>
                            <button type="button" disabled={loading} onClick={remove} aria-label={`Remove filter ${label}`} className={`grid h-6 w-6 place-items-center rounded-full text-blue-500 hover:bg-blue-100 hover:text-blue-900 ${ring}`}><Icon d={paths.x} className="h-3.5 w-3.5" width={2.2} /></button>
                        </span>)}
                </div>}

                <div className={`custom-scrollbar transition-opacity lg:min-h-0 lg:flex-1 lg:overflow-y-auto ${loading && !switching ? "opacity-60" : ""}`} aria-busy={loading || switching}>
                    {/* Switching inbox: placeholder rows, never the other inbox's reports under the new tab. */}
                    {switching
                        ? <ul aria-hidden="true" className="space-y-px p-2 animate-fade-in duration-100">{[0, 1, 2, 3].map(i =>
                            <li key={i} className="flex items-start gap-3 px-3 py-2.5 motion-safe:animate-pulse">
                                <span className="mt-0.5 h-9 w-9 shrink-0 rounded-full bg-slate-200/80" />
                                <span className="min-w-0 flex-1 space-y-2 pt-1">
                                    <span className="flex justify-between gap-3"><span className="h-3 w-2/5 rounded bg-slate-200/80" /><span className="h-2.5 w-6 rounded bg-slate-100" /></span>
                                    <span className="block h-2.5 w-4/5 rounded bg-slate-100" />
                                    <span className="flex justify-between gap-3"><span className="h-2.5 w-1/3 rounded bg-slate-100" /><span className="h-3.5 w-16 rounded-full bg-slate-100" /></span>
                                </span>
                            </li>)}</ul>
                        : loadError
                        ? <div role="alert" className="m-4 rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800"><p>{loadError}</p><button className={`${control} mt-3`} onClick={() => visit({})} disabled={loading}>Try again</button></div>
                        : reports.length === 0
                            ? <div className="px-6 py-14 text-center">{filters.q
                                ? <><h3 className="font-semibold text-slate-900">No reports match “{filters.q}”.</h3><p className="mt-2 text-sm text-slate-500">Check the spelling or search by reference number.</p><button type="button" className={`${control} mt-4`} disabled={loading} onClick={clearSearch}>Clear search</button></>
                                : status === "open"
                                ? <><span aria-hidden="true" className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-100"><Icon d={paths.check} className="h-5 w-5" width={2.2} /></span>
                                    <h3 className="mt-3 font-semibold text-slate-900">You’re all caught up</h3><p className="mt-1.5 text-sm text-slate-500">{support ? "No Application Support requests need" : "No technical issues need"} a response right now.</p>
                                    <button type="button" className={`${control} mt-4`} disabled={loading} onClick={() => visit({ status: "all" })}>Show all reports</button></>
                                : <><h3 className="font-semibold text-slate-900">{support ? "No support reports for this selection." : "No technical issues reported."}</h3><p className="mt-2 text-sm text-slate-500">{support ? "Application Support requests will appear here when they are available to you." : "Try another status filter or check again later."}</p></>}</div>
                            : <ul className="space-y-px p-2" onKeyDown={moveWithArrows}>{reports.map((report, index) => {
                                const blocking = report.blocks_field_work === true;
                                const closed = !isOpen(report);
                                const active = openId === report.id;
                                // Reference and context leave the row for the summary line; they stay
                                // on hover and are read out to screen readers.
                                const reporter = report.inspector?.resolved ? report.inspector.label : "Unknown inspector";
                                const details = [report.reference_code || "Unreferenced", ...meta(report), `Reported by ${reporter}`].filter(Boolean).join(" · ");
                                // The reporter's name shows only where it changes from the row above; it stays in the tooltip and for screen readers.
                                const prev = reports[index - 1];
                                const sameReporter = prev && (prev.inspector?.resolved ? prev.inspector.label : "Unknown inspector") === reporter;
                                // Rows arrive in a quick cascade (capped, so long lists never wait).
                                return <li key={report.id} className="animate-in fade-in slide-in-from-bottom-1 duration-300" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
                                    <Link href={`/diagnostics/${report.id}`} title={details} data-report={report.id} onClick={e => pick(e, report)} onMouseEnter={() => preload(report)} onFocus={() => preload(report)} aria-current={active ? "true" : undefined}
                                        className={`group relative flex items-start gap-3 overflow-hidden rounded-lg px-3 py-2.5 transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 ${active ? "bg-blue-50/70 before:absolute before:inset-y-2.5 before:left-0 before:w-[2px] before:rounded-r-full before:bg-blue-600" : "hover:bg-slate-50"}`}>
                                        <TypeTile report={report} />
                                        {/* Mail-style row: what and when, then the inspector's own first line, then who (when it changes) and its state. */}
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-1.5">
                                                <span className={`truncate text-[13.5px] ${closed ? "font-normal text-slate-500" : "font-medium text-slate-900"}`}>{report.title || "Untitled report"}</span>
                                                <span className="ml-auto shrink-0 pl-2 text-[11px] tabular-nums text-slate-400"><ShortAgo value={support ? report.created_at : report.occurred_at || report.created_at} /></span>
                                            </span>
                                            <span className={`mt-0.5 block truncate text-xs ${!report.preview ? "italic text-slate-400" : closed ? "text-slate-400" : "text-slate-600"}`}>{report.preview || "No summary provided"}</span>
                                            <span className="mt-1 flex items-center gap-1.5">
                                                <span className="min-w-0 flex-1 truncate text-[11px] text-slate-400"><span className={sameReporter ? "sr-only" : ""}>{reporter}</span></span>
                                                <span className="sr-only">, {details}, status:</span>
                                                {blocking && <span className="shrink-0 text-[10.5px] font-semibold text-red-600">Blocks field work</span>}
                                                <RowStatus status={report.status} />
                                            </span>
                                        </span>
                                    </Link>
                                </li>;
                            })}</ul>}
                </div>

                {!loadError && pagination.last > 1 && <nav aria-label="Report pagination" className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 px-4 py-3"><button className={control} disabled={loading || pagination.page <= 1} onClick={() => visit({ page: pagination.page - 1 })}>Previous</button><span className="text-[13px] text-slate-600">Page {pagination.page} of {pagination.last}</span><button className={control} disabled={loading || pagination.page >= pagination.last} onClick={() => visit({ page: pagination.page + 1 })}>Next</button></nav>}
            </section>

            {/* —— READING PANE: the open report, the same conversation + details as the report page —— */}
            <section aria-label={openId ? `Report ${(shown?.id === openId ? shown : opening)?.reference_code || ""}`.trim() : "Report"} className={`${openId ? "flex" : "hidden xl:flex"} min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0`}>
                {!openId
                    ? <div className="flex flex-1 flex-col items-center justify-center bg-slate-50/40 px-8 text-center">
                        <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-slate-400 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_8px_20px_-10px_rgba(15,23,42,0.2)] ring-1 ring-inset ring-slate-200/70"><Icon d={paths.inbox} className="h-5 w-5" /></span>
                        <p className="mt-4 text-sm font-semibold text-slate-900">Select a report</p>
                        <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-slate-500">Inspector-submitted reports from FieldSync. Pick one from the list to review it and respond.</p>
                        <p className="mt-4 inline-flex items-center gap-1.5 text-[11px] text-slate-400">Tip: open one, then use <kbd className="rounded border border-slate-200 bg-white px-1 font-sans text-[10px] text-slate-500 shadow-[0_1px_0_rgba(15,23,42,0.06)]">↑</kbd><kbd className="rounded border border-slate-200 bg-white px-1 font-sans text-[10px] text-slate-500 shadow-[0_1px_0_rgba(15,23,42,0.06)]">↓</kbd> to move between reports</p>
                    </div>
                    : <>
                        {/* Always mounted, so screen readers announce the notice when it appears. */}
                        <div role="status" className="shrink-0">{notice && <p className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-4 py-1.5 text-xs text-emerald-800">
                            <Icon d={paths.check} className="h-3.5 w-3.5 shrink-0 text-emerald-600" width={2.5} />
                            <span className="min-w-0 flex-1"><strong className="font-semibold tabular-nums">{notice.reference}</strong> {notice.outcome}. Showing the next open report.</span>
                            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-emerald-600 hover:bg-emerald-100 hover:text-emerald-900 ${ring}`}><Icon d={paths.x} className="h-3.5 w-3.5" width={2.2} /></button>
                        </p>}</div>
                        {shown?.id === openId
                            ? <div key={openId} className="report-reveal flex min-w-0 flex-1 flex-col lg:min-h-0 lg:flex-row">
                                <ReportWorkspace {...selected} reload={["selected", "reports", "counts", "pagination"]} onClose={() => openReport(null)} onHandled={(outcome, fresh) => advanceFrom(shown, outcome, fresh)} />
                            </div>
                            : <WorkspaceSkeleton report={opening} />}
                    </>}
            </section>
        </div>
    </ReportShell>;
}
