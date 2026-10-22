import { useState, useMemo, useEffect } from "react";

// Locational clearance records for the selected barangay, in a dialog over the
// map: one row per filing, sortable columns, a filter box. The side panel only
// shows the count and opens this.

const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "";
const fmtArea = (n) => (n ? Number(n).toLocaleString("en-PH", { maximumFractionDigits: 2 }) : "");

const COLUMNS = [
    { key: "reference_number", label: "Reference No.", width: 130, mono: true },
    { key: "applicant_name", label: "Applicant Name", width: 220 },
    { key: "target_land_use_class", label: "Land Use", width: 130 },
    { key: "purpose", label: "Purpose", width: 230 },
    { key: "lot_area_sqm", label: "Lot Area (sqm)", width: 120, format: fmtArea, numeric: true },
    { key: "created_at", label: "Date Filed", width: 110, format: fmtDate, numeric: true },
];
const ROW_NO_WIDTH = 40;
const TABLE_WIDTH = ROW_NO_WIDTH + COLUMNS.reduce((sum, c) => sum + c.width, 0);

export default function LcRecordsTable({ barangay, quarter, records = [], onClose }) {
    const [scope, setScope] = useState("quarter");
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState({ key: "created_at", dir: "desc" });

    useEffect(() => { setScope("quarter"); setQuery(""); }, [barangay]);

    // Escape closes the dialog.
    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const inQuarter = useMemo(() => {
        if (!quarter) return [];
        return records.filter((r) => {
            const d = r.created_at ? new Date(r.created_at) : null;
            return d && !isNaN(d.getTime()) && d.getFullYear() === quarter.year && Math.floor(d.getMonth() / 3) + 1 === quarter.quarter;
        });
    }, [records, quarter]);
    const base = scope === "quarter" ? inQuarter : records;

    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        const filtered = q
            ? base.filter((r) => [r.reference_number, r.applicant_name, r.target_land_use_class, r.purpose].some((v) => String(v || "").toLowerCase().includes(q)))
            : base;
        const dir = sort.dir === "asc" ? 1 : -1;
        return [...filtered].sort((x, y) => {
            const a = x[sort.key];
            const b = y[sort.key];
            if (a == null || a === "") return 1;
            if (b == null || b === "") return -1;
            if (sort.key === "created_at") return (new Date(a) - new Date(b)) * dir;
            if (sort.key === "lot_area_sqm") return (Number(a) - Number(b)) * dir;
            return String(a).localeCompare(String(b), undefined, { numeric: true }) * dir;
        });
    }, [base, query, sort]);

    const toggleSort = (key) =>
        setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "created_at" || key === "lot_area_sqm" ? "desc" : "asc" }));

    const seg = (id, label, n) => (
        <button
            type="button"
            onClick={() => setScope(id)}
            aria-pressed={scope === id}
            className={`h-7 px-3 text-[12px] font-semibold cursor-pointer rounded-[4px] ${scope === id ? "bg-white text-[#0b2a5b] shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
        >
            {label} <span className="tabular-nums font-normal text-slate-500">{n}</span>
        </button>
    );

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-8" role="presentation">
            <button type="button" aria-label="Close records" className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] cursor-default" onClick={onClose} />
            <section
                role="dialog"
                aria-modal="true"
                aria-label={`LC records for ${barangay}`}
                className="relative flex flex-col w-full max-w-[980px] max-h-[82vh] overflow-hidden rounded-xl bg-white ring-1 ring-slate-900/10 shadow-[0_24px_60px_rgba(15,23,42,0.35)]"
            >
                <header className="shrink-0 flex items-start gap-3 px-5 pt-4 pb-3">
                    <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Locational clearance records</div>
                        <h2 className="text-[17px] font-semibold text-slate-900 leading-tight truncate">{barangay}</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="ml-auto w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0b2a5b]"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                </header>

                <div className="shrink-0 flex flex-wrap items-center gap-2 px-5 pb-3">
                    <div className="flex gap-0.5 p-0.5 bg-slate-100 rounded-[6px]" role="group" aria-label="Which records">
                        {seg("quarter", quarter?.label || "This quarter", inQuarter.length)}
                        {seg("all", "All years", records.length)}
                    </div>
                    <div className="relative flex-1 min-w-[200px] max-w-[320px]">
                        <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m0 0A7.5 7.5 0 105.2 5.2a7.5 7.5 0 0010.6 10.6z" />
                        </svg>
                        <label className="sr-only" htmlFor="lc-records-search">Filter records</label>
                        <input
                            id="lc-records-search"
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Filter by applicant, reference, purpose…"
                            className="w-full h-8 pl-8 pr-2 text-[12.5px] bg-white border border-slate-300 rounded-[6px] placeholder-slate-400 focus:outline-none focus:border-[#0b2a5b] focus:ring-1 focus:ring-[#0b2a5b]"
                        />
                    </div>
                    <span className="ml-auto text-[11.5px] text-slate-500 tabular-nums">Showing {rows.length} of {records.length}</span>
                </div>

                <div className="flex-1 min-h-0 overflow-auto border-t border-slate-200">
                    <table className="border-collapse text-[12px] text-slate-800 tabular-nums" style={{ tableLayout: "fixed", width: TABLE_WIDTH, minWidth: "100%" }}>
                        <colgroup>
                            <col style={{ width: ROW_NO_WIDTH }} />
                            {COLUMNS.map((c) => <col key={c.key} style={{ width: c.width }} />)}
                        </colgroup>
                        <thead className="sticky top-0 z-[1]">
                            <tr className="bg-[#eef0f3]">
                                <th className="sticky left-0 z-[2] bg-[#eef0f3] border-r border-b border-slate-300" aria-label="Row" />
                                {COLUMNS.map((c) => {
                                    const active = sort.key === c.key;
                                    return (
                                        <th key={c.key} scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className="p-0 border-r border-b border-slate-300 font-normal text-left">
                                            <button type="button" onClick={() => toggleSort(c.key)} className="w-full flex items-center justify-between gap-1 px-2 py-1.5 text-[11.5px] text-slate-700 hover:bg-slate-200/70 cursor-pointer">
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
                                    <td colSpan={COLUMNS.length + 1} className="px-3 py-8 text-center text-slate-500">
                                        {records.length === 0 ? "No locational clearance records for this barangay." : "No records match."}
                                    </td>
                                </tr>
                            )}
                            {rows.map((r, i) => (
                                <tr key={r.id || `${r.reference_number}-${i}`} className={i % 2 ? "bg-[#f8f9fb]" : "bg-white"}>
                                    <td className="sticky left-0 px-2 text-right text-[11px] border-r border-b border-slate-300 bg-[#eef0f3] text-slate-500">{i + 1}</td>
                                    {COLUMNS.map((c) => {
                                        const raw = r[c.key];
                                        const value = c.format ? c.format(raw) : raw;
                                        return (
                                            <td
                                                key={c.key}
                                                className={`px-2 py-[5px] border-r border-b border-slate-200 whitespace-nowrap overflow-hidden text-ellipsis ${c.mono ? "font-mono text-[11.5px]" : ""} ${c.numeric ? "text-right" : ""}`}
                                                title={value != null ? String(value) : ""}
                                            >
                                                {value === null || value === undefined || value === "" ? <span className="text-slate-400 italic">NULL</span> : value}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
