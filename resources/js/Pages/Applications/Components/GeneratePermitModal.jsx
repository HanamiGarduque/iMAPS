// resources/js/Pages/Applications/Components/GeneratePermitModal.jsx
// Generate Permit: pick a permit, review/complete the fields the encode form doesn't capture,
// and get a PDF filled into the office's own Excel layout (config/permits.php on the server).
import React, { useEffect, useMemo, useState, useRef } from "react";
import axios from "axios";

export const PERMITS = [
    { type: "ze", label: "Zoning Evaluation", paper: "A4", icon: "📋" },
    { type: "lc", label: "Locational Clearance", paper: "A4", icon: "📄" },
    { type: "zc", label: "Zoning Certification", paper: "A4", icon: "📜" },
    { type: "dp", label: "Development Permit", paper: "8.5 × 13 (long)", icon: "🏛️" },
];

const GROUP_ORDER = ["Numbers & dates", "Applicant & project", "Lot / property", "Evaluation", "Fees", "Signatories"];

// Values typed here are remembered per application (so the LC decision no. typed for the LC
// is reused on the DP), and signatories are remembered for every application.
const SHARED_KEYS = ["ADMIN", "PLANNING_OFFICER", "PO_INITIALS"];
const appKey = (id) => `imaps.permit.${id}`;
const sharedKey = "imaps.permit.shared";
const readJson = (k) => {
    try {
        return JSON.parse(localStorage.getItem(k) || "{}") || {};
    } catch {
        return {};
    }
};

export function defaultPermitFor(app = {}) {
    const t = (app.application_type || "").toLowerCase();
    if (t.includes("development")) return "dp";
    if (t.includes("zoning cert")) return "zc";
    return "lc";
}

// ── Tab content: list of permits, each opens the modal ──
export function PermitExportPanel({ app }) {
    const [open, setOpen] = useState(null);
    const suggested = defaultPermitFor(app);

    return (
        <div className="space-y-3 pb-4">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <h3 className="text-xs font-bold text-slate-900">Generate permit</h3>
                <p className="text-[11.5px] text-slate-500">
                    Printed on the office's official Excel layout. You'll be asked for the details the encode form doesn't capture (decision numbers,
                    setback, resolutions, signatories, checklist).
                </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PERMITS.map((p) => (
                    <button
                        key={p.type}
                        type="button"
                        onClick={() => setOpen(p.type)}
                        className={`text-left p-3 rounded-xl border transition-all cursor-pointer hover:shadow-sm ${
                            p.type === suggested ? "border-[#0b2a5b] bg-blue-50/60" : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            <span className="text-lg">{p.icon}</span>
                            <div className="min-w-0">
                                <p className="text-[12.5px] font-bold text-slate-900">{p.label}</p>
                                <p className="text-[11px] text-slate-500">
                                    PDF · {p.paper}
                                    {p.type === suggested && " · matches this application"}
                                </p>
                            </div>
                        </div>
                    </button>
                ))}
            </div>
            {open && <GeneratePermitModal app={app} initialType={open} onClose={() => setOpen(null)} />}
        </div>
    );
}

export default function GeneratePermitModal({ app, initialType, onClose }) {
    const [type, setType] = useState(initialType || defaultPermitFor(app));
    const [schema, setSchema] = useState(null);
    const [values, setValues] = useState({});
    const [cells, setCells] = useState({});
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(null); // "pdf" | "xlsx"
    const [error, setError] = useState("");
    const [previewUrl, setPreviewUrl] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState(null);
    const abortController = useRef(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError("");
        axios
            .get(`/applications/${app.id}/permit-schema/${type}`)
            .then(({ data }) => {
                if (cancelled) return;
                const saved = { ...readJson(sharedKey), ...readJson(appKey(app.id)) };
                const v = {};
                data.schema.fields.forEach((f) => {
                    const remembered = saved[f.key];
                    v[f.key] = remembered !== undefined && remembered !== "" ? remembered : f.default;
                });
                const c = {};
                data.schema.dropdowns.forEach((d) => {
                    c[d.cell] = saved[`${type}:${d.cell}`] ?? d.default ?? "";
                });
                setSchema(data.schema);
                setValues(v);
                setCells(c);
            })
            .catch((e) => !cancelled && setError(e.response?.data?.message || "Could not load the permit fields."))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, [app.id, type]);

    const groups = useMemo(() => {
        if (!schema) return [];
        const by = {};
        schema.fields.forEach((f) => (by[f.group] ||= []).push(f));
        return Object.keys(by)
            .sort((a, b) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b))
            .map((g) => ({ name: g, fields: by[g] }));
    }, [schema]);

    const checklist = useMemo(() => {
        if (!schema) return [];
        const by = {};
        schema.dropdowns.forEach((d) => (by[d.section] ||= []).push(d));
        return Object.entries(by);
    }, [schema]);

    const missing = schema ? schema.fields.filter((f) => f.type !== "check" && /_DN$|^ADMIN$/.test(f.key) && !String(values[f.key] ?? "").trim()) : [];

    const remember = () => {
        const perApp = readJson(appKey(app.id));
        const shared = readJson(sharedKey);
        const defaults = Object.fromEntries(schema.fields.map((f) => [f.key, f.default]));
        Object.entries(values).forEach(([k, v]) => {
            const target = SHARED_KEYS.includes(k) ? shared : perApp;
            if (String(v ?? "") === String(defaults[k] ?? "")) delete target[k];
            else target[k] = v;
        });
        Object.entries(cells).forEach(([cell, v]) => (perApp[`${type}:${cell}`] = v));
        localStorage.setItem(appKey(app.id), JSON.stringify(perApp));
        localStorage.setItem(sharedKey, JSON.stringify(shared));
    };

    
    useEffect(() => {
        if (!schema || loading) return;

        // Cancel previous request if any
        if (abortController.current) {
            abortController.current.abort();
        }

        const controller = new AbortController();
        abortController.current = controller;

        const timer = setTimeout(async () => {
            setPreviewLoading(true);
            setPreviewError(null);
            try {
                const defaults = Object.fromEntries(schema.fields.map((f) => [f.key, f.default]));
                const cleanValues = Object.fromEntries(Object.entries(values).filter(([k, v]) => String(v ?? "") !== String(defaults[k] ?? "")));
                const payload = { fields: { ...cleanValues, ...cells }, format: "pdf" };
                
                const res = await fetch(`/applications/${app.id}/export-preview/${type}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": document.querySelector('meta[name="csrf-token"]')?.content },
                    body: JSON.stringify(payload),
                    signal: controller.signal,
                });
                if (!res.ok) throw new Error("Preview generation failed");
                const blob = await res.blob();
                setPreviewUrl(URL.createObjectURL(blob));
            } catch (err) {
                if (err.name !== "AbortError") {
                    console.error(err);
                    setPreviewError(err.message);
                }
            } finally {
                setPreviewLoading(false);
            }
        }, 3500);

        return () => {
            clearTimeout(timer);
            if (abortController.current) abortController.current.abort();
        };
    }, [values, cells, schema]);

    // Clean up blob URL on unmount or type change
    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    const generate = async (format) => {
        setBusy(format);
        setError("");
        // Open the tab right away so the browser doesn't block it as a pop-up
        const tab = format === "pdf" ? window.open("", "_blank") : null;
        if (tab) tab.document.write("<p style='font-family:sans-serif;padding:2rem'>Generating permit…</p>");
        try {
            const res = await axios.post(
                `/applications/${app.id}/export-document/${type}`,
                { fields: values, cells, format },
                { responseType: "blob" }
            );
            remember();
            const url = URL.createObjectURL(res.data);
            const name = `${schema.label.replace(/\s+/g, "_")}_${app.reference_number || app.id}.${format}`;
            if (tab) {
                tab.location.href = url;
            } else {
                const a = document.createElement("a");
                a.href = url;
                a.download = name;
                a.click();
            }
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
        } catch (e) {
            tab?.close();
            let msg = "Failed to generate the permit.";
            if (e.response?.data instanceof Blob) {
                try {
                    msg = JSON.parse(await e.response.data.text()).message || msg;
                } catch {
                    /* keep default */
                }
            }
            setError(msg);
        } finally {
            setBusy(null);
        }
    };

    const set = (key, v) => setValues((s) => ({ ...s, [key]: v }));

    return (
        <div className="fixed inset-0 z-[999] bg-slate-950/70 flex items-center justify-center p-3 sm:p-5" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[85rem] max-h-[92vh] flex flex-col lg:flex-row overflow-hidden">
                <div className="flex flex-col flex-1 min-w-0 lg:max-w-4xl border-r border-slate-200">
                {/* Header */}
                <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
                    <div className="min-w-0">
                        <h3 className="text-[15px] font-extrabold text-slate-900">Generate permit</h3>
                        <p className="text-[11.5px] text-slate-500 truncate">
                            {app.reference_number} · {app.applicant_name}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} disabled={!!busy} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer" aria-label="Close">
                        ✕
                    </button>
                </div>

                {/* Permit picker */}
                <div className="px-5 py-2.5 border-b border-slate-200 flex gap-2 overflow-x-auto shrink-0">
                    {PERMITS.map((p) => (
                        <button
                            key={p.type}
                            type="button"
                            disabled={!!busy}
                            onClick={() => setType(p.type)}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer ${
                                type === p.type ? "bg-[#0b2a5b] border-[#0b2a5b] text-white" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                            }`}
                        >
                            <span>{p.icon}</span>
                            {p.label}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                    {loading && <p className="text-[12.5px] text-slate-500">Loading fields…</p>}

                    {!loading && schema && (
                        <>
                            <p className="text-[11.5px] text-slate-500">
                                Prefilled from the application — edit anything before generating. Paper: <b>{schema.paper === "FOLIO" ? "8.5 × 13 (long)" : "A4"}</b>.
                            </p>

                            {groups.map((g) => (
                                <section key={g.name}>
                                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">{g.name}</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
                                        {g.fields.map((f) => (
                                            <Field key={f.key} field={f} value={values[f.key]} onChange={(v) => set(f.key, v)} />
                                        ))}
                                    </div>
                                </section>
                            ))}

                            {checklist.length > 0 && (
                                <section>
                                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Checklist & recommendations</h4>
                                    <p className="text-[11px] text-slate-400 mb-2">Same dropdowns as in the Excel sheet.</p>
                                    <div className="space-y-3">
                                        {checklist.map(([section, items]) => (
                                            <div key={section} className="rounded-lg border border-slate-200">
                                                <p className="px-3 py-1.5 text-[11px] font-semibold text-slate-600 bg-slate-50 border-b border-slate-200">{section}</p>
                                                <div className="divide-y divide-slate-100">
                                                    {items.map((d) => (
                                                        <div key={d.cell} className="flex items-center gap-3 px-3 py-1.5">
                                                            <span className="flex-1 text-[12px] text-slate-700 line-clamp-2" title={d.label}>
                                                                {d.label}
                                                            </span>
                                                            <select
                                                                value={cells[d.cell] ?? ""}
                                                                onChange={(e) => setCells((s) => ({ ...s, [d.cell]: e.target.value }))}
                                                                className="h-8 rounded-md border border-slate-300 text-[12px] px-2 max-w-[14rem] shrink-0"
                                                            >
                                                                <option value="">—</option>
                                                                {withCurrent(d.options, cells[d.cell]).map((o) => (
                                                                    <option key={o} value={o}>
                                                                        {o}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-slate-100 bg-white flex flex-wrap items-center justify-between gap-2 shrink-0">
                    <div className="text-[11.5px] min-h-[1rem]">
                        {error ? (
                            <span className="text-rose-600 font-semibold">{error}</span>
                        ) : missing.length > 0 ? (
                            <span className="text-amber-600">Still blank: {missing.map((f) => f.label).join(", ")}</span>
                        ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={loading || !!busy || !schema}
                            onClick={() => generate("xlsx")}
                            className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                        >
                            {busy === "xlsx" ? "Preparing…" : "Excel copy"}
                        </button>
                        <button
                            type="button"
                            disabled={loading || !!busy || !schema}
                            onClick={() => generate("pdf")}
                            className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:bg-slate-300 cursor-pointer"
                        >
                            {busy === "pdf" ? "Generating PDF…" : `Generate ${schema?.label || "permit"} PDF`}
                        </button>
                    </div>
                
                </div>
                
                </div>
                {/* Right Pane: Live Preview */}
                <div className="hidden lg:flex flex-col w-[600px] bg-slate-100 shrink-0 relative">
                    <div className="px-5 py-3 border-b border-slate-200 bg-white flex items-center justify-between shadow-sm z-10">
                        <h3 className="text-[13px] font-bold text-slate-700">Live Preview</h3>
                        {previewLoading && <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full animate-pulse">Updating...</span>}
                    </div>
                    <div className="flex-1 overflow-auto p-6 flex justify-center bg-[#525659]">
                        {previewUrl ? (
                            <div className={`w-full bg-white shadow-xl ${type === 'DP' ? 'aspect-[8.5/13]' : 'aspect-[1/1.414]'} relative`}>
                                <iframe src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`} className="absolute inset-0 w-full h-full border-0" />
                            </div>
                        ) : previewError ? (
                            <div className="text-rose-500 text-sm mt-10 font-semibold">{previewError}</div>
                        ) : (
                            <div className="text-slate-400 text-sm mt-10">Loading preview...</div>
                        )}
                    </div>
                </div>
            </div>
        </div>

    );
}

const withCurrent = (options = [], current) => (current && !options.includes(current) ? [current, ...options] : options);

const inputCls = "w-full h-9 rounded-md border border-slate-300 px-2.5 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-[#0b2a5b]/30 bg-white";
const inputClsReadOnly = "w-full h-9 rounded-md border border-slate-200 bg-slate-100 text-slate-500 px-2.5 text-[12.5px] cursor-not-allowed select-none focus:outline-none";

function Field({ field, value, onChange }) {
    const isReadOnly = !!field.readonly;
    const currentCls = isReadOnly ? inputClsReadOnly : inputCls;

    if (field.type === "check") {
        return (
            <label className={`flex items-center gap-2 text-[12.5px] text-slate-700 h-9 ${isReadOnly ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                <input type="checkbox" disabled={isReadOnly} checked={value === true || value === "true" || value === "1"} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4" />
                {field.label}
            </label>
        );
    }

    return (
        <label className={`block ${field.type === "allowed_use" ? "sm:col-span-2" : ""}`}>
            <span className="block text-[11.5px] font-semibold text-slate-600 mb-1 flex items-center justify-between">
                {field.label}
                {isReadOnly && <span className="text-[10px] font-normal text-slate-400 italic">Fetched from Application</span>}
            </span>
            {field.type === "select" ? (
                <select disabled={isReadOnly} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={currentCls}>
                    <option value="">—</option>
                    {withCurrent(field.options, value).map((o) => (
                        <option key={o} value={o}>
                            {o}
                        </option>
                    ))}
                </select>
            ) : field.type === "allowed_use" ? (
                <AllowedUse field={field} value={value} onChange={onChange} disabled={isReadOnly} />
            ) : (
                <input readOnly={isReadOnly} disabled={isReadOnly} type={field.type === "date" ? "date" : "text"} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={currentCls} />
            )}
        </label>
    );
}

// Allowed uses come from the "ALLOWED USES LIST" sheet: pick the zone's section, then the use (or type one).
function AllowedUse({ field, value, onChange, disabled }) {
    const sections = field.sections || [];
    const [section, setSection] = useState(field.default_section || sections[0]?.section || "");
    const uses = sections.find((s) => s.section === section)?.uses || [];
    const listId = `allowed-uses-${field.key}`;

    return (
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,14rem)_1fr] gap-2">
            <select disabled={disabled} value={section} onChange={(e) => setSection(e.target.value)} className={disabled ? inputClsReadOnly : inputCls}>
                {sections.map((s) => (
                    <option key={s.section} value={s.section}>
                        {s.section}
                    </option>
                ))}
            </select>
            <input disabled={disabled} readOnly={disabled} list={listId} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="Type to search the allowed uses…" className={disabled ? inputClsReadOnly : inputCls} />
            <datalist id={listId}>
                {uses.map((u) => (
                    <option key={u} value={u} />
                ))}
            </datalist>
        </div>
    );
}
