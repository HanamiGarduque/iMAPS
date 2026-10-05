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
export function PermitExportPanel({ app, savedPermits: propSavedPermits, onSavedPermitsChange }) {
    const isReleased = app?.status === "Released";
    const [open, setOpen] = useState(null);
    const [localSavedPermits, setLocalSavedPermits] = useState(
        propSavedPermits || app?.generated_permits || app?.generatedPermits || []
    );
    const savedPermits = propSavedPermits !== undefined ? propSavedPermits : localSavedPermits;
    const defaultPermit = defaultPermitFor(app);
    const recommendedTypes = getRecommendedPermitTypes(app);
    const missingPermits = getMissingRecommendedPermits(app, savedPermits);
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
        <div className="space-y-4 pb-4">
            <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200">
                <h3 className="text-xs font-semibold text-slate-900">
                    {isReleased ? "Permits & Issued Documents" : "Permits & Documents"}
                </h3>
                <p className="text-[11.5px] text-slate-500 mt-0.5">
                    {isReleased
                        ? "Official clearance certificates and evaluation documents issued for this application."
                        : "Generate official clearance certificates and evaluation worksheets for this application."}
                </p>
            </div>

            {/* Status notification when application is in For Release stage */}
            {!isReleased && app?.status === "For Release" && (
                <div
                    className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                        missingPermits.length > 0
                            ? "bg-amber-50/70 border-amber-200 text-amber-900"
                            : "bg-emerald-50/70 border-emerald-200 text-emerald-900"
                    }`}
                >
                    <div className="shrink-0 mt-0.5">
                        {missingPermits.length > 0 ? (
                            <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                            </svg>
                        ) : (
                            <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        )}
                    </div>
                    <div className="min-w-0 flex-1 text-xs">
                        <p className="font-semibold">
                            {missingPermits.length > 0
                                ? "Permit generation required before release"
                                : "All required permits generated"}
                        </p>
                        <p className="text-[11.5px] mt-0.5 opacity-85">
                            {missingPermits.length > 0
                                ? `Required before release: ${missingPermits.map((p) => p.label).join(", ")}.`
                                : "All recommended documents have been generated and archived."}
                        </p>
                    </div>
                </div>
            )}

            {/* Document generation options - only visible before release */}
            {!isReleased && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {getAvailablePermitsForApp(app).map((p) => {
                        const isDefault = p.type === defaultPermit;
                        const isRecommended = recommendedTypes.includes(p.type);
                        const isGenerated = savedTypes.has(p.type);

                        return (
                            <button
                                key={p.type}
                                type="button"
                                onClick={() => setOpen(p.type)}
                                className={`group text-left p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                    isGenerated
                                        ? "border-emerald-200 bg-emerald-50/20 hover:bg-emerald-50/40 hover:border-emerald-300"
                                        : isRecommended
                                        ? "border-blue-200 bg-blue-50/30 hover:bg-blue-50/60 hover:border-blue-300"
                                        : "border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300"
                                }`}
                            >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                                        isGenerated
                                            ? "bg-emerald-100 text-emerald-700"
                                            : isRecommended
                                            ? "bg-blue-100 text-blue-800"
                                            : "bg-slate-100 text-slate-600"
                                    }`}>
                                        <PermitIcon type={p.type} className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <p className="text-[13px] font-semibold text-slate-900 group-hover:text-blue-950 transition-colors">
                                                {p.label}
                                            </p>
                                            {isGenerated && (
                                                <span className="text-[10px] font-semibold bg-emerald-100/80 text-emerald-800 px-2 py-0.5 rounded-md flex items-center gap-1">
                                                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                    </svg>
                                                    Generated
                                                </span>
                                            )}
                                            {!isGenerated && isRecommended && (
                                                <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md">
                                                    Required
                                                </span>
                                            )}
                                            {isDefault && !isRecommended && !isGenerated && (
                                                <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                                                    Worksheet
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            PDF · {p.paper}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-slate-400 group-hover:text-slate-600 shrink-0">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                    </svg>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Saved Permits & Issued Documents List */}
            <div className={isReleased ? "space-y-3" : "mt-5 border-t border-slate-200 pt-4"}>
                <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold text-slate-900 flex items-center gap-2">
                        <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                        </svg>
                        {isReleased ? "Issued Documents" : "Stored Documents"}
                        <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-full">
                            {savedPermits.length}
                        </span>
                    </h4>
                    <button
                        type="button"
                        onClick={fetchSavedPermits}
                        className="text-xs text-slate-600 hover:text-blue-700 font-medium flex items-center gap-1 cursor-pointer transition-colors"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                        Refresh
                    </button>
                </div>

                {savedPermits.length === 0 ? (
                    <div className="py-8 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center text-center">
                        <svg className="w-8 h-8 text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                        <p className="text-xs font-semibold text-slate-600">No stored documents found</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                            {isReleased
                                ? "No permit documents were recorded for this released application."
                                : "Generated permits will appear here automatically."}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {savedPermits.map((item) => (
                            <div key={item.id} className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-3 shadow-2xs">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#0b2a5b] flex items-center justify-center shrink-0">
                                        <PermitIcon type={item.permit_type} className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-semibold text-slate-900 truncate">{item.permit_name}</span>
                                            <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded uppercase ${item.file_format === 'pdf' ? 'bg-rose-50 text-rose-700 border border-rose-200/70' : 'bg-emerald-50 text-emerald-700 border border-emerald-200/70'}`}>
                                                {item.file_format}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-slate-500 mt-0.5">
                                            {new Date(item.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                            {item.formatted_file_size && ` · ${item.formatted_file_size}`}
                                            {item.generated_by?.name && ` · by ${item.generated_by.name}`}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <a
                                        href={`/applications/${app.id}/saved-permits/${item.id}/download`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-slate-700 hover:text-slate-900 text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
                                    >
                                        <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.25V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                        </svg>
                                        {item.file_format === 'pdf' ? 'View PDF' : 'Download'}
                                    </a>
                                    {!isReleased && (
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteSavedPermit(item)}
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors"
                                            title="Delete stored permit"
                                            aria-label="Delete stored permit"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

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
            setModalSavedPermits((prev) => [...prev, { permit_type: type }]);
            onPermitGenerated?.(type);
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
                        const isGen = (modalSavedPermits || []).some(
                            (s) => (typeof s === "object" ? s?.permit_type : s) === p.type
                        );

                        return (
                            <button
                                key={p.type}
                                type="button"
                                disabled={!!busy}
                                onClick={() => setType(p.type)}
                                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-2 shrink-0 cursor-pointer transition-colors ${
                                    isActive
                                        ? "bg-[#0b2a5b] border-[#0b2a5b] text-white"
                                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                                }`}
                            >
                                <PermitIcon type={p.type} className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-slate-500"}`} />
                                {p.label}
                                {isGen && (
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isActive ? "bg-emerald-500 text-white" : "bg-emerald-100 text-emerald-800"}`}>
                                        Saved
                                    </span>
                                )}
                                {isDefault && !isGen && (
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isActive ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-700"}`}>
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
                <div className="px-5 py-3 border-t border-slate-100 bg-white flex items-center justify-between gap-3 shrink-0">
                    <div className="text-[11.5px] min-w-0 flex-1 pr-2">
                        {error ? (
                            <span className="text-rose-600 font-semibold block truncate">{error}</span>
                        ) : missing.length > 0 ? (
                            <span className="text-amber-600 block line-clamp-2 leading-tight" title={missing.map((f) => f.label).join(", ")}>
                                Still blank: {missing.map((f) => f.label).join(", ")}
                            </span>
                        ) : isAlreadyGenerated ? (
                            <span className="text-emerald-700 font-medium flex items-center gap-1.5 truncate">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                                A stored copy exists. Re-generating will produce an updated copy.
                            </span>
                        ) : null}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            disabled={loading || !!busy || !schema}
                            onClick={() => generate("pdf")}
                            className={`px-5 py-2 rounded-lg text-white text-xs font-bold disabled:bg-slate-300 cursor-pointer shadow-xs transition-colors flex items-center gap-1.5 shrink-0 ${
                                isAlreadyGenerated
                                    ? "bg-[#0b2a5b] hover:bg-[#0e3574]"
                                    : "bg-emerald-600 hover:bg-emerald-700"
                            }`}
                        >
                            {busy === "pdf" ? (
                                <span>{isAlreadyGenerated ? "Re-generating PDF…" : "Generating PDF…"}</span>
                            ) : (
                                <>
                                    {isAlreadyGenerated && (
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                        </svg>
                                    )}
                                    <span>
                                        {isAlreadyGenerated
                                            ? `Re-generate ${schema?.label || "permit"} PDF`
                                            : `Generate ${schema?.label || "permit"} PDF`}
                                    </span>
                                </>
                            )}
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
