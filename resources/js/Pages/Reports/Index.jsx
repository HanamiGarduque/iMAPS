import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { Head, Link } from "@inertiajs/react";
import Swal from "sweetalert2";
import axios from "axios";
import Chart from "chart.js/auto";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import { confirmSignOut } from "@/utils/signOut";

const APPLICATION_TYPES = ["All", "Locational Clearance", "Zoning Certificate", "Development Permit", "Preliminary Approval and Locational Clearance (PALC)"];

const COLUMNS = [
    { id: "reference_number", label: "Reference number" },
    { id: "date", label: "Date filed" },
    { id: "application_type", label: "Application type" },
    { id: "status", label: "Status" },
    { id: "name", label: "Owner name" },
    { id: "barangay", label: "Barangay" },
    { id: "land_use_class", label: "Land use class" },
    { id: "lot_area_sqm", label: "Lot area (sqm)" },
    { id: "building_area", label: "Building area (sqm)" },
    { id: "project_cost", label: "Project cost" },
    { id: "purpose", label: "Purpose" },
    { id: "assessment_fee", label: "Assessment fee" },
];

const CHART_TYPES = [
    { id: "bar_chart", label: "Bar" },
    { id: "horizontal_bar_chart", label: "Horizontal bar" },
    { id: "line_chart", label: "Line" },
    { id: "pie_chart", label: "Pie" },
    { id: "doughnut_chart", label: "Doughnut" },
];

const GROUP_BY = [
    { id: "barangay", label: "Barangay" },
    { id: "status", label: "Status" },
    { id: "application_type", label: "Application type" },
    { id: "land_use_class", label: "Land use class" },
    { id: "month", label: "Month" },
    { id: "year", label: "Year" },
];

const MEASURES = [
    { id: "count", label: "Number of applications" },
    { id: "sum_lot_area", label: "Total lot area (sqm)" },
    { id: "avg_lot_area", label: "Average lot area (sqm)" },
    { id: "sum_building_area", label: "Total building area (sqm)" },
    { id: "sum_project_cost", label: "Total project cost" },
    { id: "sum_fee", label: "Total assessment fees" },
];

// Paper sizes in millimetres (portrait).
const PAPER = { a4: [210, 297, "A4"], letter: [215.9, 279.4, "Letter"], legal: [215.9, 355.6, "Legal"] };
const MM = 96 / 25.4; // CSS px per mm
const PAGE_MARGIN = 12 * MM; // dompdf's default page margin is 1.2cm

// Local YYYY-MM-DD (toISOString would shift the date by the UTC offset).
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const RANGES = [
    { id: "all", label: "All time", range: () => ["", ""] },
    { id: "month", label: "This month", range: (t) => [ymd(new Date(t.getFullYear(), t.getMonth(), 1)), ymd(t)] },
    { id: "quarter", label: "This quarter", range: (t) => [ymd(new Date(t.getFullYear(), Math.floor(t.getMonth() / 3) * 3, 1)), ymd(t)] },
    { id: "year", label: "This year", range: (t) => [ymd(new Date(t.getFullYear(), 0, 1)), ymd(t)] },
    { id: "custom", label: "Custom" },
];

const DEFAULTS = {
    start_date: "",
    end_date: "",
    application_type: "All",
    barangay: "",
    variables: ["reference_number", "date", "application_type", "status", "name", "barangay", "land_use_class", "lot_area_sqm", "assessment_fee"],
    format: "pdf",
    presentation_style: "table",
    aggregation: "count",
    group_by: "barangay",
    document_size: "a4",
    orientation: "landscape",
};

// Ready-made reports. `range` is resolved to real dates when the template is applied.
const TEMPLATES = [
    { id: "monthly", label: "Monthly applications (chart)", range: "year", settings: { format: "pdf", presentation_style: "bar_chart", group_by: "month", aggregation: "count" } },
    { id: "barangay", label: "Applications by barangay", range: "year", settings: { format: "pdf", presentation_style: "horizontal_bar_chart", group_by: "barangay", aggregation: "count", orientation: "portrait" } },
    { id: "fees", label: "Fees collected by month", range: "year", settings: { format: "xlsx", presentation_style: "summary_table", group_by: "month", aggregation: "sum_fee" } },
    { id: "landuse", label: "Land use summary", range: "all", settings: { format: "pdf", presentation_style: "summary_table", group_by: "land_use_class", aggregation: "count", orientation: "portrait" } },
    { id: "full", label: "Full application list", range: "all", settings: { format: "xlsx", presentation_style: "table", variables: COLUMNS.map((c) => c.id) } },
];

const SETTINGS_KEY = "imaps_report_settings";
const RECENT_KEY = "imaps_recent_reports";

// Browser storage can be unavailable (private mode, blocked site data); the page still works without it.
const readStore = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
};
const writeStore = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* storage unavailable: settings just won't be remembered */
    }
};

const CHART_COLORS = ["#2563eb", "#60a5fa", "#1e40af", "#93c5fd", "#3b82f6", "#1d4ed8", "#bfdbfe", "#475569", "#94a3b8", "#0ea5e9", "#334155", "#7dd3fc"];

// Draws the chart in the browser and returns a PNG data URI. The same image is shown in the
// preview and embedded in the PDF, so no report data is sent to an outside chart service.
function renderChartPng(style, labels, data, datasetLabel) {
    const round = style === "pie_chart" || style === "doughnut_chart";
    const horizontal = style === "horizontal_bar_chart";
    const width = 1000;
    const height = horizontal ? Math.max(600, labels.length * 24 + 120) : 600;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.style.cssText = "position:fixed;left:-99999px;top:0";
    document.body.appendChild(canvas);

    const chart = new Chart(canvas, {
        type: { bar_chart: "bar", horizontal_bar_chart: "bar", line_chart: "line", pie_chart: "pie", doughnut_chart: "doughnut" }[style],
        data: {
            labels,
            datasets: [{
                label: datasetLabel,
                data,
                backgroundColor: round ? labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]) : "#2563eb",
                borderColor: round ? "#ffffff" : "#2563eb",
                borderWidth: round ? 2 : style === "line_chart" ? 3 : 0,
                borderRadius: round ? 0 : 3,
                tension: 0.25,
                pointRadius: style === "line_chart" ? 4 : 0,
            }],
        },
        options: {
            responsive: false,
            animation: false,
            devicePixelRatio: 1,
            indexAxis: horizontal ? "y" : "x",
            layout: { padding: 16 },
            plugins: {
                legend: { display: round, position: "right", labels: { font: { size: 14 } } },
                title: { display: true, text: datasetLabel, font: { size: 20, weight: "bold" }, color: "#0f172a", padding: { bottom: 16 } },
            },
            scales: round ? {} : {
                x: { beginAtZero: true, ticks: { font: { size: 13 }, color: "#334155" }, grid: { color: "#e2e8f0" } },
                y: { beginAtZero: true, ticks: { font: { size: 13 }, color: "#334155" }, grid: { color: "#e2e8f0" } },
            },
        },
        plugins: [{
            id: "white-background",
            beforeDraw: (c) => {
                const ctx = c.ctx;
                ctx.save();
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, c.width, c.height);
                ctx.restore();
            },
        }],
    });

    const src = canvas.toDataURL("image/png");
    chart.destroy();
    canvas.remove();
    return { src, ratio: height / width };
}

// ── Styles copied from resources/views/reports/custom.blade.php so the preview matches the PDF.
// dompdf's "sans-serif" is DejaVu Sans; Verdana is the closest widely installed match in width.
const DOC = {
    page: { fontFamily: '"DejaVu Sans", Verdana, sans-serif', fontSize: 12, lineHeight: 1.2, color: "#000", padding: PAGE_MARGIN, boxSizing: "border-box", background: "#fff" },
    header: { textAlign: "center", marginBottom: 20 },
    h1: { margin: 0, fontSize: 16, fontWeight: "bold", textTransform: "uppercase" },
    h2: { margin: "5px 0", fontSize: 14, fontWeight: "normal" },
    p: { margin: "5px 0", fontSize: 11, color: "#555" },
    table: { width: "100%", borderCollapse: "collapse", marginTop: 10 },
    th: { border: "1px solid #ddd", textAlign: "left", background: "#f3f4f6", textTransform: "uppercase", fontWeight: "bold", overflowWrap: "break-word" },
    td: { border: "1px solid #ddd", textAlign: "left", overflowWrap: "break-word" },
    h3: { fontSize: 14, fontWeight: "bold", margin: "14px 0" },
    chartWrap: { textAlign: "center", marginTop: 20, marginBottom: 30 },
    chartImg: { maxWidth: "90%", height: "auto", border: "1px solid #ddd", padding: 10, background: "#fafafa", boxSizing: "content-box" },
};

const DocHeader = ({ title, generatedOn }) => (
    <div style={DOC.header} data-m="header">
        <h1 style={DOC.h1}>Municipality of Rosario, Batangas</h1>
        <h2 style={DOC.h2}>{title}</h2>
        <p style={DOC.p}>Generated on: {generatedOn}</p>
    </div>
);

// Same sizing rule as custom.blade.php: text, header text and padding all scale with `fs` (12 = normal).
const DocTable = ({ headers, rows, fs = 12, style }) => {
    const k = fs / 12;
    const th = { ...DOC.th, fontSize: 10 * k, padding: 6 * k };
    const td = { ...DOC.td, padding: 6 * k };
    return (
        <table style={{ ...DOC.table, fontSize: fs, ...style }}>
            <thead>
                <tr>{headers.map((h, i) => <th key={i} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
                {rows.map((r, ri) => (
                    <tr key={ri}>{r.map((cell, ci) => <td key={ci} style={td}>{cell !== "" && cell !== null ? cell : "N/A"}</td>)}</tr>
                ))}
            </tbody>
        </table>
    );
};

const MIN_FONT = 6;

// Renders the report as real pages: content is laid out at true size, measured, split the way
// dompdf splits it (header and chart on page 1, table header repeated on every page), then scaled to fit.
// Chart frame: 10px padding + 1px border on each side, plus 20px above and 30px below (custom.blade.php).
const CHART_FRAME_W = 22;
const CHART_FRAME_H = 22 + 50;
const ROWS_UNDER_CHART = 3; // keep at least this many summary rows on page 1 so the table starts there

function PdfPreview({ paper, title, generatedOn, headers, rows, chart, summary, totalRows, stage, dimmed, onFit, onChartWidth }) {
    const [pageW, pageH] = paper;
    const contentW = pageW - 2 * PAGE_MARGIN;
    const contentH = pageH - 2 * PAGE_MARGIN;
    const fitRef = useRef(null);
    const measureRef = useRef(null);
    const [fs, setFs] = useState(12);
    const [ranges, setRanges] = useState([[0, rows.length]]);
    const [page, setPage] = useState(0);
    const [chartImgW, setChartImgW] = useState(0);

    // Fit to width: the narrowest the table can be without breaking words, at normal size.
    // If that's wider than the paper, shrink the text proportionally (like a print dialog's "Fit").
    useLayoutEffect(() => {
        const table = fitRef.current?.querySelector("table");
        if (!table) return;
        const minW = table.getBoundingClientRect().width;
        const next = minW > contentW ? Math.max(MIN_FONT, Math.floor(12 * (contentW / minW) * 4) / 4) : 12;
        setFs(next);
        onFit?.(next);
    }, [rows, headers, contentW]);

    useLayoutEffect(() => {
        const el = measureRef.current;
        if (!el) return;
        const headerH = el.querySelector('[data-m="header"]').offsetHeight + 20;
        const h3 = el.querySelector('[data-m="h3"]');
        const h3H = h3 ? h3.offsetHeight + 28 : 0;
        const theadH = el.querySelector("thead").offsetHeight;
        const rowHs = [...el.querySelectorAll("tbody tr")].map((r) => r.offsetHeight);

        // Auto-size the chart so the title block, chart, "Data Summary" and the first rows all fit on page 1.
        // Without this a full-width chart on a landscape page is taller than the page and the table gets cut.
        let chartW = 0;
        if (chart) {
            const firstRows = rowHs.slice(0, ROWS_UNDER_CHART).reduce((a, b) => a + b, 0);
            const roomForImage = contentH - headerH - CHART_FRAME_H - h3H - 10 - theadH - firstRows;
            const widest = Math.min(contentW * 0.9 - CHART_FRAME_W, 1000);
            chartW = Math.max(160, Math.min(widest, roomForImage / chart.ratio));
        }
        setChartImgW(chartW);
        onChartWidth?.(Math.round(chartW));
        const chartH = chart ? chartW * chart.ratio + CHART_FRAME_H : 0;

        const out = [];
        let start = 0;
        let used = headerH + chartH + h3H + 10 + theadH;
        rowHs.forEach((h, i) => {
            if (used + h > contentH && i > start) {
                out.push([start, i]);
                start = i;
                used = theadH;
            }
            used += h;
        });
        out.push([start, rowHs.length]);
        setRanges(out);
        setPage((p) => Math.min(p, out.length - 1));
    }, [rows, headers, pageW, pageH, chart, title, summary, fs]);

    // The preview holds at most 100 detailed rows; estimate the rest from the measured density.
    const shownRows = rows.length;
    const extraPages = !summary && totalRows > shownRows && shownRows > 0
        ? Math.ceil((totalRows - shownRows) / Math.max(1, shownRows / ranges.length))
        : 0;
    const totalPages = ranges.length + extraPages;

    // Fit the sheet to the viewport itself (whatever space the toolbar leaves), then apply the user's zoom on top.
    const viewRef = useRef(null);
    const [view, setView] = useState({ w: 0, h: 0 });
    useEffect(() => {
        const el = viewRef.current;
        const ro = new ResizeObserver(() => setView({ w: el.clientWidth, h: el.clientHeight }));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const PAD = 24; // breathing room so the sheet's shadow isn't clipped
    const fit = view.w > PAD && view.h > PAD ? Math.min((view.w - PAD) / pageW, (view.h - PAD) / pageH) : 0;
    const [zoom, setZoom] = useState(1);
    const scale = fit * zoom;
    const zoomBy = (f) => setZoom((z) => Math.min(4, Math.max(0.5, +(z * f).toFixed(3))));

    // Ctrl + scroll wheel (and trackpad pinch, which browsers report the same way) zooms smoothly.
    // Needs a non-passive listener so the browser's own page zoom can be prevented.
    useEffect(() => {
        const el = viewRef.current;
        const onWheel = (e) => {
            if (!e.ctrlKey) return;
            e.preventDefault();
            zoomBy(Math.exp(-e.deltaY * 0.0025));
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, []);
    const [from, to] = ranges[page] || [0, 0];
    const first = page === 0;
    const navBtn = "grid place-items-center w-8 h-8 rounded-full text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-35 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer transition-colors";

    return (
        <div className="flex flex-col items-center w-full" style={{ height: stage.h }}>
            {/* Hidden copies used only for measuring: natural minimum width (for fit), then row heights */}
            <div ref={fitRef} aria-hidden="true" style={{ ...DOC.page, position: "fixed", left: -99999, top: 0, padding: 0 }}>
                <DocTable headers={headers} rows={rows} style={{ width: "min-content" }} />
            </div>
            <div ref={measureRef} aria-hidden="true" style={{ ...DOC.page, position: "fixed", left: -99999, top: 0, width: contentW, padding: 0 }}>
                <DocHeader title={title} generatedOn={generatedOn} />
                {summary && <h3 style={DOC.h3} data-m="h3">Data Summary</h3>}
                <DocTable headers={headers} rows={rows} fs={fs} />
            </div>

            {/* Scrollable viewport: the sheet fits by default and can be panned once zoomed in */}
            <div ref={viewRef} className="flex flex-1 min-h-0 w-full overflow-auto custom-scrollbar" title="Ctrl + scroll to zoom">
            <div
                className={`m-auto shrink-0 rounded-sm ring-1 ring-slate-300 shadow-[0_1px_2px_rgba(15,23,42,.06),0_12px_32px_-12px_rgba(15,23,42,.35)] bg-white overflow-hidden transition-opacity ${dimmed ? "opacity-60" : ""}`}
                style={{ width: pageW * scale, height: pageH * scale, visibility: scale ? "visible" : "hidden" }}
            >
                <div style={{ ...DOC.page, width: pageW, height: pageH, transform: `scale(${scale})`, transformOrigin: "top left", overflow: "hidden" }}>
                    {first && <DocHeader title={title} generatedOn={generatedOn} />}
                    {first && chart && (
                        <div style={DOC.chartWrap}>
                            <img src={chart.src} alt="Chart" style={{ ...DOC.chartImg, width: chartImgW }} />
                        </div>
                    )}
                    {first && summary && <h3 style={DOC.h3}>Data Summary</h3>}
                    <DocTable headers={headers} rows={rows.slice(from, to)} fs={fs} />
                </div>
            </div>
            </div>

            {/* Floating toolbar: ‹ pin slider › · page count · zoom − % + */}
            <div className="mt-3 shrink-0 flex items-center gap-1 rounded-full bg-white/95 backdrop-blur px-1.5 py-1 ring-1 ring-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,.05),0_8px_24px_-10px_rgba(15,23,42,.3)]">
                <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="Previous page" className={navBtn}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                </button>
                <input
                    type="range"
                    min={1}
                    max={Math.max(1, ranges.length)}
                    value={page + 1}
                    onChange={(e) => setPage(Number(e.target.value) - 1)}
                    disabled={ranges.length < 2}
                    aria-label="Page"
                    className="pin-range w-28 sm:w-40 mx-1 disabled:opacity-40"
                    style={{ "--pct": `${ranges.length < 2 ? 0 : (page / (ranges.length - 1)) * 100}%` }}
                />
                <button type="button" onClick={() => setPage((p) => Math.min(ranges.length - 1, p + 1))} disabled={page >= ranges.length - 1} aria-label="Next page" className={navBtn}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                </button>
                <span className="px-2 text-[12.5px] font-medium text-slate-600 tabular-nums whitespace-nowrap" aria-live="polite">
                    Page {page + 1} of {extraPages ? `~${totalPages}` : totalPages}
                </span>
                <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
                <button type="button" onClick={() => zoomBy(1 / 1.25)} disabled={zoom <= 0.5} aria-label="Zoom out" className={navBtn}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path strokeLinecap="round" d="M5 12h14" /></svg>
                </button>
                <button type="button" onClick={() => setZoom(1)} title="Fit to view" aria-label={`Zoom ${Math.round(scale * 100)}%, reset to fit`} className="min-w-[52px] h-8 px-2 rounded-full text-[12.5px] font-semibold text-slate-700 tabular-nums hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 transition-colors">
                    {Math.round(scale * 100)}%
                </button>
                <button type="button" onClick={() => zoomBy(1.25)} disabled={zoom >= 4} aria-label="Zoom in" className={navBtn}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>
                </button>
            </div>
            {extraPages > 0 && <p className="mt-1.5 shrink-0 text-[11.5px] text-slate-400">Preview covers the first {shownRows} records</p>}
        </div>
    );
}

// Excel/CSV layout: the exported file is a title row, a blank row, the header row, then data.
function SheetPreview({ title, headers, rows, dimmed }) {
    const letters = headers.map((_, i) => String.fromCharCode(65 + (i % 26)));
    const sheetRows = [[title], [], headers, ...rows];
    return (
        <div className={`h-full w-full overflow-auto rounded-md ring-1 ring-slate-300 bg-white shadow-[0_10px_30px_-12px_rgba(15,23,42,.25)] transition-opacity ${dimmed ? "opacity-60" : ""}`}>
            <table className="border-collapse text-[12px] font-[Calibri,Carlito,Arial,sans-serif]">
                <thead className="sticky top-0 z-10">
                    <tr>
                        <th className="w-10 bg-slate-100 border border-slate-300" />
                        {letters.map((l, i) => <th key={i} className="min-w-[110px] px-2 py-1 bg-slate-100 border border-slate-300 font-normal text-slate-500">{l}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {sheetRows.map((r, ri) => (
                        <tr key={ri}>
                            <td className="sticky left-0 bg-slate-100 border border-slate-300 text-center text-slate-500 px-1">{ri + 1}</td>
                            {headers.map((_, ci) => (
                                <td key={ci} className={`px-2 py-1 border border-slate-200 whitespace-nowrap ${ri === 0 && ci === 0 ? "font-semibold" : ""}`}>
                                    {r[ci] ?? ""}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

const fieldClass = "w-full h-8 rounded-md border border-slate-300 bg-white pl-2.5 pr-8 py-1 text-[12.5px] leading-5 text-slate-900 transition hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 focus:outline-none";

const swalClass = {
    popup: "rounded-2xl border border-slate-200 shadow-xl p-6 bg-white font-sans",
    title: "text-base font-bold text-slate-900",
    htmlContainer: "text-xs text-slate-500",
    actions: "flex items-center justify-center gap-3 mt-4",
    confirmButton: "inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer",
    cancelButton: "inline-flex items-center justify-center px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-colors cursor-pointer",
};

// Boxed settings group, like the sections of a print dialog.
const Group = ({ title, children }) => (
    <fieldset className="rounded-md border border-slate-300 bg-slate-50 px-4 pt-3 pb-3.5">
        <legend className="sr-only">{title}</legend>
        <p className="mb-2.5 text-[13px] font-bold text-slate-900" aria-hidden="true">{title}</p>
        {children}
    </fieldset>
);

// "▸ More Options" disclosure, as in the print dialog.
const MoreToggle = ({ open, onToggle, hint }) => (
    <button type="button" onClick={onToggle} aria-expanded={open} className="mt-2.5 inline-flex items-center gap-1.5 text-[12.5px] text-slate-700 hover:text-slate-900 cursor-pointer">
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M7 4l7 6-7 6V4z" /></svg>
        More Options
        {hint && <span className="text-slate-400">· {hint}</span>}
    </button>
);

// Large toggle buttons, like "Size / Poster / Multiple / Booklet".
const BigToggle = ({ options, value, onChange, label }) => (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-2">
        {options.map((o) => {
            const on = value === o.id;
            return (
                <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={o.disabled}
                    title={o.title}
                    onClick={() => onChange(o.id)}
                    className={`h-8 rounded-md border text-[12.5px] transition-colors ${
                        on ? "border-blue-600 bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-600"
                        : o.disabled ? "border-slate-200 bg-white text-slate-300 cursor-not-allowed"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 cursor-pointer"
                    }`}
                >
                    {o.label}
                </button>
            );
        })}
    </div>
);

const Radio = ({ name, value, checked, onChange, children, disabled, title }) => (
    <label className={`inline-flex items-center gap-2 text-[12.5px] select-none ${disabled ? "text-slate-300 cursor-not-allowed" : "text-slate-700 cursor-pointer"}`} title={title}>
        <input type="radio" name={name} value={value} checked={checked} disabled={disabled} onChange={() => onChange(value)} className="w-3.5 h-3.5 border-slate-300 text-blue-600 focus:ring-blue-600/30" />
        {children}
    </label>
);

// Label + control on one row, like "Printer: [ ]" in a print dialog.
const Row = ({ id, label, children }) => (
    <div className="grid grid-cols-[96px_1fr] items-center gap-2">
        <label htmlFor={id} className="text-[13px] text-slate-700">{label}</label>
        {children}
    </div>
);

const formatWhen = (iso) =>
    new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) +
    ", " +
    new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });

export default function ReportsIndex({ auth = {}, barangays = [] }) {
    const userName = auth?.user?.name || "Planning Officer";
    const userRole = auth?.user?.role || "Administrator";

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [clock, setClock] = useState("");

    // Turn a saved/template setup into a full form, recomputing relative dates so "This month" stays current
    // and dropping anything this version no longer supports.
    const buildForm = (settings, rangeId) => {
        const f = { ...DEFAULTS, ...settings };
        f.variables = Array.isArray(f.variables) ? f.variables.filter((v) => COLUMNS.some((c) => c.id === v)) : DEFAULTS.variables;
        if (!PAPER[f.document_size]) f.document_size = DEFAULTS.document_size;
        if (!["pdf", "xlsx", "csv"].includes(f.format)) f.format = DEFAULTS.format;
        delete f.status; // filter removed; older saved setups may still carry it
        if (f.barangay && !barangays.includes(f.barangay)) f.barangay = "";
        const range = RANGES.find((r) => r.id === rangeId);
        if (range?.range) [f.start_date, f.end_date] = range.range(new Date());
        return f;
    };

    const [saved] = useState(() => readStore(SETTINGS_KEY, null));
    const [rangeId, setRangeId] = useState(saved?.rangeId || "all");
    const [form, setForm] = useState(() => (saved?.form ? buildForm(saved.form, saved.rangeId) : { ...DEFAULTS }));
    const [templateId, setTemplateId] = useState(saved?.templateId || "");
    const [recent, setRecent] = useState(() => readStore(RECENT_KEY, []));
    const [moreOpen, setMoreOpen] = useState(false);
    const [dataMoreOpen, setDataMoreOpen] = useState(() => !!(saved?.form?.barangay || (saved?.form?.application_type && saved.form.application_type !== "All")));
    const [recentPick, setRecentPick] = useState("");

    const [preview, setPreview] = useState(null);
    const [chart, setChart] = useState(null);
    const [fitFont, setFitFont] = useState(12); // text size the preview chose so the table fits the page
    const [chartWidth, setChartWidth] = useState(null); // chart width (px) the preview chose so the page isn't cut
    const [previewError, setPreviewError] = useState("");
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [notice, setNotice] = useState("");
    const requestId = useRef(0);

    // Measure the preview area so the page is scaled to fit exactly.
    const stageRef = useRef(null);
    const [stage, setStage] = useState({ w: 0, h: 0 });
    useEffect(() => {
        const el = stageRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([entry]) => setStage({ w: entry.contentRect.width, h: entry.contentRect.height }));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        writeStore(SETTINGS_KEY, { form, rangeId, templateId });
    }, [form, rangeId, templateId]);

    // Any manual change means the setup no longer matches a template.
    const set = (key, value) => {
        setTemplateId("");
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const isPdf = form.format === "pdf";
    const isChart = form.presentation_style.endsWith("_chart");
    const layout = form.presentation_style === "table" ? "table" : isChart ? "chart" : "summary_table";
    const dateError = form.start_date && form.end_date && form.end_date < form.start_date ? "End date must be on or after the start date." : "";
    const noColumns = layout === "table" && form.variables.length === 0;
    const canRun = !dateError && !noColumns;

    // Matches the title the server prints on the report.
    const reportTitle = (() => {
        const type = form.application_type === "All" ? "All Applications" : form.application_type;
        let dates = "All Time";
        if (form.start_date && form.end_date) dates = `${form.start_date} to ${form.end_date}`;
        else if (form.start_date) dates = `from ${form.start_date}`;
        else if (form.end_date) dates = `until ${form.end_date}`;
        const filters = [form.barangay].filter(Boolean);
        return `${type} Report (${dates})${filters.length ? ` - ${filters.join(", ")}` : ""}`;
    })();

    const applyTemplate = (id) => {
        setNotice("");
        setTemplateId(id);
        if (!id) return;
        const tpl = TEMPLATES.find((t) => t.id === id);
        setRangeId(tpl.range);
        setForm(buildForm(tpl.settings, tpl.range));
        setMoreOpen(false);
    };

    const resetAll = () => {
        setTemplateId("");
        setRangeId("all");
        setForm({ ...DEFAULTS });
        setNotice("");
    };

    const chooseRange = (id) => {
        setRangeId(id);
        setTemplateId("");
        const r = RANGES.find((x) => x.id === id);
        if (r.range) {
            const [start, end] = r.range(new Date());
            setForm((prev) => ({ ...prev, start_date: start, end_date: end }));
        }
    };

    // Charts only exist in PDFs. Switching away explains the change instead of silently swapping styles.
    const chooseFormat = (fmt) => {
        setTemplateId("");
        if (fmt !== "pdf" && isChart) {
            setForm((prev) => ({ ...prev, format: fmt, presentation_style: "summary_table" }));
            setNotice("Charts are only available in PDF, so the layout was switched to Summary.");
        } else {
            setForm((prev) => ({ ...prev, format: fmt }));
            setNotice("");
        }
    };

    const chooseLayout = (id) => {
        setNotice("");
        set("presentation_style", id === "chart" ? (isChart ? form.presentation_style : "bar_chart") : id);
    };

    const toggleColumn = (id) => {
        setTemplateId("");
        setForm((prev) => ({
            ...prev,
            variables: prev.variables.includes(id)
                ? prev.variables.filter((v) => v !== id)
                : COLUMNS.map((c) => c.id).filter((c) => c === id || prev.variables.includes(c)),
        }));
    };

    // Live preview: refresh shortly after any change; only the latest request is shown.
    useEffect(() => {
        if (!canRun) {
            requestId.current++;
            setLoadingPreview(false);
            return;
        }
        const id = ++requestId.current;
        setLoadingPreview(true);
        const timer = setTimeout(async () => {
            try {
                const { format, document_size, orientation, ...payload } = form;
                const res = await axios.post("/api/analytics/report/preview", payload);
                if (id !== requestId.current) return;
                const cd = res.data.chartData;
                setChart(cd && form.presentation_style.endsWith("_chart") ? renderChartPng(form.presentation_style, cd.labels, cd.data, cd.datasetLabel) : null);
                setPreview(res.data);
                setPreviewError("");
            } catch (error) {
                if (id !== requestId.current) return;
                setPreviewError(error?.response?.data?.message || "The preview couldn't be loaded. Check your connection and try again.");
            } finally {
                if (id === requestId.current) setLoadingPreview(false);
            }
        }, 450);
        return () => clearTimeout(timer);
    }, [form.start_date, form.end_date, form.application_type, form.barangay, form.variables, form.presentation_style, form.group_by, form.aggregation, canRun]);

    const download = async () => {
        if (!canRun || downloading) return;
        setDownloading(true);
        try {
            const payload = isPdf
                ? { ...form, font_size: fitFont, ...(isChart && chart ? { chart_image: chart.src, chart_width: chartWidth } : {}) }
                : form;
            const response = await axios.post("/api/analytics/report", payload, { responseType: "blob" });

            const typeStr = form.application_type !== "All" ? form.application_type.replace(/ /g, "_") : "All_Applications";
            let dateStr = "All_Time";
            if (form.start_date && form.end_date) dateStr = `${form.start_date}_to_${form.end_date}`;
            else if (form.start_date) dateStr = `from_${form.start_date}`;
            else if (form.end_date) dateStr = `until_${form.end_date}`;
            const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement("a");
            link.href = url;
            link.setAttribute("download", `${typeStr}_Report_${dateStr}_${stamp}.${form.format}`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            const entry = {
                id: stamp,
                at: new Date().toISOString(),
                title: TEMPLATES.find((t) => t.id === templateId)?.label || reportTitle,
                format: form.format,
                form,
                rangeId,
                templateId,
            };
            const next = [entry, ...recent].slice(0, 5);
            setRecent(next);
            setRecentPick(entry.id);
            writeStore(RECENT_KEY, next);

            Swal.fire({ icon: "success", title: "Report downloaded", text: "The download has been recorded in the audit trail.", timer: 2200, showConfirmButton: false, customClass: swalClass });
        } catch (error) {
            Swal.fire({ icon: "error", title: "Report couldn't be generated", text: "Please try again. If it keeps failing, try fewer columns or a shorter date range.", buttonsStyling: false, customClass: swalClass });
        } finally {
            setDownloading(false);
        }
    };

    const showHelp = () =>
        Swal.fire({
            title: "Making a report",
            html: `
                <ol class="text-left text-[12.5px] leading-relaxed text-slate-600 space-y-2 mt-1 list-decimal pl-5">
                    <li><b class="text-slate-800">Pick a template</b> at the top, or set up your own under <i>Data to Include</i> and <i>Layout &amp; Content</i>.</li>
                    <li><b class="text-slate-800">Check the preview</b> on the right. It updates as you change settings; use ‹ › to flip pages.</li>
                    <li><b class="text-slate-800">Download</b> as PDF, Excel or CSV. Every download is recorded in the audit trail.</li>
                </ol>
                <p class="text-left text-[12px] text-slate-500 mt-3"><b class="text-slate-700">Fit to page width:</b> if a table is too wide for the paper, its text is shrunk so nothing is cut off. Landscape or Legal paper gives more room.</p>
                <p class="text-left text-[12px] text-slate-500 mt-2"><b class="text-slate-700">Recent reports</b> and your last settings are saved in this browser only.</p>
            `,
            confirmButtonText: "Got it",
            buttonsStyling: false,
            customClass: swalClass,
        });

    const runAgain = (entry) => {
        setNotice("");
        setRangeId(entry.rangeId);
        setTemplateId(entry.templateId || "");
        setForm(buildForm(entry.form, entry.rangeId));
    };

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

    const handleLogout = confirmSignOut;

    const [pw, ph, paperName] = PAPER[form.document_size];
    const paperPx = form.orientation === "landscape" ? [ph * MM, pw * MM] : [pw * MM, ph * MM];
    const formatName = { pdf: "PDF", xlsx: "Excel", csv: "CSV" }[form.format];
    const generatedOn = new Date().toLocaleDateString("en-US", { month: "long", day: "2-digit", year: "numeric" }) + " " +
        new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

    const statusMessage = !canRun
        ? dateError || "Choose at least one column to see a preview."
        : previewError
        ? previewError
        : preview && preview.total_rows === 0
        ? "No applications match these settings. Try a wider date range or fewer filters."
        : "";

    return (
        <>
            <Head title="Data Reports | iMAPS" />

            <style>{`
                #analytics-page-root, .swal2-popup {
                    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                }
                .font-mono { font-family: 'JetBrains Mono', monospace !important; }
                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 6px; }
                ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
                /* Page slider: pointer thumb (like a classic Windows slider) on a rounded track that fills up to it */
                .pin-range { -webkit-appearance: none; appearance: none; height: 20px; background: transparent; cursor: pointer; }
                .pin-range::-webkit-slider-runnable-track { height: 6px; border-radius: 9999px; box-shadow: inset 0 1px 1px rgba(15,23,42,.12);
                    background: linear-gradient(to right, #3b82f6, #2563eb var(--pct), #e2e8f0 var(--pct)); }
                .pin-range::-moz-range-track { height: 6px; border-radius: 9999px; background: #e2e8f0; }
                .pin-range::-moz-range-progress { height: 6px; border-radius: 9999px; background: #2563eb; }
                .pin-range::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 20px; margin-top: -7px; border: 0; background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 20'%3E%3Cpath d='M1 2.5A1.5 1.5 0 0 1 2.5 1h9A1.5 1.5 0 0 1 13 2.5v10.3l-6 6.2-6-6.2Z' fill='%232563eb' stroke='%231d4ed8'/%3E%3Cpath d='M5 6h4M5 9h4' stroke='%23fff' stroke-opacity='.7' stroke-linecap='round'/%3E%3C/svg%3E") center/contain no-repeat;
                    filter: drop-shadow(0 1px 1.5px rgba(30,64,175,.4)); transition: transform .15s; }
                .pin-range::-moz-range-thumb { width: 14px; height: 20px; border: 0; border-radius: 0; background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 20'%3E%3Cpath d='M1 2.5A1.5 1.5 0 0 1 2.5 1h9A1.5 1.5 0 0 1 13 2.5v10.3l-6 6.2-6-6.2Z' fill='%232563eb' stroke='%231d4ed8'/%3E%3Cpath d='M5 6h4M5 9h4' stroke='%23fff' stroke-opacity='.7' stroke-linecap='round'/%3E%3C/svg%3E") center/contain no-repeat; }
                .pin-range:hover:not(:disabled)::-webkit-slider-thumb { transform: scale(1.1); }
                .pin-range:focus-visible { outline: 2px solid #2563eb; outline-offset: 4px; border-radius: 4px; }
                .pin-range:disabled { cursor: default; }
            `}</style>

            <div id="analytics-page-root" className="bg-slate-50/75 text-slate-800 h-screen flex flex-col overflow-hidden antialiased">
                <Header
                    userName={userName}
                    userRole={userRole}
                    clock={clock}
                    onLogout={handleLogout}
                    sidebarOpen={sidebarOpen}
                    setSidebarOpen={setSidebarOpen}
                    activePage="reports"
                />

                <div className="flex-1 overflow-hidden relative flex flex-col min-w-0">
                    <Sidebar
                        userName={userName}
                        userRole={userRole}
                        sidebarOpen={sidebarOpen}
                        setSidebarOpen={setSidebarOpen}
                        onLogout={handleLogout}
                        activePage="reports"
                    />

                    {sidebarOpen && (
                        <div onClick={() => setSidebarOpen(false)} className="absolute inset-0 bg-slate-900/20 backdrop-blur-xs z-[750] transition-opacity duration-200" />
                    )}

                    <main className="flex-1 w-full h-full flex flex-col overflow-hidden bg-white">
                        {/* ── HEADER STRIP ── */}
                        {/* Page title, matching the other modules' headers */}
                        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-200 bg-white shrink-0">
                            <div className="min-w-0">
                                <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-tight">Data Reports</h1>
                                <p className="hidden sm:block mt-0.5 text-xs text-slate-500 truncate">Set up a report, check the preview, then download.</p>
                            </div>
                            {/* "Help ?" in the corner, as in a print dialog */}
                            <button
                                type="button"
                                onClick={showHelp}
                                className="ml-auto inline-flex items-center gap-1.5 text-[12.5px] font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer shrink-0"
                            >
                                Help
                                <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                                </svg>
                            </button>
                        </div>

                        {/* Print-dialog layout: top band, settings sections on the left, boxed preview on the right */}
                        <div className="flex-1 min-h-0 flex flex-col gap-2.5 p-3 bg-slate-100 overflow-y-auto lg:overflow-hidden">
                            {/* ── TOP BAND (like "Printer" and "Copies") ── */}
                            <div className="shrink-0 rounded-md border border-slate-300 bg-slate-50 px-4 py-2.5 space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <label htmlFor="template" className="w-20 text-[12.5px] text-slate-800">Template:</label>
                                    <select id="template" value={templateId} onChange={(e) => applyTemplate(e.target.value)} className={`${fieldClass} max-w-[340px]`}>
                                        <option value="">Custom report</option>
                                        {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                                    </select>
                                    <button type="button" onClick={resetAll} className="h-8 px-3.5 rounded-md border border-slate-300 bg-white text-[13px] text-slate-700 hover:bg-slate-100 cursor-pointer">
                                        Reset
                                    </button>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-5 gap-y-2" role="radiogroup" aria-label="File format">
                                    <span className="w-20 text-[12.5px] text-slate-800">Save as:</span>
                                    <Radio name="format" value="pdf" checked={form.format === "pdf"} onChange={chooseFormat}>PDF document</Radio>
                                    <Radio name="format" value="xlsx" checked={form.format === "xlsx"} onChange={chooseFormat}>Excel workbook</Radio>
                                    <Radio name="format" value="csv" checked={form.format === "csv"} onChange={chooseFormat}>CSV file</Radio>
                                    {notice && <span role="status" className="text-[11.5px] text-blue-700">{notice}</span>}
                                </div>
                            </div>

                        <div className="flex-1 min-h-0 grid lg:grid-cols-[minmax(440px,44%)_1fr] gap-2.5">
                            {/* ── SETTINGS ── */}
                            <aside className="lg:overflow-y-auto lg:pr-1 space-y-2.5">
                                <Group title="Data to Include">
                                    <div className="flex flex-wrap gap-x-5 gap-y-2.5">
                                        {RANGES.map((r) => (
                                            <Radio key={r.id} name="range" value={r.id} checked={rangeId === r.id} onChange={chooseRange}>{r.label}</Radio>
                                        ))}
                                    </div>
                                    {rangeId === "custom" && (
                                        <div className="mt-3 grid grid-cols-2 gap-3">
                                            <div>
                                                <label htmlFor="start_date" className="block mb-1 text-[11.5px] text-slate-500">From</label>
                                                <input id="start_date" type="date" value={form.start_date} max={form.end_date || undefined} onChange={(e) => set("start_date", e.target.value)} className={fieldClass.replace("pr-8", "pr-2.5")} aria-invalid={!!dateError} />
                                            </div>
                                            <div>
                                                <label htmlFor="end_date" className="block mb-1 text-[11.5px] text-slate-500">To</label>
                                                <input id="end_date" type="date" value={form.end_date} min={form.start_date || undefined} onChange={(e) => set("end_date", e.target.value)} className={fieldClass.replace("pr-8", "pr-2.5")} aria-invalid={!!dateError} aria-describedby="date-error" />
                                            </div>
                                        </div>
                                    )}
                                    {dateError && <p id="date-error" role="alert" className="mt-1.5 text-[11px] font-medium text-red-600">{dateError}</p>}

                                    <MoreToggle
                                        open={dataMoreOpen}
                                        onToggle={() => setDataMoreOpen((o) => !o)}
                                        hint={[form.application_type === "All" ? "all types" : form.application_type, form.barangay || "all barangays"].join(", ")}
                                    />
                                    {dataMoreOpen && (
                                        <div className="mt-3 space-y-2.5">
                                            <Row id="application_type" label="Type">
                                                <select id="application_type" value={form.application_type} onChange={(e) => set("application_type", e.target.value)} className={fieldClass}>
                                                    {APPLICATION_TYPES.map((t) => <option key={t} value={t}>{t === "All" ? "All application types" : t}</option>)}
                                                </select>
                                            </Row>
                                            <Row id="barangay" label="Barangay">
                                                <select id="barangay" value={form.barangay} onChange={(e) => set("barangay", e.target.value)} className={fieldClass}>
                                                    <option value="">All barangays</option>
                                                    {barangays.map((b) => <option key={b} value={b}>{b}</option>)}
                                                </select>
                                            </Row>
                                        </div>
                                    )}
                                </Group>

                                <Group title="Layout & Content">
                                    <BigToggle
                                        label="Layout"
                                        value={layout}
                                        onChange={chooseLayout}
                                        options={[
                                            { id: "table", label: "Detailed list" },
                                            { id: "summary_table", label: "Summary" },
                                            { id: "chart", label: "Chart", disabled: !isPdf, title: !isPdf ? "Charts are only available in PDF" : undefined },
                                        ]}
                                    />

                                    <MoreToggle
                                        open={moreOpen}
                                        onToggle={() => setMoreOpen((o) => !o)}
                                        hint={layout === "table"
                                            ? `${form.variables.length} of ${COLUMNS.length} columns`
                                            : `by ${GROUP_BY.find((g) => g.id === form.group_by)?.label.toLowerCase()}`}
                                    />
                                    {noColumns && !moreOpen && <p role="alert" className="mt-1 text-[11px] font-medium text-red-600">Choose at least one column.</p>}

                                    {moreOpen && (
                                        <div className="mt-3 pt-3 border-t border-slate-100">
                                            {layout === "table" ? (
                                                <>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-xs font-semibold text-slate-700">Columns</span>
                                                        <span className="flex gap-2 text-[11px] font-semibold">
                                                            <button type="button" onClick={() => set("variables", COLUMNS.map((c) => c.id))} className="text-blue-600 hover:text-blue-800 cursor-pointer">Select all</button>
                                                            <span className="text-slate-300">·</span>
                                                            <button type="button" onClick={() => set("variables", [])} className="text-slate-500 hover:text-slate-800 cursor-pointer">Clear</button>
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-2 xl:grid-cols-3 gap-x-3 gap-y-1">
                                                        {COLUMNS.map((c) => (
                                                            <label key={c.id} className="flex items-center gap-2 py-0.5 text-xs text-slate-700 cursor-pointer select-none">
                                                                <input type="checkbox" checked={form.variables.includes(c.id)} onChange={() => toggleColumn(c.id)} className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-600/30" />
                                                                {c.label}
                                                            </label>
                                                        ))}
                                                    </div>
                                                    {noColumns && <p role="alert" className="mt-1.5 text-[11px] font-medium text-red-600">Choose at least one column.</p>}
                                                </>
                                            ) : (
                                                <div className="space-y-2.5">
                                                    {isChart && (
                                                        <Row id="chart_type" label="Chart type">
                                                            <select id="chart_type" value={form.presentation_style} onChange={(e) => set("presentation_style", e.target.value)} className={fieldClass}>
                                                                {CHART_TYPES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                                                            </select>
                                                        </Row>
                                                    )}
                                                    <Row id="group_by" label="Group by">
                                                        <select id="group_by" value={form.group_by} onChange={(e) => set("group_by", e.target.value)} className={fieldClass}>
                                                            {GROUP_BY.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                                                        </select>
                                                    </Row>
                                                    <Row id="aggregation" label="Measure">
                                                        <select id="aggregation" value={form.aggregation} onChange={(e) => set("aggregation", e.target.value)} className={fieldClass}>
                                                            {MEASURES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                                                        </select>
                                                    </Row>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </Group>

                                <Group title="Page Setup">
                                    {isPdf ? (
                                        <div className="space-y-3">
                                            <div className="flex flex-wrap items-center gap-x-6 gap-y-2" role="radiogroup" aria-label="Orientation">
                                                <span className="w-24 text-[13px] text-slate-700">Orientation:</span>
                                                <Radio name="orientation" value="portrait" checked={form.orientation === "portrait"} onChange={(v) => set("orientation", v)}>Portrait</Radio>
                                                <Radio name="orientation" value="landscape" checked={form.orientation === "landscape"} onChange={(v) => set("orientation", v)}>Landscape</Radio>
                                            </div>
                                            <div className="grid grid-cols-[96px_1fr] items-center gap-2">
                                                <label htmlFor="paper" className="text-[13px] text-slate-700">Paper size:</label>
                                                <select id="paper" value={form.document_size} onChange={(e) => set("document_size", e.target.value)} className={`${fieldClass} max-w-[260px]`}>
                                                    <option value="a4">A4 (210 × 297 mm)</option>
                                                    <option value="letter">Letter (8.5 × 11 in)</option>
                                                    <option value="legal">Legal (8.5 × 14 in)</option>
                                                </select>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-[12.5px] text-slate-500">Spreadsheets have no pages. Choose PDF to set paper size and orientation.</p>
                                    )}
                                </Group>

                                {recent.length > 0 && (
                                    <Group title="Recent Reports">
                                        <div className="flex items-center gap-2">
                                            <label htmlFor="recent" className="sr-only">Recent report</label>
                                            <select id="recent" value={recentPick} onChange={(e) => setRecentPick(e.target.value)} className={fieldClass}>
                                                {recent.map((r) => (
                                                    <option key={r.id} value={r.id}>{r.title} · {r.format.toUpperCase()} · {formatWhen(r.at)}</option>
                                                ))}
                                            </select>
                                            <button
                                                type="button"
                                                onClick={() => runAgain(recent.find((r) => r.id === recentPick) || recent[0])}
                                                className="shrink-0 h-8 px-3.5 rounded-md border border-slate-300 bg-white text-[13px] text-slate-700 hover:bg-slate-100 cursor-pointer"
                                            >
                                                Run again
                                            </button>
                                        </div>
                                    </Group>
                                )}
                            </aside>

                            {/* ── DOCUMENT PREVIEW ── */}
                            <section className="min-h-[560px] lg:min-h-0 flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white" aria-label="Report preview">
                                <div className="flex items-center justify-between gap-3 px-5 pt-3.5 text-[12.5px] text-slate-600 shrink-0" aria-live="polite">
                                    <span>
                                        <span className="font-semibold text-slate-800">Document:</span>{" "}
                                        {isPdf ? `${Math.round(paperPx[0] / MM)} × ${Math.round(paperPx[1] / MM)} mm` : `${formatName} spreadsheet`}
                                    </span>
                                    <span className="flex items-center gap-2">
                                        {loadingPreview && <span className="w-3 h-3 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" aria-hidden="true" />}
                                        {loadingPreview ? "Updating…" : preview ? `${preview.total_rows.toLocaleString()} ${preview.total_rows === 1 ? "record" : "records"}` : ""}
                                    </span>
                                </div>
                                {isPdf && (
                                    <p className="mt-2 text-center text-[13px] text-slate-700 shrink-0">
                                        {paperName} {form.orientation === "landscape" ? "Landscape" : "Portrait"}
                                        {preview && layout === "table" && fitFont < 12 && (
                                            <span className="block text-[11.5px] text-slate-400">Fit to page width · text at {Math.round((fitFont / 12) * 100)}%</span>
                                        )}
                                    </p>
                                )}

                                <div ref={stageRef} className="flex-1 min-h-0 mx-5 mt-3 mb-4 flex items-start justify-center">
                                    {statusMessage ? (
                                        <div className="self-center max-w-sm text-center text-sm text-slate-500">{statusMessage}</div>
                                    ) : !preview ? (
                                        <div className="self-center flex items-center gap-2 text-sm text-slate-500">
                                            <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" aria-hidden="true" />
                                            Loading preview…
                                        </div>
                                    ) : isPdf ? (
                                        <PdfPreview
                                            paper={paperPx}
                                            title={reportTitle}
                                            generatedOn={generatedOn}
                                            headers={preview.headers}
                                            rows={preview.rows}
                                            chart={isChart ? chart : null}
                                            summary={layout !== "table"}
                                            totalRows={preview.total_rows}
                                            stage={stage}
                                            dimmed={loadingPreview}
                                            onFit={setFitFont}
                                            onChartWidth={setChartWidth}
                                        />
                                    ) : (
                                        <SheetPreview title={reportTitle} headers={preview.headers} rows={preview.rows} dimmed={loadingPreview} />
                                    )}
                                </div>
                            </section>
                        </div>
                        </div>

                        {/* ── ACTION BAR (like Print / Cancel) ── */}
                        <div className="flex items-center gap-2.5 px-5 py-2 border-t border-slate-200 bg-slate-100 shrink-0">
                            <p className="flex-1 text-[12px] text-slate-500 truncate">
                                {layout === "table" && preview?.total_rows > 100 ? "The preview shows the first 100 records. The download includes all of them." : "Downloads are recorded in the audit trail."}
                            </p>
                            <button
                                type="button"
                                onClick={download}
                                disabled={!canRun || downloading || !preview || preview.total_rows === 0}
                                className="inline-flex items-center justify-center gap-2 min-w-[130px] h-8 px-4 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[12.5px] font-semibold shadow-xs transition-colors cursor-pointer shrink-0"
                            >
                                {downloading ? (
                                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                    </svg>
                                )}
                                {downloading ? "Preparing…" : `Download ${formatName}`}
                            </button>
                            <Link href="/dashboard" className="inline-flex items-center justify-center min-w-[96px] h-8 px-4 rounded-md border border-slate-300 bg-white text-[12.5px] text-slate-700 hover:bg-slate-50 shrink-0">
                                Cancel
                            </Link>
                        </div>
                    </main>
                </div>
            </div>
        </>
    );
}
