import React, { useState, useEffect, useMemo, useRef } from 'react';

// ── Refined Executive Status Configuration (Clean Slate with Subtle Semantic Dots) ──
export const STATUS_CONFIG = {
    "Received": {
        label: "Received",
        dot: "bg-sky-500",
    },
    "Technical Review": {
        label: "Technical Review",
        dot: "bg-amber-500",
    },
    "Under Sangguniang Bayan": {
        label: "SB Hearing",
        dot: "bg-violet-500",
    },
    "For Release": {
        label: "For Release",
        dot: "bg-teal-500",
    },
    "Released": {
        label: "Released",
        dot: "bg-slate-800",
    },
    "Denied": {
        label: "Denied",
        dot: "bg-rose-500",
    },
};

export const getStatusConfig = (status) => {
    if (!status) return STATUS_CONFIG["Received"];
    const s = String(status).trim();
    if (STATUS_CONFIG[s]) return STATUS_CONFIG[s];
    if (s.toLowerCase().includes("review")) return STATUS_CONFIG["Technical Review"];
    if (s.toLowerCase().includes("sangguniang") || s.toLowerCase().includes("bayan")) return STATUS_CONFIG["Under Sangguniang Bayan"];
    if (s.toLowerCase().includes("for release")) return STATUS_CONFIG["For Release"];
    if (s.toLowerCase().includes("release") || s.toLowerCase().includes("approved")) return STATUS_CONFIG["Released"];
    if (s.toLowerCase().includes("denied") || s.toLowerCase().includes("reject")) return STATUS_CONFIG["Denied"];
    return STATUS_CONFIG["Received"];
};

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
export const getZoningConformity = (app, bgyZone = "Residential") => {
    const appType = (app?.application_type || "").toLowerCase();
    const appName = (app?.applicant_name || "").toLowerCase();
    const declaredUse = (app?.land_use_class || app?.parcels?.[0]?.land_use || "").toLowerCase();
    const zone = (bgyZone || "Residential").toLowerCase();

    // Check if commercial / industrial / manufacturing in residential or agricultural without variance
    const isHeavyUse = appName.includes("agro") || appName.includes("industrial") || appName.includes("manufacturing") || appName.includes("concrete") || appName.includes("poultry") || declaredUse.includes("industrial");
    const isResidential = zone.includes("residential") || zone.includes("r-1") || zone.includes("r-2");
    const isAgricultural = zone.includes("agricultural");

    if (isHeavyUse && (isResidential || isAgricultural)) {
        return {
            status: "variance",
            isConforming: false,
            badgeClass: "text-amber-800 bg-amber-50 border-amber-200/80",
            dotClass: "bg-amber-500",
            title: "Variance Review",
            label: "⚠️ Variance Check",
            desc: `Commercial/Industrial activity proposed within ${bgyZone || 'Residential'} zone`,
        };
    }

    if (appType.includes("development") && isAgricultural) {
        return {
            status: "conversion",
            isConforming: false,
            badgeClass: "text-violet-800 bg-violet-50 border-violet-200/80",
            dotClass: "bg-violet-500",
            title: "Reclassification",
            label: "📋 SB Reclassification",
            desc: "Development permit within Agricultural zone requires SB reclassification",
        };
    }

    return {
        status: "conforming",
        isConforming: true,
        badgeClass: "text-emerald-800 bg-emerald-50 border-emerald-200/80",
        dotClass: "bg-emerald-500",
        title: "Conforming Use",
        label: "✅ Conforming Use",
        desc: `Permitted under ${bgyZone || 'CLUP'} zoning classification`,
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
    searchQuery = "",
    onSearchQueryChange,
    hoveredAppId = null,
    onHoverApp,
    onSelectApp,
    onLocateApp,
}) {
    const isBgy = Boolean(selectedBgy && selectedBgy.name);
    const bgyName = selectedBgy?.name || "";

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

            {/* 2. Live Spatial Assessment Briefing (Animated Typewriter Effect) */}
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
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />
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
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
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

