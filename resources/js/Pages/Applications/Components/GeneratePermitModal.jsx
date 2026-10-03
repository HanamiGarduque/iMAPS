// resources/js/Pages/Applications/Components/GeneratePermitModal.jsx
// Generate Permit: pick a permit, review/complete the fields the encode form doesn't capture,
// and get a PDF filled into the office's own Excel layout (config/permits.php on the server).
import React, { useEffect, useMemo, useState, useRef } from "react";
import axios from "axios";
import Swal from "sweetalert2";

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
    // Zoning Evaluation is default regardless of application type
    return "ze";
}

export function getRecommendedPermitForApp(app = {}) {
    const t = (app.application_type || "").toLowerCase();
    if (t.includes("development") || t.includes("palc")) return "dp";
    if (t.includes("zoning cert") || t.includes("rezoning") || t.includes("reclassification")) return "zc";
    return "lc";
}

export function getAvailablePermitsForApp(app = {}) {
    const t = (app.application_type || "").toLowerCase();
    const allowed = ["ze"];

    if (t.includes("development")) {
        allowed.push("dp");
        allowed.push("lc");
    } else if (t.includes("zoning cert") || t.includes("rezoning") || t.includes("reclassification")) {
        allowed.push("zc");
    } else if (t.includes("palc")) {
        allowed.push("dp");
        allowed.push("lc");
    } else {
        allowed.push("lc");
    }

    return PERMITS.filter((p) => allowed.includes(p.type));
}

// ── Tab content: list of permits, each opens the modal ──
export function PermitExportPanel({ app }) {
    const [open, setOpen] = useState(null);
    const [savedPermits, setSavedPermits] = useState(app?.generated_permits || app?.generatedPermits || []);
    const defaultPermit = defaultPermitFor(app);
    const recommendedPermit = getRecommendedPermitForApp(app);

    const fetchSavedPermits = async () => {
        try {
            const { data } = await axios.get(`/applications/${app.id}/saved-permits`);
            if (data?.permits) setSavedPermits(data.permits);
        } catch (e) {
            console.error("Failed to fetch saved permits:", e);
        }
    };

    useEffect(() => {
        if (app?.id) fetchSavedPermits();
    }, [app?.id]);

    const handleDeleteSavedPermit = (item) => {
        const permitId = typeof item === "object" ? item?.id : item;
        const permitName = typeof item === "object" ? item?.permit_name || "this permit document" : "this permit document";

        Swal.fire({
            title: "Delete stored permit?",
            text: `Are you sure you want to delete "${permitName}"? This action cannot be undone.`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Delete Permit",
            cancelButtonText: "Cancel",
            buttonsStyling: false,
            focusCancel: true,
            customClass: {
                popup: "rounded-2xl border border-slate-200 shadow-xl p-6 bg-white font-sans",
                title: "text-base font-bold text-slate-900",
                htmlContainer: "text-xs text-slate-500 mt-1",
                actions: "flex items-center justify-end gap-2.5 mt-5",
                confirmButton:
                    "inline-flex items-center justify-center px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer",
                cancelButton:
                    "inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-200 transition-colors cursor-pointer",
            },
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    await axios.delete(`/applications/${app.id}/saved-permits/${permitId}`);
                    fetchSavedPermits();
                    Swal.fire({
                        toast: true,
                        position: "top-end",
                        icon: "success",
                        title: "Permit document deleted",
                        showConfirmButton: false,
                        timer: 2000,
                    });
                } catch (e) {
                    Swal.fire({
                        icon: "error",
                        title: "Delete Failed",
                        text: e.response?.data?.message || "Could not delete stored permit.",
                        customClass: {
                            popup: "rounded-2xl border border-slate-200 shadow-xl p-6 bg-white",
                            confirmButton: "px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer",
                        },
                    });
                }
            }
        });
    };

    return (
        <div className="space-y-4 pb-4">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <h3 className="text-xs font-bold text-slate-900">Generate permit & evaluation</h3>
                <p className="text-[11.5px] text-slate-500 mt-0.5">
                    Permit formats are tailored to the application type. Zoning Evaluation is default for all applications.
                    All generated permits are automatically stored permanently under this application.
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {getAvailablePermitsForApp(app).map((p) => {
                    const isDefault = p.type === defaultPermit;
                    const isRecommended = p.type === recommendedPermit;

                    return (
                        <button
                            key={p.type}
                            type="button"
                            onClick={() => setOpen(p.type)}
                            className={`text-left p-3 rounded-xl border transition-all cursor-pointer hover:shadow-sm ${
                                isRecommended
                                    ? "border-[#0b2a5b] bg-blue-50/60 ring-1 ring-blue-900/10"
                                    : isDefault
                                    ? "border-emerald-300 bg-emerald-50/30"
                                    : "border-slate-200 bg-white hover:bg-slate-50"
                            }`}
                        >
                            <div className="flex items-center gap-2.5">
                                <span className="text-xl">{p.icon}</span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <p className="text-[12.5px] font-bold text-slate-900">{p.label}</p>
                                        {isDefault && (
                                            <span className="text-[9.5px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-md">
                                                Default
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                        PDF · {p.paper}
                                    </p>
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Saved Permits & Issued Documents List */}
            <div className="mt-5 border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-2.5">
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <span>📁</span> Saved Permits & Stored Documents ({savedPermits.length})
                    </h4>
                    <button
                        type="button"
                        onClick={fetchSavedPermits}
                        className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                    >
                        Refresh
                    </button>
                </div>

                {savedPermits.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-center text-xs text-slate-400">
                        No stored permits for this application yet. Generated permits will be automatically stored here.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {savedPermits.map((item) => (
                            <div key={item.id} className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-3 shadow-2xs">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-slate-900 truncate">{item.permit_name}</span>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${item.file_format === 'pdf' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                            {item.file_format}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                        Saved {new Date(item.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                        {item.formatted_file_size && ` · ${item.formatted_file_size}`}
                                        {item.generated_by?.name && ` · by ${item.generated_by.name}`}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <a
                                        href={`/applications/${app.id}/saved-permits/${item.id}/download`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                                    >
                                        <span>📥</span> {item.file_format === 'pdf' ? 'View PDF' : 'Download'}
                                    </a>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteSavedPermit(item)}
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors"
                                        title="Delete stored permit"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {open && (
                <GeneratePermitModal
                    app={app}
                    initialType={open}
                    onClose={() => {
                        setOpen(null);
                        fetchSavedPermits();
                    }}
                />
            )}
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
    const [previewDriver, setPreviewDriver] = useState(null); // libreoffice | excel | dompdf
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
                // Use axios (not fetch): the CSRF <meta> tag was removed in Loop 6, and axios
                // sends the X-XSRF-TOKEN header from Laravel's cookie automatically. With fetch
                // the request got a 419 → redirect → the dashboard HTML ended up in the iframe.
                const res = await axios.post(
                    `/applications/${app.id}/export-preview/${type}`,
                    { fields: values, cells, format: "pdf" },
                    { responseType: "blob", signal: controller.signal }
                );
                if (!String(res.headers["content-type"] || "").includes("pdf")) {
                    throw new Error("Preview generation failed");
                }
                setPreviewDriver(res.headers["x-permit-pdf-driver"] || null);
                setPreviewUrl(URL.createObjectURL(res.data));
            } catch (err) {
                if (!axios.isCancel(err) && err.name !== "CanceledError" && err.name !== "AbortError") {
                    console.error(err);
                    let msg = err.message || "Preview generation failed";
                    if (err.response?.data instanceof Blob) {
                        try {
                            msg = JSON.parse(await err.response.data.text()).message || msg;
                        } catch {
                            /* keep default */
                        }
                    }
                    setPreviewError(msg);
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
                    {getAvailablePermitsForApp(app).map((p) => {
                        const isDefault = p.type === defaultPermitFor(app);
                        const isActive = type === p.type;

                        return (
                            <button
                                key={p.type}
                                type="button"
                                disabled={!!busy}
                                onClick={() => setType(p.type)}
                                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer ${
                                    isActive
                                        ? "bg-[#0b2a5b] border-[#0b2a5b] text-white"
                                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                                }`}
                            >
                                <span>{p.icon}</span>
                                {p.label}
                                {isDefault && (
                                    <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${isActive ? "bg-emerald-500 text-white" : "bg-emerald-100 text-emerald-800"}`}>
                                        Default
                                    </span>
                                )}
                            </button>
                        );
                    })}
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
                        <div className="flex items-center gap-2">
                            {previewLoading && <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full animate-pulse">Updating...</span>}
                            {previewDriver && (
                                <span
                                    className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${
                                        previewDriver === "dompdf" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"
                                    }`}
                                    title={
                                        previewDriver === "dompdf"
                                            ? "Neither LibreOffice nor Microsoft Excel was found, so this is a simplified layout. Install either one for the exact office layout."
                                            : `PDF made with ${previewDriver === "excel" ? "Microsoft Excel" : "LibreOffice"}`
                                    }
                                >
                                    {previewDriver === "dompdf" ? "Draft quality" : previewDriver === "excel" ? "via Excel" : "via LibreOffice"}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto p-6 flex justify-center bg-[#525659]">
                        {previewUrl ? (
                            <div className={`w-full bg-white shadow-xl ${type === 'dp' ? 'aspect-[8.5/13]' : 'aspect-[1/1.414]'} relative`}>
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
