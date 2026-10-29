import { useState, useMemo, useRef, useEffect } from "react";
import { getStatusMarkerConfig } from "@/Components/MapLayers/StatusPanel";

// Attribute table for the Application Tracking layer, docked under the map
// like QGIS's: one row per feature, sortable columns, and a selection that
// is shared with the map (click a row to select it there, hover to find it).

const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "";

const COLUMNS = [
    { key: "reference_number", label: "Reference No.", width: 128, mono: true },
    { key: "form_number", label: "Form No.", width: 110, mono: true },
    { key: "applicant_name", label: "Applicant Name", width: 170 },
    { key: "application_type", label: "Application Type", width: 190 },
    { key: "barangay", label: "Barangay", width: 130 },
    { key: "status", label: "Status", width: 138 },
    { key: "created_at", label: "Date Filed", width: 100, format: fmtDate, numeric: true },
    { key: "__tct", label: "Tax Dec. No.", width: 132, mono: true },
];
const ROW_NO_WIDTH = 40;
const TABLE_WIDTH = ROW_NO_WIDTH + COLUMNS.reduce((sum, c) => sum + c.width, 0);

const MIN_H = 120;
// About five rows, so the map stays the main view.
export const TABLE_DEFAULT_H = 196;
const DEFAULT_H = TABLE_DEFAULT_H;
const BAR_H = 44;

// `summary` is the plain sentence the collapsed bar shows. Each new
// `collapseKey` (a newly picked barangay) folds the table back to that bar.
export default function AttributeTable({ apps = [], total = 0, selectedAppId, onSelect, onHover, onZoomToSelected, onHeightChange, onCollapse, title = "applications", summary = "", startCollapsed = false, collapseKey = "", resetHeightKey = 0 }) {
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState({ key: "created_at", dir: "desc" });
    const [height, setHeight] = useState(DEFAULT_H);
    const [collapsed, setCollapsed] = useState(startCollapsed);
    const bodyRef = useRef(null);

    const firstKey = useRef(true);
    useEffect(() => {
        if (firstKey.current) { firstKey.current = false; return; }
        if (collapseKey) setCollapsed(true);
    }, [collapseKey]);

    // Back to the standard height when the side panel returns, so both fit.
    useEffect(() => {
        if (resetHeightKey) setHeight(DEFAULT_H);
    }, [resetHeightKey]);

    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        const withDerived = apps.map((a) => ({
            ...a,
            __tct: a.parcels?.[0]?.tax_dec_number || "",
        }));
        const filtered = q
            ? withDerived.filter((a) =>
                  [a.reference_number, a.form_number, a.applicant_name, a.barangay, a.application_type, a.status, a.__tct].some((v) => String(v || "").toLowerCase().includes(q))
              )
            : withDerived;
        const dir = sort.dir === "asc" ? 1 : -1;
        return [...filtered].sort((x, y) => {
            const a = x[sort.key];
            const b = y[sort.key];
            if (a == null || a === "") return 1;
            if (b == null || b === "") return -1;
            if (sort.key === "created_at") return (new Date(a) - new Date(b)) * dir;
            if (typeof a === "number" && typeof b === "number") return (a - b) * dir;
            return String(a).localeCompare(String(b), undefined, { numeric: true }) * dir;
        });
    }, [apps, query, sort]);

    // Keep the selected feature in view when it is picked on the map.
    useEffect(() => {
        if (selectedAppId == null || !bodyRef.current) return;
        bodyRef.current.querySelector(`[data-app-id="${selectedAppId}"]`)?.scrollIntoView({ block: "nearest" });
    }, [selectedAppId]);

    // Drag the top edge to trade map space for table space.
    const startResize = (e) => {
        e.preventDefault();
        const startY = e.clientY;
        const startH = height;
        const max = Math.round(window.innerHeight * 0.6);
        const move = (ev) => setHeight(Math.min(max, Math.max(MIN_H, startH + (startY - ev.clientY))));
        const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };

    const toggleSort = (key) =>
        setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "created_at" ? "desc" : "asc" }));

    const selectedVisible = rows.some((r) => r.id === selectedAppId);

    // The map frames selections clear of whatever the table covers.
    useEffect(() => {
        onHeightChange?.(collapsed ? BAR_H : height);
        return () => onHeightChange?.(0);
    }, [collapsed, height]);

    return (
        <section
            className={collapsed
                ? "flex flex-col pointer-events-none"
                : "pointer-events-auto flex flex-col bg-white border-t border-slate-300 shadow-[0_-6px_16px_rgba(15,23,42,0.10)]"}
            style={{ height: collapsed ? undefined : height }}
            aria-label="Applications attribute table"
        >
            {!collapsed && (
                <div
                    onPointerDown={startResize}
                    className="h-1.5 -mt-[3px] cursor-row-resize hover:bg-[#0b2a5b]/20 shrink-0"
                    role="separator"
                    aria-orientation="horizontal"
                    aria-label="Resize attribute table"
                />
            )}

            {/* Collapsed: a small button floating at the bottom centre of the map, clear of the scale bar. */}
            {collapsed && (
                <button
                    type="button"
                    onClick={() => setCollapsed(false)}
                    aria-expanded={false}
                    title={summary ? `${total} ${summary}` : undefined}
                    className="pointer-events-auto mb-3 self-center inline-flex items-center gap-2 h-8 pl-3 pr-2 rounded-full bg-white border border-slate-200 shadow-md text-[12px] font-semibold text-[#0b2a5b] hover:bg-slate-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0b2a5b]"
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
                    </svg>
                    Show applications
                    <span className="min-w-5 h-5 px-1.5 rounded-full bg-[#0b2a5b] text-white text-[10.5px] tabular-nums leading-5 text-center">{total}</span>
                </button>
            )}

            {/* Title bar */}
            {!collapsed && <div className="shrink-0 flex items-center gap-2 h-7 pl-3 pr-1 bg-[#e6e9ee] border-b border-slate-300 text-[11.5px] text-slate-700">
                <span className="font-semibold text-slate-800">{title}</span>
                <span className="text-slate-500 tabular-nums truncate">
                    — Features Total: {total}, Filtered: {rows.length}, Selected: {selectedVisible ? 1 : 0}
                </span>
                <button
                    type="button"
                    onClick={() => {
                        onCollapse?.();
                        setCollapsed(true);
                    }}
                    aria-expanded={true}
                    className="ml-auto shrink-0 inline-flex items-center gap-1 px-2 h-6 rounded-[3px] text-[11px] font-semibold text-[#0b2a5b] hover:bg-white cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0b2a5b]"
                >
                    Hide list
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </button>
            </div>}

            {!collapsed && (
                <>
                    {/* Toolbar */}
                    <div className="shrink-0 flex items-center gap-2 h-8 px-2 border-b border-slate-200 bg-[#f5f6f8]">
                        <div className="relative w-64">
                            <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m0 0A7.5 7.5 0 105.2 5.2a7.5 7.5 0 0010.6 10.6z" />
                            </svg>
                            <label className="sr-only" htmlFor="attr-search">Filter features</label>
                            <input
                                id="attr-search"
                                type="search"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Filter features…"
                                className="w-full py-0.5 pl-7 pr-2 text-[12px] leading-5 bg-white border border-slate-300 rounded-[3px] placeholder-slate-400 focus:outline-none focus:border-[#0b2a5b] focus:ring-1 focus:ring-[#0b2a5b]"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={onZoomToSelected}
                            disabled={!selectedVisible}
                            className="h-6 px-2 rounded-[3px] border border-slate-300 bg-white text-[11.5px] text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                            Zoom to selected
                        </button>
                        <span className="ml-auto text-[11px] text-slate-500">Click a row to select it on the map</span>
                    </div>

                    {/* Table */}
                    <div ref={bodyRef} className="flex-1 min-h-0 overflow-auto" onMouseLeave={() => onHover?.(null)}>
                        <table
                            className="border-collapse text-[12px] text-slate-800 tabular-nums"
                            style={{ tableLayout: "fixed", width: TABLE_WIDTH, minWidth: "100%" }}
                        >
                            <colgroup>
                                <col style={{ width: ROW_NO_WIDTH }} />
                                {COLUMNS.map((c) => (
                                    <col key={c.key} style={{ width: c.width }} />
                                ))}
                            </colgroup>
                            <thead className="sticky top-0 z-[1]">
                                <tr className="bg-[#eef0f3]">
                                    <th className="sticky left-0 z-[2] bg-[#eef0f3] border-r border-b border-slate-300" aria-label="Row" />
                                    {COLUMNS.map((c) => {
                                        const active = sort.key === c.key;
                                        return (
                                            <th
                                                key={c.key}
                                                scope="col"
                                                aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                                                className="p-0 border-r border-b border-slate-300 font-normal text-left"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSort(c.key)}
                                                    className="w-full flex items-center justify-between gap-1 px-2 py-1 text-[11.5px] text-slate-700 hover:bg-slate-200/70 cursor-pointer"
                                                >
                                                    <span className="truncate">{c.label}</span>
                                                    {active && <span className="text-[9px] text-slate-500" aria-hidden="true">{sort.dir === "asc" ? "▲" : "▼"}</span>}
                                                </button>
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.length === 0 && (
                                    <tr>
                                        <td colSpan={COLUMNS.length + 1} className="px-3 py-6 text-center text-slate-500">
                                            No features match the filter.
                                        </td>
                                    </tr>
                                )}
                                {rows.map((app, i) => {
                                    const selected = app.id === selectedAppId;
                                    const cfg = getStatusMarkerConfig(app.status);
                                    return (
                                        <tr
                                            key={app.id}
                                            data-app-id={app.id}
                                            onClick={() => onSelect?.(app)}
                                            onMouseEnter={() => onHover?.(app.id)}
                                            aria-selected={selected}
                                            className={`cursor-pointer ${selected ? "bg-[#cfe0f7]" : i % 2 ? "bg-[#f8f9fb]" : "bg-white"} hover:bg-[#e6effa]`}
                                        >
                                            <td
                                                className={`sticky left-0 px-2 text-right text-[11px] border-r border-b border-slate-300 ${
                                                    selected ? "bg-[#9fc0ec] text-slate-900" : "bg-[#eef0f3] text-slate-500"
                                                }`}
                                            >
                                                {i + 1}
                                            </td>
                                            {COLUMNS.map((c) => {
                                                const raw = app[c.key];
                                                const value = c.format ? c.format(raw) : raw;
                                                return (
                                                    <td
                                                        key={c.key}
                                                        className={`px-2 py-[3px] border-r border-b border-slate-200 whitespace-nowrap overflow-hidden text-ellipsis ${
                                                            c.mono ? "font-mono text-[11.5px]" : ""
                                                        } ${c.numeric ? "text-right" : ""}`}
                                                        title={value != null ? String(value) : ""}
                                                    >
                                                        {c.key === "status" ? (
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <span className="w-2 h-2 rounded-[1px] shrink-0" style={{ backgroundColor: cfg.color }} aria-hidden="true" />
                                                                {cfg.label}
                                                            </span>
                                                        ) : value === null || value === undefined || value === "" ? (
                                                            <span className="text-slate-400 italic">NULL</span>
                                                        ) : (
                                                            value
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </section>
    );
}
