// resources/js/Pages/Applications/Components/GeneratePermitModal.jsx
// Generate Permit: pick a permit, review/complete the fields the encode form doesn't capture,
// and get a PDF filled into the office's own Excel layout (config/permits.php on the server).
import React, { useEffect, useMemo, useState, useRef } from "react";
import axios from "axios";
import Swal from "sweetalert2";

export const PERMITS = [
    { type: "ze", label: "Zoning Evaluation", paper: "A4" },
    { type: "lc", label: "Locational Clearance", paper: "A4" },
    { type: "zc", label: "Zoning Certification", paper: "A4" },
    { type: "dp", label: "Development Permit", paper: "8.5 × 13 (long)" },
];

export function PermitIcon({ type, className = "w-5 h-5" }) {
    switch (type) {
        case "ze":
            return (
                <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                </svg>
            );
        case "lc":
            return (
                <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
            );
        case "zc":
            return (
                <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                </svg>
            );
        case "dp":
            return (
                <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.333A48.408 48.408 0 0012 9.75c-2.551 0-5.056.2-7.5.583V21h15z" />
                </svg>
            );
        default:
            return (
                <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
            );
    }
}

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

export function getRecommendedPermitTypes(app = {}) {
    const rawTypes = (app.application_type || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

    const recommended = [];

    for (const type of rawTypes) {
        const lower = type.toLowerCase();
        if (lower.includes("palc")) {
            recommended.push("dp");
        } else if (lower.includes("development")) {
            recommended.push("dp");
        } else if (lower.includes("zoning cert")) {
            recommended.push("zc");
        } else if (lower.includes("locational") || lower.includes("clearance")) {
            recommended.push("lc");
        } else if (lower.includes("rezoning") || lower.includes("reclassification")) {
            recommended.push("lc");
        }
    }

    if (recommended.length === 0) {
        const lower = (app.application_type || "").toLowerCase();
        if (lower.includes("palc") || lower.includes("development")) {
            recommended.push("dp");
        } else if (lower.includes("zoning cert")) {
            recommended.push("zc");
        } else if (lower.includes("rezoning") || lower.includes("reclassification")) {
            recommended.push("lc");
        } else {
            recommended.push("lc");
        }
    }

    return [...new Set(recommended)];
}

export function getRecommendedPermitForApp(app = {}) {
    const types = getRecommendedPermitTypes(app);
    return types[0] || "lc";
}

export function getMissingRecommendedPermits(app = {}, savedPermits = []) {
    const recommended = getRecommendedPermitTypes(app);
    const savedTypes = new Set(
        (savedPermits || [])
            .map((p) => (typeof p === "object" ? p?.permit_type : p))
            .filter(Boolean)
    );

    const lowerAppType = (app.application_type || "").toLowerCase();
    const hasPalc = lowerAppType.includes("palc");

    const missing = [];
    for (const type of recommended) {
        // If PALC, generating either 'dp' or 'lc' satisfies PALC unless 'lc' is explicitly required
        if (type === "dp" && hasPalc && savedTypes.has("lc") && !recommended.includes("lc")) {
            continue;
        }

        if (!savedTypes.has(type)) {
            const pObj = PERMITS.find((p) => p.type === type) || { type, label: type.toUpperCase() };
            missing.push(pObj);
        }
    }

    return missing;
}

// Required vs optional permits for release, and how many required ones are already saved.
export function getPermitChecklist(app = {}, savedPermits = []) {
    const savedTypes = new Set((savedPermits || []).map((p) => (typeof p === "object" ? p?.permit_type : p)).filter(Boolean));
    const recommended = getRecommendedPermitTypes(app);
    const permits = getAvailablePermitsForApp(app);
    const required = permits.filter((p) => recommended.includes(p.type));
    const optional = permits.filter((p) => !recommended.includes(p.type));
    return { required, optional, savedTypes, readyCount: required.filter((p) => savedTypes.has(p.type)).length };
}

export function getAvailablePermitsForApp(app = {}) {
    const t = (app.application_type || "").toLowerCase();
    const isAmendment = String(app.application_stream || "").toLowerCase() === "amendment";
    const allowed = ["ze"];

    if (t.includes("development") || t.includes("palc")) {
        allowed.push("dp");
        allowed.push("lc");
    }

    if (t.includes("locational") || t.includes("clearance")) {
        allowed.push("lc");
    }

    if (t.includes("zoning cert") || t.includes("rezoning") || t.includes("reclassification")) {
        allowed.push("zc");
        if (isAmendment || app.sb_ordinance_number || t.includes("locational") || t.includes("clearance")) {
            allowed.push("lc");
        }
    }

    if (!allowed.includes("lc") && !t.includes("zoning cert")) {
        allowed.push("lc");
    }

    const uniqueAllowed = [...new Set(allowed)];
    return PERMITS.filter((p) => uniqueAllowed.includes(p.type));
}

// ── Tab content: list of permits, each opens the modal ──
// ── Miniature mock-ups of each permit's real layout (drawn, not the actual template) ──
const MockLine = ({ w = "w-full", c = "bg-slate-200", h = "h-[1.5px]" }) => <span className={`block ${h} rounded-full ${w} ${c}`} />;
const MockSeal = ({ tone }) => <span className={`shrink-0 w-2.5 h-2.5 rounded-full ring-1 ${tone}`} />;
const MockHead = ({ tone, seal = true }) => (
    <span className="flex items-center justify-center gap-1">
        {seal && <MockSeal tone={tone} />}
        <span className="flex flex-col items-center gap-[2px]">
            <MockLine w="w-7" c="bg-slate-300" />
            <MockLine w="w-9" c="bg-slate-300" />
            <MockLine w="w-5" />
        </span>
    </span>
);
const MockTitle = ({ children, accent, spaced = false }) => (
    <span className={`block text-center font-bold uppercase leading-tight ${spaced ? "text-[5.5px] tracking-[0.18em]" : "text-[5.5px] tracking-wide"} ${accent}`}>{children}</span>
);
// A bordered table: `rows` rows of `cols` cells (cell content = a short line)
const MockGrid = ({ rows, cols = 2, band = false, className = "" }) => (
    <span className={`grid border border-slate-300 ${className}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: rows * cols }, (_, i) => (
            <span key={i} className={`h-[5px] border-slate-200 ${i % cols ? "border-l" : ""} ${i >= cols ? "border-t" : ""} ${band && i < cols ? "bg-slate-200" : ""} flex items-center px-[1.5px]`}>
                <MockLine w={i % 2 ? "w-3/5" : "w-4/5"} h="h-[1px]" />
            </span>
        ))}
    </span>
);
const MockBand = ({ c = "bg-slate-200" }) => <span className={`block h-[3.5px] ${c}`} />;

function PermitMock({ type, label, todo }) {
    const seal = todo ? "ring-blue-300 bg-blue-50" : "ring-slate-300 bg-slate-50";
    const accent = todo ? "text-blue-700" : "text-slate-700";
    if (type === "dp") {
        return (
            <>
                <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full ring-1 ring-slate-300 bg-slate-50 shrink-0" />
                    <span className="flex-1 flex flex-col items-center gap-[2px]"><MockLine w="w-8" c="bg-slate-300" /><MockLine w="w-10" c="bg-slate-300" /><MockLine w="w-6" /></span>
                </span>
                <span className="mt-1 grid grid-cols-[2fr_3fr] gap-[2px] items-center">
                    <MockGrid rows={3} cols={2} />
                    <MockTitle accent={accent}>Development permit</MockTitle>
                </span>
                <span className="mt-1 flex flex-col gap-[1.5px]">
                    {[0, 1, 2, 3, 4].map((i) => (
                        <span key={i} className="grid grid-cols-2 gap-[1.5px]"><MockBand /><MockBand /></span>
                    ))}
                </span>
                <span className="mt-1"><MockBand c="bg-slate-300" /></span>
                <span className="mt-[2px] flex flex-col gap-[2px]"><MockLine /><MockLine w="w-4/5" /><MockLine w="w-3/5" /></span>
                <span className="mt-[2px]"><MockBand c="bg-slate-300" /></span>
                <span className="mt-1 flex flex-col gap-[2px]"><MockLine /><MockLine w="w-11/12" /><MockLine /><MockLine w="w-2/3" /></span>
            </>
        );
    }
    if (type === "ze") {
        return (
            <>
                <MockHead tone={seal} />
                <span className="mt-1"><MockTitle accent={accent}>Zoning evaluation</MockTitle></span>
                <span className="mt-1 grid grid-cols-8 border border-slate-300">
                    {Array.from({ length: 8 }, (_, i) => (
                        <span key={i} className={`h-[4px] ${i % 3 === 0 ? "bg-amber-300" : "bg-white"} ${i ? "border-l border-slate-300" : ""}`} />
                    ))}
                </span>
                <MockGrid rows={6} cols={4} className="mt-[2px]" />
                <span className="mt-[2px]"><MockBand c="bg-slate-300" /></span>
                <span className="mt-[2px] grid grid-cols-[1fr_6fr] border border-slate-300">
                    {Array.from({ length: 7 }, (_, i) => (
                        <span key={i} className="contents">
                            <span className={`h-[4.5px] ${i ? "border-t" : ""} border-slate-200`} />
                            <span className={`h-[4.5px] ${i ? "border-t" : ""} border-l border-slate-200 flex items-center px-[1.5px]`}><MockLine w={i % 2 ? "w-3/4" : "w-full"} h="h-[1px]" /></span>
                        </span>
                    ))}
                </span>
            </>
        );
    }
    if (type === "zc") {
        return (
            <>
                <MockHead tone={seal} />
                <span className="mt-[3px] flex flex-col items-center gap-[2px]"><MockLine w="w-12" c="bg-slate-400" /></span>
                <span className="mt-1"><MockTitle accent={accent} spaced>Certification</MockTitle></span>
                <span className="mt-1 grid grid-cols-[2fr_3fr] gap-[2px] items-start">
                    <span className="flex flex-col gap-[3px] pt-[1px]"><MockLine /><MockLine w="w-4/5" /><MockLine /><MockLine w="w-3/5" /></span>
                    <MockGrid rows={4} cols={1} />
                </span>
                <MockGrid rows={2} cols={6} band className="mt-1" />
                <span className="mt-1 flex flex-col gap-[2px]"><MockLine /><MockLine /><MockLine w="w-11/12" /><MockLine w="w-2/3" /></span>
                <span className="mt-1 self-end w-[55%] border border-slate-300 px-[2px] py-[2px] flex flex-col items-center gap-[2px]">
                    <MockLine w="w-4/5" h="h-[1px]" /><MockLine w="w-3/5" c="bg-slate-300" /><MockLine w="w-1/2" h="h-[1px]" />
                </span>
            </>
        );
    }
    // lc (default): centred header, title, two-column bordered table, conditions, signatures
    return (
        <>
            <MockHead tone={seal} seal={false} />
            <span className="mt-1"><MockTitle accent={accent}>{label}</MockTitle></span>
            <span className="mt-1 grid grid-cols-2 gap-x-1 gap-y-[2px]"><MockLine w="w-4/5" /><MockLine w="w-4/5" /></span>
            <MockGrid rows={8} cols={2} className="mt-[3px]" />
            <span className="mt-1 flex flex-col gap-[2px]"><MockLine /><MockLine w="w-11/12" /><MockLine /><MockLine w="w-4/5" /><MockLine w="w-3/5" /></span>
            <span className="mt-auto grid grid-cols-2 gap-2 px-1"><MockLine c="bg-slate-300" /><MockLine c="bg-slate-300" /></span>
        </>
    );
}

// part="generate": the permits to make, as a compact list for the For Release status card.
// part="documents": the stored/issued copies, for the Documents tab.
export function PermitExportPanel({ app, savedPermits: propSavedPermits, onSavedPermitsChange, part = "documents" }) {
    const isReleased = app?.status === "Released";
    const [open, setOpen] = useState(null);
    const [localSavedPermits, setLocalSavedPermits] = useState(
        propSavedPermits || app?.generated_permits || app?.generatedPermits || []
    );
    const savedPermits = propSavedPermits !== undefined ? propSavedPermits : localSavedPermits;
    const savedTypes = new Set(
        (savedPermits || []).map((p) => (typeof p === "object" ? p?.permit_type : p)).filter(Boolean)
    );

    const fetchSavedPermits = async () => {
        try {
            const { data } = await axios.get(`/applications/${app.id}/saved-permits`);
            if (data?.permits) {
                setLocalSavedPermits(data.permits);
                onSavedPermitsChange?.(data.permits);
            }
        } catch (e) {
            console.error("Failed to fetch saved permits:", e);
        }
    };

    useEffect(() => {
        if (propSavedPermits) {
            setLocalSavedPermits(propSavedPermits);
        }
    }, [propSavedPermits]);

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
        <div className={part === "documents" ? "pb-4" : ""}>
            {part === "generate" && !isReleased && (() => {
                // Template-gallery style: each permit is a miniature page; click one to generate it
                const { required, optional } = getPermitChecklist(app, savedPermits);
                const byState = (a, b) => savedTypes.has(a.type) - savedTypes.has(b.type);
                const pages = [...[...required].sort(byState).map((p) => ({ ...p, req: true })), ...optional.map((p) => ({ ...p, req: false }))];
                return (
                    <ul className="flex flex-wrap gap-4" aria-label="Permits">
                        {pages.map((p) => {
                            const ready = savedTypes.has(p.type);
                            const todo = p.req && !ready;
                            const state = ready ? "Ready" : p.req ? "Required" : "Optional";
                            return (
                                <li key={p.type} className="w-[136px]">
                                    <button
                                        type="button"
                                        onClick={() => setOpen(p.type)}
                                        aria-label={`${ready ? "Regenerate" : "Generate"} ${p.label} (${state.toLowerCase()}, ${p.paper})`}
                                        title={`${ready ? "Regenerate" : "Generate"} ${p.label}`}
                                        className="group block w-full text-left cursor-pointer focus-visible:outline-none"
                                    >
                                        {/* Mock-up of a portrait bond-paper page: letterhead, title, form lines, signatures */}
                                        <span className="relative flex flex-col w-[90px] h-[128px] px-[7px] pt-[7px] pb-1.5 rounded-[3px] bg-white overflow-hidden ring-1 ring-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_4px_10px_-4px_rgba(15,23,42,0.12)] transition-all duration-150 group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:ring-2 group-hover:ring-blue-500 group-focus-visible:ring-2 group-focus-visible:ring-blue-500" aria-hidden="true">
                                            <PermitMock type={p.type} label={p.label} todo={todo} />
                                            {/* Hover action bar */}
                                            <span className="absolute inset-x-0 bottom-0 py-1 bg-blue-600/95 text-center text-[10px] font-semibold text-white translate-y-full group-hover:translate-y-0 group-focus-visible:translate-y-0 transition-transform duration-150">
                                                {ready ? "Regenerate" : "Generate"}
                                            </span>
                                        </span>
                                        <span className="mt-1.5 block text-[12px] font-medium text-slate-900 leading-snug truncate" title={p.label}>{p.label}</span>
                                        <span className="flex items-center gap-1 text-[11px] text-slate-500 truncate">
                                            {(ready || todo) && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ready ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden="true" />}
                                            <span className={ready ? "text-emerald-700" : todo ? "text-amber-700" : ""}>{state}</span>
                                            <span className="text-slate-400">· {p.paper}</span>
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                );
            })()}

            {part === "documents" && (
            <div>
                <div className="flex items-center justify-between mb-2.5">
                    <h4 className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">
                        {isReleased ? "Issued permits" : "Saved permits"}
                        <span className="min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-slate-100 text-[11px] font-medium text-slate-600 tabular-nums">
                            {savedPermits.length}
                        </span>
                    </h4>
                    <button
                        type="button"
                        onClick={fetchSavedPermits}
                        title="Refresh list"
                        aria-label="Refresh list"
                        className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                    </button>
                </div>

                {savedPermits.length === 0 ? (
                    <div className="py-8 px-4 rounded-lg border border-dashed border-slate-200 bg-white text-center">
                        <p className="text-[12.5px] font-medium text-slate-600">No permits saved yet</p>
                        <p className="text-[11.5px] text-slate-400 mt-0.5">
                            {isReleased ? "No permit documents were recorded for this released application." : "Every permit you generate is saved here automatically."}
                        </p>
                    </div>
                ) : (
                    <ul className="rounded-lg border border-slate-200 divide-y divide-slate-100 bg-white">
                        {savedPermits.map((item) => {
                            const isPdf = item.file_format === "pdf";
                            return (
                                <li key={item.id} className="flex items-center gap-3 pl-3.5 pr-2 py-2.5">
                                    <PermitIcon type={item.permit_type} className="w-4 h-4 text-slate-400 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="flex items-center gap-2">
                                            <span className="text-[12.5px] font-medium text-slate-900 truncate">{item.permit_name}</span>
                                            <span className="shrink-0 px-1.5 h-[18px] inline-flex items-center rounded text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-500">
                                                {item.file_format}
                                            </span>
                                        </p>
                                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                                            {new Date(item.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                            {item.formatted_file_size && ` · ${item.formatted_file_size}`}
                                            {item.generated_by?.name && ` · ${item.generated_by.name}`}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-0.5 shrink-0">
                                        <a
                                            href={`/applications/${app.id}/saved-permits/${item.id}/download`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title={isPdf ? "View PDF" : "Download"}
                                            aria-label={`${isPdf ? "View" : "Download"} ${item.permit_name}`}
                                            className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                                        >
                                            {isPdf ? (
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                            ) : (
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                            </svg>
                                            )}
                                        </a>
                                        {!isReleased && (
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteSavedPermit(item)}
                                                title="Delete"
                                                aria-label={`Delete ${item.permit_name}`}
                                                className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
            )}

            {!isReleased && open && (
                <GeneratePermitModal
                    app={app}
                    initialType={open}
                    savedPermits={savedPermits}
                    onClose={() => {
                        setOpen(null);
                        fetchSavedPermits();
                    }}
                    onPermitGenerated={() => {
                        fetchSavedPermits();
                    }}
                />
            )}
        </div>
    );
}

export default function GeneratePermitModal({ app, initialType, onClose, onPermitGenerated, savedPermits = [] }) {
    // One dialog = one permit (chosen from its card); to make another, close and pick that card
    const [type] = useState(initialType || defaultPermitFor(app));
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
    const [success, setSuccess] = useState(null); // { label, regenerated, url, at } after a PDF is saved
    const abortController = useRef(null);
    const previewShown = useRef(false); // first preview for this permit renders without waiting

    const [modalSavedPermits, setModalSavedPermits] = useState(
        savedPermits || app?.generated_permits || app?.generatedPermits || []
    );

    useEffect(() => {
        if (savedPermits && savedPermits.length) {
            setModalSavedPermits(savedPermits);
        }
    }, [savedPermits]);

    const isAlreadyGenerated = useMemo(() => {
        return (modalSavedPermits || []).some(
            (p) => (typeof p === "object" ? p?.permit_type : p) === type
        );
    }, [modalSavedPermits, type]);

    useEffect(() => {
        let cancelled = false;
        previewShown.current = false;
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
        schema.fields.filter((f) => !f.readonly && !needsInput(f)).forEach((f) => (by[f.group] ||= []).push(f));
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

    // Every required field counts toward `missing`; only the ones that start empty get the top box
    const requiredFields = schema ? schema.fields.filter((f) => !f.readonly && needsInput(f)) : [];
    const missing = schema ? schema.fields.filter((f) => !f.readonly && isRequired(f) && !String(values[f.key] ?? "").trim()) : [];
    const missingKeys = new Set(missing.map((f) => f.key));

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

        // No wait for the first preview; while typing, wait until the user pauses
        const delay = previewShown.current ? 800 : 0;
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
                previewShown.current = true;
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
        }, delay);

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
        try {
            const res = await axios.post(
                `/applications/${app.id}/export-document/${type}`,
                { fields: values, cells, format },
                { responseType: "blob" }
            );
            remember();
            const regenerated = isAlreadyGenerated;
            setModalSavedPermits((prev) => [...prev, { permit_type: type }]);
            onPermitGenerated?.(type);
            const url = URL.createObjectURL(res.data);
            if (format === "pdf") {
                // Confirm it worked and let the officer open it from here (a click, so no pop-up blocker)
                setSuccess({ label: schema.label, regenerated, url, at: new Date() });
            } else {
                const a = document.createElement("a");
                a.href = url;
                a.download = `${schema.label.replace(/\s+/g, "_")}_${app.reference_number || app.id}.${format}`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 60_000);
            }
        } catch (e) {
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

    // The generator is already hidden behind the confirmation; closing it frees the PDF and finishes
    const closeSuccess = () => {
        if (success?.url) URL.revokeObjectURL(success.url);
        setSuccess(null);
        onClose();
    };

    const set = (key, v) => setValues((s) => ({ ...s, [key]: v }));

    const permits = getAvailablePermitsForApp(app);

    return (
        <>
        {!success && (
        <div
            className="fixed inset-0 z-[999] bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-6 animate-fade-in duration-150"
            onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="permit-dialog-title"
                className="bg-white rounded-xl shadow-2xl w-full max-w-[1080px] h-[86vh] flex overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            >
                {/* ── Form column ── */}
                <div className="flex flex-col flex-1 min-w-0 lg:border-r border-slate-200">
                    {/* Header: the one permit being issued (picked from its card on the record page) */}
                    <div className="px-5 pt-4 pb-3 border-b border-slate-100 shrink-0">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h3 id="permit-dialog-title" className="text-[15px] font-semibold text-slate-900 leading-tight truncate">
                                    {isAlreadyGenerated ? "Regenerate" : "Generate"} {permits.find((p) => p.type === type)?.label || "permit"}
                                </h3>
                                <p className="mt-0.5 text-[11.5px] text-slate-500 truncate">
                                    {app.reference_number} · {app.applicant_name}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={!!busy}
                                className="-mr-1.5 p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                                aria-label="Close"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                    <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                                </svg>
                            </button>
                        </div>

                        <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-slate-500">
                            <span className={`w-1.5 h-1.5 rounded-full ${isAlreadyGenerated ? "bg-emerald-500" : "bg-slate-300"}`} aria-hidden="true" />
                            <span className={isAlreadyGenerated ? "text-emerald-700" : ""}>{isAlreadyGenerated ? "Saved copy exists" : "Not generated yet"}</span>
                            {schema && <span className="ml-auto">{schema?.paper === "FOLIO" ? "8.5 × 13 in" : "A4"} · PDF</span>}
                        </p>
                    </div>

                    {/* Fields */}
                    <div className="flex-1 overflow-y-auto">
                        {loading && <p className="px-5 py-4 text-[12.5px] text-slate-500">Loading fields…</p>}

                        {!loading && schema && (
                            <>
                                {requiredFields.length > 0 && (
                                    <fieldset className="px-5 pt-4 pb-4">
                                        <legend className="sr-only">Required to issue</legend>
                                        <p className="mb-2.5 text-[12.5px] font-semibold text-slate-900" aria-hidden="true">
                                            Required to issue
                                        </p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2.5">
                                            {requiredFields.map((f) => (
                                                <Field key={f.key} field={f} value={values[f.key]} onChange={(v) => set(f.key, v)} required tag={false} />
                                            ))}
                                        </div>
                                    </fieldset>
                                )}

                                <p className="px-5 pt-1 pb-1.5 text-[11px] font-medium text-slate-400">Prefilled from the application · open a section to change it</p>
                                <div className="mb-3 border-y border-slate-100 divide-y divide-slate-100">
                                    {groups.map((g) => {
                                        const hasMissing = g.fields.some((f) => missingKeys.has(f.key));
                                        const filled = g.fields.filter((f) => f.type !== "check" && String(values[f.key] ?? "").trim()).length;
                                        const total = g.fields.filter((f) => f.type !== "check").length;
                                        return (
                                            <Section key={g.name} title={g.name} summary={hasMissing ? "Needs a value" : filled < total ? `${total - filled} blank` : ""} warn={hasMissing} open={hasMissing}>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2.5">
                                                    {g.fields.map((f) => (
                                                        <Field key={f.key} field={f} value={values[f.key]} onChange={(v) => set(f.key, v)} required={isRequired(f)} />
                                                    ))}
                                                </div>
                                            </Section>
                                        );
                                    })}

                                    {checklist.length > 0 && (() => {
                                        const items = checklist.flatMap(([, list]) => list);
                                        const set_ = items.filter((d) => String(cells[d.cell] ?? "").trim()).length;
                                        return (
                                            <Section title="Checklist & recommendations" summary={set_ < items.length ? `${items.length - set_} not set` : ""}>
                                                <p className="text-[11px] text-slate-400 mb-2.5">Same dropdowns as in the Excel sheet.</p>
                                                <div className="space-y-2.5">
                                                    {checklist.map(([section, list]) => (
                                                        <div key={section} className="rounded-md border border-slate-200 overflow-hidden">
                                                            <p className="px-3 py-1.5 text-[11.5px] font-medium text-slate-700 bg-slate-50 border-b border-slate-200">{section}</p>
                                                            <div className="divide-y divide-slate-100">
                                                                {list.map((d) => (
                                                                    <div key={d.cell} className="flex items-center gap-2.5 px-3 py-1.5">
                                                                        <span className="flex-1 min-w-0 text-[11.5px] text-slate-700 line-clamp-2" title={d.label}>
                                                                            {d.label}
                                                                        </span>
                                                                        <select
                                                                            value={cells[d.cell] ?? ""}
                                                                            onChange={(e) => setCells((s) => ({ ...s, [d.cell]: e.target.value }))}
                                                                            aria-label={d.label}
                                                                            className={`${selectCls} w-40 shrink-0`}
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
                                            </Section>
                                        );
                                    })()}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-5 py-3 border-t border-slate-200 flex items-center gap-3 shrink-0">
                        <p className="flex-1 min-w-0 text-[12px] truncate" title={missing.map((f) => f.label).join(", ") || undefined}>
                            {error ? (
                                <span role="alert" className="text-rose-600 font-medium">{error}</span>
                            ) : missing.length > 0 ? (
                                <span className="text-amber-700">
                                    {missing.length} required field{missing.length === 1 ? "" : "s"} left
                                </span>
                            ) : (
                                <span className="text-slate-500">{isAlreadyGenerated ? "Regenerating saves an updated copy." : "Ready to generate."}</span>
                            )}
                        </p>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={!!busy}
                            className="h-9 px-4 rounded-md text-[12.5px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            // Never issue a permit with a required field blank (the server refuses it too)
                            disabled={loading || !!busy || !schema || missing.length > 0}
                            title={missing.length > 0 ? `Fill in first: ${missing.map((f) => f.label).join(", ")}` : undefined}
                            onClick={() => generate("pdf")}
                            className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/40 disabled:cursor-not-allowed text-white text-[12.5px] font-semibold transition-colors cursor-pointer"
                        >
                            {busy === "pdf" ? (
                                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                            ) : isAlreadyGenerated ? (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                </svg>
                            ) : (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                </svg>
                            )}
                            {busy === "pdf" ? (isAlreadyGenerated ? "Regenerating…" : "Generating…") : isAlreadyGenerated ? "Regenerate" : "Generate PDF"}
                        </button>
                    </div>
                </div>

                {/* ── Live preview: the page floating on a soft canvas ── */}
                <div className="hidden lg:flex flex-col w-[380px] xl:w-[420px] shrink-0 bg-slate-100">
                    <div className="px-5 h-11 flex items-center justify-between shrink-0">
                        <p className="text-[12px] font-medium text-slate-600">Preview</p>
                        <div className="flex items-center gap-2 text-[11px]">
                            {previewLoading && (
                                <span className="inline-flex items-center gap-1.5 text-slate-500">
                                    <span className="w-3 h-3 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" aria-hidden="true" />
                                    Updating
                                </span>
                            )}
                            {/* Only the rough fallback is worth flagging; the normal office layout needs no badge */}
                            {previewDriver === "dompdf" && (
                                <span
                                    className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800"
                                    title="Neither LibreOffice nor Microsoft Excel was available, so this is a simplified layout. Install either one for the exact office layout."
                                >
                                    Draft quality
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 min-h-0 overflow-auto px-5 pb-5 flex justify-center">
                        {previewUrl ? (
                            <div
                                className={`relative w-full self-start bg-white rounded-sm shadow-[0_1px_3px_rgba(15,23,42,0.08),0_12px_32px_-8px_rgba(15,23,42,0.18)] ${
                                    type === "dp" ? "aspect-[8.5/13]" : "aspect-[1/1.414]"
                                } ${previewLoading ? "opacity-70" : ""} transition-opacity`}
                            >
                                <iframe
                                    title={`${schema?.label || "Permit"} preview`}
                                    src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`}
                                    className="absolute inset-0 w-full h-full border-0 rounded-sm"
                                />
                            </div>
                        ) : previewError ? (
                            <div role="alert" className="mt-16 max-w-sm text-center text-[12.5px] text-red-600 font-medium">{previewError}</div>
                        ) : (
                            <div className="mt-16 flex flex-col items-center gap-3 text-[12px] text-slate-500">
                                <div className={`w-40 ${type === "dp" ? "aspect-[8.5/13]" : "aspect-[1/1.414]"} rounded-sm bg-white shadow-sm animate-pulse`} aria-hidden="true" />
                                Building preview…
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
        )}

        {success && (
            <div
                className="fixed inset-0 z-[1000] bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4 animate-fade-in duration-150"
                onMouseDown={(e) => e.target === e.currentTarget && closeSuccess()}
                onKeyDown={(e) => e.key === "Escape" && closeSuccess()}
            >
                <div
                    role="alertdialog"
                    aria-modal="true"
                    aria-labelledby="permit-success-title"
                    aria-describedby="permit-success-desc"
                    className="w-full max-w-[400px] rounded-xl bg-white shadow-2xl ring-1 ring-slate-200 px-6 pt-6 pb-5 text-center animate-in fade-in zoom-in-95 duration-200"
                >
                    <span className="mx-auto w-12 h-12 rounded-full bg-emerald-50 ring-8 ring-emerald-50/60 text-emerald-600 flex items-center justify-center" aria-hidden="true">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                    </span>
                    <h3 id="permit-success-title" className="mt-4 text-[16px] font-semibold tracking-tight text-slate-900">
                        {success.label} {success.regenerated ? "regenerated" : "generated"}
                    </h3>
                    <p id="permit-success-desc" className="mt-1 text-[12.5px] text-slate-500">A copy was saved to this application.</p>

                    <dl className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 divide-y divide-slate-200 text-left">
                        {[
                            ["Permit", success.label],
                            ["Application No.", app.reference_number || `APP-${app.id}`, true],
                            ["Saved", success.at.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })],
                        ].map(([k, v, mono]) => (
                            <div key={k} className="flex items-center justify-between gap-4 px-3.5 py-2">
                                <dt className="text-[12px] text-slate-500">{k}</dt>
                                <dd className={`text-[12.5px] font-medium text-slate-900 text-right ${mono ? "font-mono text-[12px]" : ""}`}>{v}</dd>
                            </div>
                        ))}
                    </dl>

                    <div className="mt-5 grid grid-cols-2 gap-2.5">
                        <button
                            type="button"
                            onClick={() => closeSuccess()}
                            className="h-9 rounded-md border border-slate-300 bg-white text-[12.5px] font-medium text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-blue-600"
                        >
                            Done
                        </button>
                        <a
                            href={success.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            autoFocus
                            className="h-9 inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[12.5px] font-semibold shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Open PDF
                        </a>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}

const withCurrent = (options = [], current) => (current && !options.includes(current) ? [current, ...options] : options);

// Fields generation can't do without (the decision numbers and the administrator).
// Same rule as REQUIRED_PATTERN in app/Services/PermitExcelService.php, which enforces it.
const isRequired = (f) => f.type !== "check" && /_DN$|^ADMIN$/.test(f.key);

const inputCls = "w-full h-8 rounded-md border border-slate-300 bg-white px-2.5 py-1 leading-5 text-[12.5px] text-slate-900 transition hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 focus:outline-none";
// Required fields that start empty (decision numbers); defaulted ones like the Zoning Administrator don't
const needsInput = (f) => isRequired(f) && !String(f.default ?? "").trim();

// Collapsible form section: a one-line row with a summary until opened
function Section({ title, summary, warn = false, open = false, children }) {
    return (
        <details className="group" open={open || undefined}>
            <summary className="flex items-center gap-3 px-5 h-10 cursor-pointer list-none select-none hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                <span className="flex-1 text-[12.5px] text-slate-700">{title}</span>
                {summary && <span className={`text-[11.5px] ${warn ? "text-amber-700 font-medium" : "text-slate-400"}`}>{summary}</span>}
                <svg className="w-4 h-4 text-slate-400 transition-transform duration-200 ease-out group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </summary>
            <div className="px-5 pt-1 pb-4 animate-in fade-in slide-in-from-top-1 duration-150">{children}</div>
        </details>
    );
}

// Selects reserve room for the dropdown arrow so long options never run under it
const selectCls = `${inputCls} pr-8 truncate`;
const inputClsReadOnly = "w-full h-8 py-1 leading-5 rounded-md border border-slate-200 bg-slate-100 text-slate-500 px-2.5 text-[12.5px] cursor-not-allowed select-none focus:outline-none";

function Field({ field, value, onChange, required = false, tag = true }) {
    const isReadOnly = !!field.readonly;
    const currentCls = isReadOnly ? inputClsReadOnly : inputCls;

    if (field.type === "check") {
        return (
            <label className={`flex items-center gap-2 text-[12.5px] text-slate-700 h-8 ${isReadOnly ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                <input type="checkbox" disabled={isReadOnly} checked={value === true || value === "true" || value === "1"} onChange={(e) => onChange(e.target.checked)} className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-600/30" />
                {field.label}
            </label>
        );
    }

    return (
        <label className={`block ${field.type === "allowed_use" ? "sm:col-span-2" : ""}`}>
            <span className="mb-1 flex items-center justify-between gap-2 text-[11.5px] text-slate-600">
                {field.label}
                {required && tag && !String(value ?? "").trim() && <span className="text-[10.5px] font-medium text-amber-700">Required</span>}
            </span>
            {field.type === "select" ? (
                <select disabled={isReadOnly} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={isReadOnly ? `${inputClsReadOnly} pr-8` : selectCls}>
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
                <input readOnly={isReadOnly} disabled={isReadOnly} required={required} aria-required={required || undefined} type={field.type === "date" ? "date" : "text"} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={currentCls} />
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
            <select disabled={disabled} value={section} onChange={(e) => setSection(e.target.value)} className={disabled ? `${inputClsReadOnly} pr-8` : selectCls}>
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
