import React, { useState, useEffect, useRef } from "react";
import { Head, Link } from "@inertiajs/react";
import dialog, { notify, tight } from "@/utils/dialog";
import axios from "axios";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import { confirmSignOut } from "@/utils/signOut";

const APPLICATION_TYPES = ["All", "Locational Clearance", "Zoning Certificate", "Development Permit", "Preliminary Approval and Locational Clearance (PALC)"];

const COLUMNS = [
    { id: "reference_number", label: "Reference number" },
    { id: "form_number", label: "Form number" },
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
    variables: ["reference_number", "form_number", "date", "application_type", "status", "name", "barangay", "land_use_class", "lot_area_sqm", "assessment_fee"],
    format: "xlsx",
    presentation_style: "table",
    aggregation: "count",
    group_by: "barangay",
};

// Ready-made reports. `range` is resolved to real dates when the template is applied.
const TEMPLATES = [
    { id: "monthly", label: "Monthly applications", range: "year", settings: { format: "xlsx", presentation_style: "summary_table", group_by: "month", aggregation: "count" } },
    { id: "barangay", label: "Applications by barangay", range: "year", settings: { format: "xlsx", presentation_style: "summary_table", group_by: "barangay", aggregation: "count" } },
    { id: "fees", label: "Fees collected by month", range: "year", settings: { format: "xlsx", presentation_style: "summary_table", group_by: "month", aggregation: "sum_fee" } },
    { id: "landuse", label: "Land use summary", range: "all", settings: { format: "xlsx", presentation_style: "summary_table", group_by: "land_use_class", aggregation: "count" } },
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
        delete f.document_size; // PDF-only settings from older saved setups
        delete f.orientation;
        if (f.presentation_style?.endsWith("_chart")) f.presentation_style = "summary_table";
        if (!["xlsx", "csv"].includes(f.format)) f.format = DEFAULTS.format;
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
    const [previewError, setPreviewError] = useState("");
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [notice, setNotice] = useState("");
    const requestId = useRef(0);

    useEffect(() => {
        writeStore(SETTINGS_KEY, { form, rangeId, templateId });
    }, [form, rangeId, templateId]);

    // Any manual change means the setup no longer matches a template.
    const set = (key, value) => {
        setTemplateId("");
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const layout = form.presentation_style === "table" ? "table" : "summary_table";
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

    const chooseFormat = (fmt) => {
        setTemplateId("");
        setForm((prev) => ({ ...prev, format: fmt }));
        setNotice("");
    };

    const chooseLayout = (id) => {
        setNotice("");
        set("presentation_style", id);
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
                const { format, ...payload } = form;
                const res = await axios.post("/api/analytics/report/preview", payload);
                if (id !== requestId.current) return;
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
            const response = await axios.post("/api/analytics/report", form, { responseType: "blob" });

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

            notify("Report downloaded", "success", { text: "The download has been recorded in the audit trail." });
        } catch (error) {
            dialog.fire({ icon: "error", title: "Report couldn't be generated", text: "Please try again. If it keeps failing, try fewer columns or a shorter date range." });
        } finally {
            setDownloading(false);
        }
    };

    const showHelp = () =>
        dialog.fire({
            title: "Making a report",
            icon: "info",
            width: 420,
            html: tight(`
                <ol class="text-left text-[12.5px] leading-relaxed text-slate-600 space-y-2 list-decimal pl-5">
                    <li><b class="text-slate-800">Pick a template</b> at the top, or set up your own under <i>Data to Include</i> and <i>Layout &amp; Content</i>.</li>
                    <li><b class="text-slate-800">Check the preview</b> on the right. It updates as you change settings.</li>
                    <li><b class="text-slate-800">Download</b> as Excel or CSV. Every download is recorded in the audit trail.</li>
                </ol>
                <p class="text-left text-[12px] text-slate-500 mt-2"><b class="text-slate-700">Recent reports</b> and your last settings are saved in this browser only.</p>
            `),
            confirmButtonText: "Got it",
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

    const formatName = { xlsx: "Excel", csv: "CSV" }[form.format];
    const statusMessage = !canRun
        ? dateError || "Choose at least one column to see a preview."
        : previewError
        ? previewError
        : preview && preview.total_rows === 0
        ? "No applications match these settings. Try a wider date range or fewer filters."
        : "";

    return (
        <>
            <Head title="Export Reports | iMAPS" />

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

                    <main className="flex-1 w-full h-full flex flex-col overflow-hidden">
                        <div className="p-4 sm:p-6 flex-1 flex flex-col min-h-0 max-w-[1580px] mx-auto w-full">
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex-1 min-h-0 flex flex-col">
                        {/* ── HEADER STRIP ── */}
                        {/* Page title, matching the other modules' headers */}
                        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 bg-slate-100/80 shrink-0">
                            <div className="flex items-baseline gap-2.5 min-w-0">
                                <h1 className="text-[16px] font-bold text-slate-900 tracking-tight">Export Reports</h1>
                                <p className="hidden sm:block text-[12px] text-slate-500 truncate">Set up a report, check the preview, then download.</p>
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
                                        {`${formatName} spreadsheet`}
                                    </span>
                                    <span className="flex items-center gap-2">
                                        {loadingPreview && <span className="w-3 h-3 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" aria-hidden="true" />}
                                        {loadingPreview ? "Updating…" : preview ? `${preview.total_rows.toLocaleString()} ${preview.total_rows === 1 ? "record" : "records"}` : ""}
                                    </span>
                                </div>
                                <div className="flex-1 min-h-0 mx-5 mt-3 mb-4 flex items-start justify-center">
                                    {statusMessage ? (
                                        <div className="self-center max-w-sm text-center text-sm text-slate-500">{statusMessage}</div>
                                    ) : !preview ? (
                                        <div className="self-center flex items-center gap-2 text-sm text-slate-500">
                                            <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" aria-hidden="true" />
                                            Loading preview…
                                        </div>
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
                            <Link href="/maps" className="inline-flex items-center justify-center min-w-[96px] h-8 px-4 rounded-md border border-slate-300 bg-white text-[12.5px] text-slate-700 hover:bg-slate-50 shrink-0">
                                Cancel
                            </Link>
                        </div>
                        </div>
                        </div>
                    </main>
                </div>
            </div>
        </>
    );
}
