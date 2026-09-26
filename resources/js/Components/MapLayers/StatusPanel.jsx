import React, { useState, useEffect, useMemo, useRef } from 'react';
import { router } from '@inertiajs/react';
import { getZoneInfo } from '@/utils/clupZones';

// ── Single Source of Truth for Status Color/Style (pins, popups, chips, legend) ──
// Previously this lived three times (Maps.jsx pins, this file's chips, MapLegend's
// swatches) with mismatched hex values — e.g. "Received" was emerald on the pin
// but sky-blue on the chip. Everything now reads from here.
export const STATUS_MARKER_CONFIG = {
    "Received": {
        shortLabel: "Received",
        label: "Received",
        color: "#10b981", // Emerald Green
        border: "#059669",
        badgeBg: "#ecfdf5",
        badgeText: "#065f46",
        iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`
    },
    "Technical Review": {
        shortLabel: "Review",
        label: "Technical Review",
        color: "#f59e0b", // Amber Gold
        border: "#d97706",
        badgeBg: "#fffbeb",
        badgeText: "#92400e",
        iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
    },
    "Under Sangguniang Bayan": {
        shortLabel: "SB Hearing",
        label: "Under SB Hearing",
        color: "#8b5cf6", // Purple
        border: "#7c3aed",
        badgeBg: "#f5f3ff",
        badgeText: "#5b21b6",
        iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="21" x2="21" y2="21"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="5 6 12 3 19 6"/><line x1="4" y1="10" x2="4" y2="21"/><line x1="20" y1="10" x2="20" y2="21"/><line x1="8" y1="14" x2="8" y2="17"/><line x1="12" y1="14" x2="12" y2="17"/><line x1="16" y1="14" x2="16" y2="17"/></svg>`
    },
    "For Release": {
        shortLabel: "For Release",
        label: "For Release",
        color: "#0ea5e9", // Sky Blue
        border: "#0284c7",
        badgeBg: "#f0f9ff",
        badgeText: "#075985",
        iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
    },
    "Released": {
        shortLabel: "Released",
        label: "Released",
        color: "#4f46e5", // Royal Indigo
        border: "#4338ca",
        badgeBg: "#eef2ff",
        badgeText: "#3730a3",
        iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
    },
    "Denied": {
        shortLabel: "Denied",
        label: "Denied",
        color: "#f43f5e", // Rose Red
        border: "#e11d48",
        badgeBg: "#fff1f2",
        badgeText: "#9f1239",
        iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
    },
};

export const getStatusMarkerConfig = (status) => {
    if (!status) return STATUS_MARKER_CONFIG["Received"];
    const s = String(status).trim();
    if (STATUS_MARKER_CONFIG[s]) return STATUS_MARKER_CONFIG[s];
    if (s.toLowerCase().includes("review")) return STATUS_MARKER_CONFIG["Technical Review"];
    if (s.toLowerCase().includes("sangguniang") || s.toLowerCase().includes("bayan")) return STATUS_MARKER_CONFIG["Under Sangguniang Bayan"];
    if (s.toLowerCase().includes("for release")) return STATUS_MARKER_CONFIG["For Release"];
    if (s.toLowerCase().includes("release") || s.toLowerCase().includes("approved")) return STATUS_MARKER_CONFIG["Released"];
    if (s.toLowerCase().includes("denied") || s.toLowerCase().includes("reject")) return STATUS_MARKER_CONFIG["Denied"];
    return STATUS_MARKER_CONFIG["Received"];
};

// Kept as aliases so nothing importing the old names breaks.
export const STATUS_CONFIG = STATUS_MARKER_CONFIG;
export const getStatusConfig = getStatusMarkerConfig;

// The zoning types an applicant can request — shared with the Verify Parcel
// check here and Step 1 of the application form (Applications/Create.jsx).
export const LAND_USE_CLASSES = ["Residential", "Commercial", "Industrial", "Agri-Industrial", "Institutional", "Recreational"];

// ── Subtle SLA / Citizen's Charter Ageing Calculator ──
export const getSLAInfo = (createdAt, status) => {
    const s = String(status || "").toLowerCase();
    const isCompleted = s.includes("released") || s.includes("approved") || s.includes("denied");
    
    if (isCompleted) {
        return {
            days: 0,
            status: "completed",
            label: s.includes("denied") ? "Denied" : "Released",
            color: "text-slate-400 font-medium",
            isOverdue: false,
        };
    }

    if (!createdAt) {
        return {
            days: 2,
            status: "normal",
            label: "⏱️ 2d in process",
            color: "text-slate-500",
            isOverdue: false,
        };
    }

    const created = new Date(createdAt);
    const now = new Date();
    const diffTime = Math.abs(now - created);
    const days = Math.max(1, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

    if (days <= 5) {
        return {
            days,
            status: "normal",
            label: `⏱️ ${days}d in process`,
            color: "text-slate-500",
            isOverdue: false,
        };
    } else if (days <= 14) {
        return {
            days,
            status: "warning",
            label: `⏱️ ${days}d pending`,
            color: "text-amber-700 font-medium",
            isOverdue: true,
        };
    } else {
        return {
            days,
            status: "overdue",
            label: `⚠️ ${days}d · Exceeds SLA`,
            color: "text-rose-600 font-semibold",
            isOverdue: true,
        };
    }
};

// ── CLUP Zoning Conformity & Compliance Analyzer ──
// Resolves BOTH the requested use and the parcel/barangay's zone value — which
// may arrive as a plain word ("Residential") or an official CLUP zone code
// ("PDA-SZ", "C1-Z", "AgIndZ") — down to the same category set from
// utils/clupZones.js, then compares categories directly. This replaces an
// earlier version that only special-cased "heavy use" keywords and matched
// zones by checking whether the zone string literally contained the word
// "residential" or "agricultural" — a raw CLUP code like "PDA-SZ" (which IS
// the Agricultural zone) never contains that word, so it silently fell
// through to "Conforming Use" for almost every zone-coded barangay.
const ZONE_WORD_TO_CATEGORY = {
    residential: "residential",
    commercial: "commercial",
    industrial: "industrial",
    "agro-industrial": "agroIndustrial",
    "agri-industrial": "agroIndustrial",
    agroindustrial: "agroIndustrial",
    agriindustrial: "agroIndustrial",
    agricultural: "agricultural",
    institutional: "institutional",
    recreational: "parks",
    parks: "parks",
    forest: "forest",
    tourism: "tourism",
    water: "water",
    utilities: "utilities",
};

const resolveZoneCategory = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return null;

    const wordCategory = ZONE_WORD_TO_CATEGORY[raw.toLowerCase()];
    if (wordCategory) {
        return { category: wordCategory, label: raw, code: null };
    }

    const info = getZoneInfo(raw);
    if (info.category && info.code) {
        return { category: info.category, label: info.categoryLabel, code: info.code };
    }
    return null;
};

export const getZoningConformity = (requestedUse, zoneValue) => {
    const requested = resolveZoneCategory(requestedUse) || {
        category: null,
        label: requestedUse || "General Use",
        code: null,
    };
    const zone = resolveZoneCategory(zoneValue);

    if (!zone) {
        return {
            status: "undetermined",
            isConforming: false,
            badgeClass: "text-slate-700 bg-slate-100 border-slate-300/80",
            dotClass: "bg-slate-400",
            title: "Zone Undetermined",
            label: "❔ Manual Review",
            desc: `No verified CLUP classification on record${zoneValue ? ` for "${zoneValue}"` : ""} — Technical Review must confirm zoning manually.`,
        };
    }

    const zoneDisplay = zone.code ? `${zone.label} (${zone.code})` : zone.label;

    if (requested.category && requested.category === zone.category) {
        return {
            status: "conforming",
            isConforming: true,
            badgeClass: "text-emerald-800 bg-emerald-50 border-emerald-200/80",
            dotClass: "bg-emerald-500",
            title: "Conforming Use",
            label: "✅ Conforming Use",
            desc: `${requested.label} use is permitted under this parcel's ${zoneDisplay} CLUP classification.`,
        };
    }

    if (requested.category === "agroIndustrial" && zone.category === "agricultural") {
        return {
            status: "conversion",
            isConforming: false,
            badgeClass: "text-violet-800 bg-violet-50 border-violet-200/80",
            dotClass: "bg-violet-500",
            title: "Reclassification Required",
            label: "📋 SB Reclassification",
            desc: `Agri-Industrial use within a ${zoneDisplay} zone requires SB reclassification and DAR clearance.`,
        };
    }

    return {
        status: "variance",
        isConforming: false,
        badgeClass: "text-amber-800 bg-amber-50 border-amber-200/80",
        dotClass: "bg-amber-500",
        title: "Variance Required",
        label: "⚠️ Variance Review",
        desc: `${requested.label} use does not conform to this parcel's ${zoneDisplay} CLUP classification.`,
    };
};

// ── Natural Language Briefing Generator ──
export const getAssessmentNarrative = ({
    isBgy,
    bgyName,
    bgyLandUse,
    totalCount,
    activeBarangaysCount,
    reviewCount,
    receivedCount,
    releasedCount,
}) => {
    if (isBgy) {
        if (totalCount === 0) {
            return `${bgyName} currently has no active applications on record. The primary land use zone is ${bgyLandUse || "Residential"}.`;
        }

        const parts = [];
        if (reviewCount > 0) parts.push(`${reviewCount} in Technical Review`);
        if (receivedCount > 0) parts.push(`${receivedCount} Received`);
        if (releasedCount > 0) parts.push(`${releasedCount} Released`);

        let breakdown = "";
        if (parts.length === 0) {
            breakdown = "in regular processing";
        } else if (parts.length === 1) {
            breakdown = parts[0];
        } else if (parts.length === 2) {
            breakdown = `${parts[0]} and ${parts[1]}`;
        } else {
            breakdown = `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
        }

        const appWord = totalCount === 1 ? "application" : "applications";
        return `${bgyName} has ${totalCount} ${appWord} on record: ${breakdown}. The primary land use zone is ${bgyLandUse || "Residential"}.`;
    }

    // Municipal overview
    const parts = [];
    if (reviewCount > 0) parts.push(`${reviewCount} in Technical Review`);
    if (receivedCount > 0) parts.push(`${receivedCount} newly Received`);
    if (releasedCount > 0) parts.push(`${releasedCount} Released`);

    let breakdown = "";
    if (parts.length === 0) {
        breakdown = "no active applications";
    } else if (parts.length === 1) {
        breakdown = parts[0];
    } else if (parts.length === 2) {
        breakdown = `${parts[0]} and ${parts[1]}`;
    } else {
        breakdown = `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
    }

    const bgyWord = activeBarangaysCount === 1 ? "barangay" : "barangays";
    return `Rosario has ${totalCount} total applications across ${activeBarangaysCount} ${bgyWord}, with ${breakdown}.`;
};

export default function StatusPanel({
    total = 0,
    thisMonth = 0,
    review = 0,
    released = 0,
    recent = [],
    selectedBgy = null,
    onClearBgy,
    onSelectBgy,
    bgyStats = {},
    statusMap = {},
    statusFilter = "All",
    onStatusFilterChange,
    onLocateApp,
    onVerifyResult,
}) {
    const isBgy = Boolean(selectedBgy && selectedBgy.name);
    const bgyName = selectedBgy?.name || "";

    // ── Verify Parcel: TCT / Tax Dec lookup + CLUP zoning conformance check ──
    const [verifyCode, setVerifyCode] = useState("");
    const [verifyZoning, setVerifyZoning] = useState(LAND_USE_CLASSES[0]);
    const [isVerifying, setIsVerifying] = useState(false);
    const [verifyResult, setVerifyResult] = useState(null);
    const [verifyError, setVerifyError] = useState("");

    const handleVerify = async (e) => {
        e.preventDefault();
        const code = verifyCode.trim();
        if (!code || isVerifying) return;

        setIsVerifying(true);
        setVerifyError("");
        setVerifyResult(null);

        try {
            const res = await fetch(`/api/parcels/verify?code=${encodeURIComponent(code)}`, {
                headers: { Accept: "application/json" },
            });
            const payload = await res.json();

            if (!res.ok || !payload.found) {
                setVerifyError(payload.message || `No parcel found for "${code}".`);
                return;
            }

            const { parcel, application } = payload;
            // The spatially-verified zone (point-in-polygon against the official
            // CLUP plan, resolved server-side) is the ground truth when present;
            // the parcel's own recorded land_use_class is a fallback for parcels
            // without coordinates on file.
            const zoneValue = parcel.clup_zone_code || parcel.land_use_class;
            const conformity = getZoningConformity(verifyZoning, zoneValue);
            const result = { parcel, application, conformity, zoningType: verifyZoning, zoneValue };
            setVerifyResult(result);
            if (onVerifyResult) onVerifyResult(result);
        } catch (err) {
            setVerifyError("Verification failed. Please try again.");
        } finally {
            setIsVerifying(false);
        }
    };

    const handleLocateVerified = () => {
        if (!verifyResult || !onLocateApp) return;
        const { parcel, application } = verifyResult;
        onLocateApp({
            id: application?.id ?? `parcel-${parcel.id}`,
            barangay: parcel.barangay,
            parcels: [{ latitude: parcel.latitude, longitude: parcel.longitude }],
        });
    };

    const handleProceedToApplication = () => {
        if (!verifyResult) return;
        const { parcel, conformity, zoningType } = verifyResult;
        try {
            sessionStorage.setItem(
                "imaps_verified_parcel_prefill",
                JSON.stringify({
                    target_land_use_class: zoningType,
                    tct_number: parcel.tct_number || "",
                    tax_dec_number: parcel.tax_dec_number || "",
                    barangay: parcel.barangay || "",
                    owner_name: parcel.owner_name || "",
                    location_address: parcel.location_address || "",
                    lot_area_sqm: parcel.lot_area_sqm || "",
                    property_index_number: parcel.property_index_number || "",
                    requiresVariance: !conformity.isConforming,
                })
            );
        } catch (e) {}
        router.visit("/applications/encode");
    };

    // Filter applications by selected barangay if applicable
    const baseList = useMemo(() => {
        const list = Array.isArray(recent) ? recent : [];
        if (isBgy && bgyName) {
            return list.filter((r) => (r.barangay || "").trim().toLowerCase() === bgyName.trim().toLowerCase());
        }
        return list;
    }, [recent, isBgy, bgyName]);

    // Active barangays tally
    const activeBarangayList = useMemo(() => {
        const counts = {};
        (Array.isArray(recent) ? recent : []).forEach((app) => {
            const b = (app.barangay || "Poblacion").trim();
            counts[b] = (counts[b] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
    }, [recent]);

    // Key metrics breakdown
    const { reviewCount, receivedCount, releasedCount, overdueCount } = useMemo(() => {
        let rev = 0;
        let rec = 0;
        let rel = 0;
        let ovd = 0;

        baseList.forEach((app) => {
            const s = (app?.status || "").toLowerCase();
            if (s.includes("review")) rev++;
            else if (s.includes("release") || s.includes("approved")) rel++;
            else rec++;

            const sla = getSLAInfo(app?.created_at, app?.status);
            if (sla.days > 7 && sla.status !== "completed") {
                ovd++;
            }
        });

        return { reviewCount: rev, receivedCount: rec, releasedCount: rel, overdueCount: ovd };
    }, [baseList]);

    // Determine primary land use for selected barangay
    const bgyLandUse = useMemo(() => {
        if (!isBgy) return "";
        return selectedBgy?.data?.Primary_Zone || selectedBgy?.data?.landUse || selectedBgy?.data?.primaryZone || "Residential";
    }, [isBgy, selectedBgy]);

    // The target narrative assessment to type out
    const targetNarrative = useMemo(() => {
        return getAssessmentNarrative({
            isBgy,
            bgyName,
            bgyLandUse,
            totalCount: baseList.length,
            activeBarangaysCount: activeBarangayList.length,
            reviewCount,
            receivedCount,
            releasedCount,
        });
    }, [isBgy, bgyName, bgyLandUse, baseList.length, activeBarangayList.length, reviewCount, receivedCount, releasedCount]);

    // ── Live Reading / Typewriter Effect ──
    const [displayedText, setDisplayedText] = useState("");
    const [isTyping, setIsTyping] = useState(true);
    const typingTimerRef = useRef(null);

    const startTyping = (textToType) => {
        if (typingTimerRef.current) clearInterval(typingTimerRef.current);
        setDisplayedText("");
        setIsTyping(true);

        if (!textToType) {
            setIsTyping(false);
            return;
        }

        let idx = 0;
        typingTimerRef.current = setInterval(() => {
            if (idx < textToType.length) {
                setDisplayedText(textToType.slice(0, idx + 1));
                idx++;
            } else {
                setIsTyping(false);
                clearInterval(typingTimerRef.current);
            }
        }, 18); // ~18ms per char for lively stream
    };

    useEffect(() => {
        startTyping(targetNarrative);
        return () => {
            if (typingTimerRef.current) clearInterval(typingTimerRef.current);
        };
    }, [targetNarrative]);

    const handleSkipTyping = () => {
        if (typingTimerRef.current) clearInterval(typingTimerRef.current);
        setDisplayedText(targetNarrative);
        setIsTyping(false);
    };

    const handleReplayTyping = (e) => {
        e.stopPropagation();
        startTyping(targetNarrative);
    };

    // Regex highlight matcher for key terms in the narrative
    const highlightedNarrative = useMemo(() => {
        if (!displayedText) return null;

        const terms = [
            "\\b\\d+\\b",
            "Technical Review",
            "Received",
            "Released",
            "Commercial",
            "Residential",
            "Agro-industrial",
            "Agricultural",
            "Rosario"
        ];
        if (bgyName) {
            terms.push(bgyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        }

        const regex = new RegExp(`(${terms.join("|")})`, "g");
        const parts = displayedText.split(regex);

        return parts.map((part, i) => {
            if (!part) return null;
            if (part === "Technical Review") {
                return <strong key={i} className="text-amber-700 font-bold">{part}</strong>;
            }
            if (part === "Received") {
                return <strong key={i} className="text-sky-700 font-bold">{part}</strong>;
            }
            if (part === "Released") {
                return <strong key={i} className="text-emerald-700 font-bold">{part}</strong>;
            }
            if (/^\d+$/.test(part) || part === bgyName || part === "Rosario") {
                return <strong key={i} className="text-slate-900 font-black">{part}</strong>;
            }
            if (["Commercial", "Residential", "Agro-industrial", "Agricultural"].includes(part)) {
                return <strong key={i} className="text-indigo-700 font-bold">{part}</strong>;
            }
            return <span key={i}>{part}</span>;
        });
    }, [displayedText, bgyName]);


    return (
        <div className="flex flex-col gap-2 p-3">
            <div className="flex items-center justify-between bg-white px-3 py-2.5 rounded-xl border border-slate-200/90 shadow-2xs">
                {isBgy ? (
                    <>
                        <div className="min-w-0">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">Barangay Scope</span>
                            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5 truncate">
                                <span>{bgyName}</span>
                                <span className="text-[11px] font-normal text-slate-400 font-mono">({baseList.length})</span>
                            </h3>
                        </div>
                        {onClearBgy && (
                            <button
                                type="button"
                                onClick={onClearBgy}
                                className="text-[10.5px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 px-2.5 py-1 rounded-lg transition-colors cursor-pointer border border-slate-200/80 shrink-0"
                                title="Return to Municipal Overview"
                            >
                                ✕ All Barangays
                            </button>
                        )}
                    </>
                ) : (
                    <>
                        <div className="min-w-0">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">Municipality</span>
                            <h3 className="text-xs font-bold text-slate-900 truncate">
                                Rosario Overview <span className="text-[11px] font-normal text-slate-400 font-mono">({baseList.length})</span>
                            </h3>
                        </div>

                        {activeBarangayList.length > 1 && (
                            <div className="relative shrink-0">
                                <select
                                    value=""
                                    onChange={(e) => {
                                        if (e.target.value && onSelectBgy) {
                                            onSelectBgy(e.target.value);
                                        }
                                    }}
                                    className="text-[10.5px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 transition-all cursor-pointer outline-hidden"
                                    title="Jump to active barangay"
                                >
                                    <option value="" disabled>Jump to Barangay ▾</option>
                                    {activeBarangayList.map((b) => (
                                        <option key={b.name} value={b.name}>
                                            {b.name} ({b.count})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* 2. KPI Tile Row — Total / This Month / In Review / Released */}
            <div className="grid grid-cols-4 gap-1.5">
                {[
                    { label: "Total", value: total, accent: "text-slate-900" },
                    { label: "This Month", value: thisMonth, accent: "text-blue-700" },
                    { label: "In Review", value: review, accent: "text-amber-700" },
                    { label: "Released", value: released, accent: "text-emerald-700" },
                ].map((kpi) => (
                    <div
                        key={kpi.label}
                        className="bg-white rounded-lg border border-slate-200/90 shadow-2xs px-1.5 py-2 flex flex-col items-center text-center"
                    >
                        <span className={`text-sm font-black font-mono leading-none ${kpi.accent}`}>{kpi.value}</span>
                        <span className="text-[8.5px] font-semibold uppercase tracking-wider text-slate-400 mt-1 leading-none">
                            {kpi.label}
                        </span>
                    </div>
                ))}
            </div>

            {/* 3. Verify Parcel — TCT/Tax Dec lookup + CLUP zoning conformance gate */}
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-600">Verify Parcel</span>
                </div>

                <form onSubmit={handleVerify} className="space-y-1.5">
                    <input
                        type="text"
                        value={verifyCode}
                        onChange={(e) => setVerifyCode(e.target.value)}
                        placeholder="TCT or Tax Dec. Number"
                        disabled={isVerifying}
                        className="w-full bg-slate-50 border border-slate-200/80 rounded-lg px-2.5 py-1.5 text-[11px] font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all disabled:opacity-60"
                    />
                    <div className="flex items-center gap-1.5">
                        <select
                            value={verifyZoning}
                            onChange={(e) => setVerifyZoning(e.target.value)}
                            disabled={isVerifying}
                            className="flex-1 min-w-0 bg-slate-50 border border-slate-200/80 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all disabled:opacity-60 cursor-pointer"
                            title="Zoning type being applied for"
                        >
                            {LAND_USE_CLASSES.map((cls) => (
                                <option key={cls} value={cls}>{cls}</option>
                            ))}
                        </select>
                        <button
                            type="submit"
                            disabled={isVerifying || !verifyCode.trim()}
                            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10.5px] font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                            {isVerifying && (
                                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                </svg>
                            )}
                            <span>{isVerifying ? "Checking…" : "Check & Proceed"}</span>
                        </button>
                    </div>
                </form>

                {verifyError && (
                    <div className="flex items-start gap-1.5 text-[10.5px] text-rose-700 bg-rose-50 border border-rose-200/80 rounded-lg px-2.5 py-1.5">
                        <span>⚠️</span>
                        <span>{verifyError}</span>
                    </div>
                )}

                {verifyResult && (() => {
                    const { parcel, application, conformity } = verifyResult;
                    const statusMeta = application ? getStatusMarkerConfig(application.status) : null;
                    return (
                        <div className={`rounded-lg border p-2.5 space-y-2 ${conformity.badgeClass}`}>
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[10.5px] font-black flex items-center gap-1.5">
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${conformity.dotClass}`} />
                                    <span>{conformity.title}</span>
                                </span>
                                <span className="text-[9px] font-mono font-bold opacity-85 uppercase tracking-wider">
                                    {conformity.isConforming ? "Approved" : "Action Req."}
                                </span>
                            </div>
                            <p className="text-[10.5px] leading-snug opacity-90">{conformity.desc}</p>

                            <div className="pt-1.5 border-t border-current/10 grid grid-cols-2 gap-1.5 text-[10.5px]">
                                <div>
                                    <span className="block text-[8.5px] font-bold uppercase opacity-60">Barangay</span>
                                    <span className="font-bold truncate block">{parcel.barangay || "—"}</span>
                                </div>
                                <div>
                                    <span className="block text-[8.5px] font-bold uppercase opacity-60">Lot Area</span>
                                    <span className="font-semibold truncate block">{parcel.lot_area_sqm ? `${parcel.lot_area_sqm} sqm` : "—"}</span>
                                </div>
                            </div>

                            {statusMeta && (
                                <div className="pt-1.5 border-t border-current/10 flex items-center justify-between text-[10px]">
                                    <span
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold"
                                        style={{ backgroundColor: statusMeta.badgeBg, color: statusMeta.badgeText }}
                                    >
                                        ● {statusMeta.label}
                                    </span>
                                    <a
                                        href={`/applications/${application.id}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="font-mono opacity-70 hover:opacity-100 hover:underline"
                                    >
                                        {application.reference_number} ↗
                                    </a>
                                </div>
                            )}

                            <div className="pt-1.5 border-t border-current/10 flex items-center gap-1.5">
                                {conformity.isConforming ? (
                                    <button
                                        type="button"
                                        onClick={handleProceedToApplication}
                                        className="flex-1 py-1.5 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[10.5px] font-bold transition-all cursor-pointer"
                                    >
                                        Proceed to Application →
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleProceedToApplication}
                                        className="flex-1 py-1.5 px-2 rounded-lg bg-white/70 hover:bg-white text-current border border-current/30 text-[10px] font-semibold transition-all cursor-pointer"
                                    >
                                        Start Anyway (Requires Variance Review)
                                    </button>
                                )}
                                {onLocateApp && (
                                    <button
                                        type="button"
                                        onClick={handleLocateVerified}
                                        title="Locate on map"
                                        className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-white/70 hover:bg-white border border-current/30 transition-all cursor-pointer"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.3">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })()}
            </div>

            {/* 4. Live Spatial Assessment Briefing (Animated Typewriter Effect) */}
            <div 
                onClick={handleSkipTyping}
                className="group relative overflow-hidden bg-white rounded-xl p-3.5 border border-slate-200/90 shadow-2xs transition-all hover:border-slate-300 cursor-pointer"
                title={isTyping ? "Click to finish reading" : ""}
            >
                {/* Header with live radar indicator */}
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                            {isTyping ? (
                                <>
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                                </>
                            ) : (
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                            )}
                        </span>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                Live Spatial Assessment
                            </span>
                            {isTyping && (
                                <span className="text-[9px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.2 rounded font-bold animate-pulse">
                                    READING...
                                </span>
                            )}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleReplayTyping}
                        className="text-[10px] text-slate-400 hover:text-slate-700 font-semibold flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded hover:bg-slate-100 cursor-pointer"
                        title="Re-run live reading animation"
                    >
                        <span>↺</span>
                        <span>Re-read</span>
                    </button>
                </div>

                {/* Animated typing text content */}
                <div className="min-h-[50px] flex items-start">
                    <p className="text-[12px] leading-relaxed text-slate-700 font-medium font-sans select-text">
                        {highlightedNarrative}
                        {isTyping && (
                            <span className="inline-block w-1.5 h-3.5 bg-blue-600 ml-1 translate-y-0.5 animate-pulse rounded-xs" />
                        )}
                    </p>
                </div>

                {/* Subtle caption */}
                <div className="mt-2 pt-2 border-t border-slate-100/80 flex items-center justify-between text-[9.5px] text-slate-400">
                    <span>{isBgy ? `GIS telemetry for ${bgyName}` : "Municipal GIS telemetry"}</span>
                    <span>{isTyping ? "Streaming assessment" : "Briefing complete"}</span>
                </div>
            </div>

            {/* 3. Status Metric Chips (Filterable) */}
            <div className="bg-white p-2 rounded-xl border border-slate-200/90 shadow-2xs space-y-1.5">
                <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
                    <button
                        type="button"
                        onClick={() => onStatusFilterChange && onStatusFilterChange("All")}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10.5px] font-semibold transition-all cursor-pointer shrink-0 ${
                            statusFilter === "All"
                                ? "bg-slate-900 text-white shadow-2xs"
                                : "bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200/70"
                        }`}
                    >
                        <span>All</span>
                        <span className={`text-[9.5px] font-mono font-bold px-1.5 py-0.1 rounded ${
                            statusFilter === "All" ? "bg-white/20 text-white" : "bg-white text-slate-600 border border-slate-200/60"
                        }`}>
                            {baseList.length}
                        </span>
                    </button>

                    {reviewCount > 0 && (
                        <button
                            type="button"
                            onClick={() => onStatusFilterChange && onStatusFilterChange(statusFilter === "Technical Review" ? "All" : "Technical Review")}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10.5px] font-semibold transition-all cursor-pointer shrink-0 ${
                                statusFilter === "Technical Review"
                                    ? "bg-slate-900 text-white shadow-2xs"
                                    : "bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200/70"
                            }`}
                        >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                            <span>In Review</span>
                            <span className={`text-[9.5px] font-mono font-bold px-1.5 py-0.1 rounded ${
                                statusFilter === "Technical Review" ? "bg-white/20 text-white" : "bg-white text-slate-600 border border-slate-200/60"
                            }`}>
                                {reviewCount}
                            </span>
                        </button>
                    )}

                    {receivedCount > 0 && (
                        <button
                            type="button"
                            onClick={() => onStatusFilterChange && onStatusFilterChange(statusFilter === "Received" ? "All" : "Received")}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10.5px] font-semibold transition-all cursor-pointer shrink-0 ${
                                statusFilter === "Received"
                                    ? "bg-slate-900 text-white shadow-2xs"
                                    : "bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200/70"
                            }`}
                        >
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_MARKER_CONFIG["Received"].color }} />
                            <span>Received</span>
                            <span className={`text-[9.5px] font-mono font-bold px-1.5 py-0.1 rounded ${
                                statusFilter === "Received" ? "bg-white/20 text-white" : "bg-white text-slate-600 border border-slate-200/60"
                            }`}>
                                {receivedCount}
                            </span>
                        </button>
                    )}

                    {releasedCount > 0 && (
                        <button
                            type="button"
                            onClick={() => onStatusFilterChange && onStatusFilterChange(statusFilter === "Released" ? "All" : "Released")}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10.5px] font-semibold transition-all cursor-pointer shrink-0 ${
                                statusFilter === "Released"
                                    ? "bg-slate-900 text-white shadow-2xs"
                                    : "bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200/70"
                            }`}
                        >
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_MARKER_CONFIG["Released"].color }} />
                            <span>Released</span>
                            <span className={`text-[9.5px] font-mono font-bold px-1.5 py-0.1 rounded ${
                                statusFilter === "Released" ? "bg-white/20 text-white" : "bg-white text-slate-600 border border-slate-200/60"
                            }`}>
                                {releasedCount}
                            </span>
                        </button>
                    )}

                    {overdueCount > 0 && (
                        <button
                            type="button"
                            onClick={() => onStatusFilterChange && onStatusFilterChange(statusFilter === "Overdue" ? "All" : "Overdue")}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10.5px] font-semibold transition-all cursor-pointer ml-auto shrink-0 ${
                                statusFilter === "Overdue"
                                    ? "bg-rose-600 text-white shadow-2xs"
                                    : "bg-rose-50/80 text-rose-700 hover:bg-rose-100 border border-rose-200"
                            }`}
                        >
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                            <span>Overdue</span>
                            <span className={`text-[9.5px] font-mono font-bold px-1.5 py-0.1 rounded ${
                                statusFilter === "Overdue" ? "bg-white/25 text-white" : "bg-white text-rose-700"
                            }`}>
                                {overdueCount}
                            </span>
                        </button>
                    )}
                </div>

                {overdueCount > 0 && statusFilter === "All" && (
                    <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px]">
                        <span className="text-slate-600 font-medium flex items-center gap-1 truncate">
                            <span className="text-rose-500 font-bold">⚠️</span>
                            <span>{overdueCount} {overdueCount === 1 ? 'application exceeds' : 'applications exceed'} 7-day benchmark</span>
                        </span>
                        <button
                            type="button"
                            onClick={() => onStatusFilterChange && onStatusFilterChange("Overdue")}
                            className="text-[10px] font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer shrink-0 ml-1"
                        >
                            Filter →
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

