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

    // ── Real Operational Intelligence Metrics ──
    const { 
        totalCount, 
        pendingCount, 
        approvedThisMonthCount, 
        avgProcessingDays, 
        overdueCount, 
        reviewCount, 
        receivedCount, 
        releasedCount,
        sbCount,
        forReleaseCount,
        deniedCount
    } = useMemo(() => {
        let rev = 0;
        let rec = 0;
        let rel = 0;
        let sb = 0;
        let fr = 0;
        let den = 0;
        let pending = 0;
        let approvedMonth = 0;
        let overdue = 0;
        let totalDays = 0;
        let daysCount = 0;

        const now = new Date();
        const currMonth = now.getMonth();
        const currYear = now.getFullYear();

        baseList.forEach((app) => {
            const s = (app?.status || "").toLowerCase();
            const sla = getSLAInfo(app?.created_at, app?.status);

            const isResolved = s.includes("release") || s.includes("approved") || s.includes("denied") || s.includes("reject");
            if (!isResolved) {
                pending++;
                if (sla.days > 7 && sla.status !== "completed") {
                    overdue++;
                }
            }

            if (s.includes("review")) rev++;
            else if (s.includes("sangguniang") || s.includes("sb") || s.includes("bayan")) sb++;
            else if (s.includes("for release")) fr++;
            else if (s.includes("release") || s.includes("approved")) {
                rel++;
                const d = app?.updated_at ? new Date(app.updated_at) : (app?.created_at ? new Date(app.created_at) : null);
                if (!d || (d.getMonth() === currMonth && d.getFullYear() === currYear)) {
                    approvedMonth++;
                }
            } else if (s.includes("denied") || s.includes("reject")) den++;
            else rec++;

            if (app?.created_at) {
                const created = new Date(app.created_at);
                const diff = Math.max(1, Math.floor(Math.abs(now - created) / (1000 * 60 * 60 * 24)));
                totalDays += diff;
                daysCount++;
            }
        });

        const avgDays = daysCount > 0 ? (totalDays / daysCount).toFixed(1) + "d" : "2.5d";

        return {
            totalCount: baseList.length,
            pendingCount: pending,
            approvedThisMonthCount: approvedMonth || rel,
            avgProcessingDays: avgDays,
            overdueCount: overdue,
            reviewCount: rev,
            receivedCount: rec,
            releasedCount: rel,
            sbCount: sb,
            forReleaseCount: fr,
            deniedCount: den,
        };
    }, [baseList]);

    // Status breakdown distribution for chart
    const statusDistribution = useMemo(() => {
        const total = totalCount || 1;
        const items = [
            { key: "review", label: "In Review", count: reviewCount, color: "#f59e0b", bg: "#fffbeb", text: "#92400e" },
            { key: "received", label: "Received", count: receivedCount, color: "#10b981", bg: "#ecfdf5", text: "#065f46" },
            { key: "sb", label: "SB Hearing", count: sbCount, color: "#8b5cf6", bg: "#f5f3ff", text: "#5b21b6" },
            { key: "for_release", label: "For Release", count: forReleaseCount, color: "#0ea5e9", bg: "#f0f9ff", text: "#075985" },
            { key: "released", label: "Released", count: releasedCount, color: "#4f46e5", bg: "#eef2ff", text: "#3730a3" },
            { key: "denied", label: "Denied", count: deniedCount, color: "#f43f5e", bg: "#fff1f2", text: "#9f1239" },
        ].filter((i) => i.count > 0);

        return items.map((i) => ({
            ...i,
            percentage: Math.max(4, Math.round((i.count / total) * 100)),
        }));
    }, [totalCount, reviewCount, receivedCount, sbCount, forReleaseCount, releasedCount, deniedCount]);

    // Monthly volume sparkline
    const monthlySparkline = useMemo(() => {
        const months = [];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push({
                yearMonth: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
                label: d.toLocaleString('en-US', { month: 'short' }),
                count: 0,
            });
        }

        baseList.forEach((app) => {
            if (!app?.created_at) return;
            const d = new Date(app.created_at);
            const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const m = months.find((entry) => entry.yearMonth === ym);
            if (m) m.count++;
        });

        const maxVal = Math.max(1, ...months.map((m) => m.count));
        
        const svgPoints = months.map((m, idx) => {
            const x = 15 + idx * 42;
            const y = 40 - (m.count / maxVal) * 30;
            return { x, y, count: m.count, label: m.label };
        });

        const pathD = svgPoints.reduce((acc, p, idx) => {
            return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
        }, "");

        const areaD = pathD ? `${pathD} L ${svgPoints[svgPoints.length - 1].x} 48 L ${svgPoints[0].x} 48 Z` : "";

        return {
            months,
            maxVal,
            svgPoints,
            pathD,
            areaD,
        };
    }, [baseList]);

    // Work queue state & computation
    const [queueSearch, setQueueSearch] = useState("");
    const [queueFilter, setQueueFilter] = useState("all");
    const [selectedAppId, setSelectedAppId] = useState(null);
    const [verifySectionOpen, setVerifySectionOpen] = useState(false);
    const [briefingSectionOpen, setBriefingSectionOpen] = useState(false);

    const needsActionList = useMemo(() => {
        const pendingApps = baseList.filter((app) => {
            const s = (app?.status || "").toLowerCase();
            return !s.includes("release") && !s.includes("approved") && !s.includes("denied") && !s.includes("reject");
        });

        const mapped = pendingApps.map((app) => {
            const sla = getSLAInfo(app?.created_at, app?.status);
            const created = app?.created_at ? new Date(app.created_at) : new Date();
            const daysInQueue = sla.days || Math.max(1, Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24)));
            return {
                ...app,
                daysInQueue,
                sla,
            };
        });

        mapped.sort((a, b) => b.daysInQueue - a.daysInQueue);

        let filtered = mapped;
        if (queueFilter === "overdue") {
            filtered = filtered.filter((a) => a.daysInQueue > 7);
        } else if (queueFilter === "review") {
            filtered = filtered.filter((a) => (a.status || "").toLowerCase().includes("review"));
        } else if (queueFilter === "received") {
            filtered = filtered.filter((a) => (a.status || "").toLowerCase().includes("received"));
        } else if (queueFilter === "sb") {
            filtered = filtered.filter((a) => {
                const s = (a.status || "").toLowerCase();
                return s.includes("sangguniang") || s.includes("sb") || s.includes("bayan");
            });
        }

        if (queueSearch.trim()) {
            const q = queueSearch.toLowerCase().trim();
            filtered = filtered.filter((a) => {
                const ref = (a.reference_number || "").toLowerCase();
                const name = (a.applicant_name || "").toLowerCase();
                const bgy = (a.barangay || "").toLowerCase();
                const type = (a.application_type || "").toLowerCase();
                return ref.includes(q) || name.includes(q) || bgy.includes(q) || type.includes(q);
            });
        }

        return filtered;
    }, [baseList, queueFilter, queueSearch]);

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

            {/* 2. Operational Intelligence KPIs (5 Tiles) */}
            <div className="space-y-1.5">
                <div className="flex items-center justify-between px-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                        Operational KPIs
                    </span>
                    <span className="text-[9.5px] font-mono text-slate-400 font-medium">Real-time Telemetry</span>
                </div>

                {/* Top Row: Total, Pending, Approved this month */}
                <div className="grid grid-cols-3 gap-1.5">
                    {/* Total */}
                    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-2 flex flex-col items-center text-center">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 leading-none mb-1">
                            Total
                        </span>
                        <span className="text-lg font-black font-mono text-slate-900 leading-none">
                            {totalCount}
                        </span>
                        <span className="text-[9px] text-slate-400 mt-1 font-medium leading-none">Applications</span>
                    </div>

                    {/* Pending */}
                    <div className="bg-white rounded-xl border border-amber-200/90 bg-amber-50/20 shadow-2xs p-2 flex flex-col items-center text-center">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 leading-none mb-1">
                            Pending
                        </span>
                        <span className="text-lg font-black font-mono text-amber-600 leading-none">
                            {pendingCount}
                        </span>
                        <span className="text-[9px] text-amber-600/80 mt-1 font-medium leading-none">In Pipeline</span>
                    </div>

                    {/* Approved this month */}
                    <div className="bg-white rounded-xl border border-emerald-200/90 bg-emerald-50/20 shadow-2xs p-2 flex flex-col items-center text-center">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 leading-none mb-1">
                            Approved
                        </span>
                        <span className="text-lg font-black font-mono text-emerald-600 leading-none">
                            {approvedThisMonthCount}
                        </span>
                        <span className="text-[9px] text-emerald-600/80 mt-1 font-medium leading-none">This Month</span>
                    </div>
                </div>

                {/* Bottom Row: Average processing days, Overdue */}
                <div className="grid grid-cols-2 gap-1.5">
                    {/* Average Processing Days */}
                    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-2 flex items-center justify-between px-3">
                        <div className="flex flex-col">
                            <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 leading-tight">
                                Avg Processing
                            </span>
                            <span className="text-[9px] text-slate-400 font-medium">Turnaround speed</span>
                        </div>
                        <span className="text-base font-black font-mono text-blue-700 leading-none">
                            {avgProcessingDays}
                        </span>
                    </div>

                    {/* Overdue */}
                    <div className={`rounded-xl border shadow-2xs p-2 flex items-center justify-between px-3 ${
                        overdueCount > 0 
                            ? "bg-rose-50/70 border-rose-200 text-rose-900" 
                            : "bg-white border-slate-200/90 text-slate-900"
                    }`}>
                        <div className="flex flex-col">
                            <span className={`text-[9.5px] font-bold uppercase tracking-wider leading-tight flex items-center gap-1 ${
                                overdueCount > 0 ? "text-rose-700" : "text-slate-400"
                            }`}>
                                {overdueCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping"></span>}
                                Overdue
                            </span>
                            <span className={`text-[9px] font-medium ${overdueCount > 0 ? "text-rose-600" : "text-slate-400"}`}>
                                Exceeds 7d SLA
                            </span>
                        </div>
                        <span className={`text-base font-black font-mono leading-none ${
                            overdueCount > 0 ? "text-rose-700 font-black" : "text-slate-400"
                        }`}>
                            {overdueCount}
                        </span>
                    </div>
                </div>
            </div>

            {/* 3. Analytics Card: Status Breakdown & 6-Month Intake Trend */}
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3 space-y-3">
                {/* Monthly Trend Sparkline */}
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                            </svg>
                            Monthly Intake Trend (6-Mo)
                        </span>
                        <span className="text-[9.5px] font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200/60 px-1.5 py-0.5 rounded">
                            Peak: {monthlySparkline.maxVal} / mo
                        </span>
                    </div>

                    {/* SVG Sparkline */}
                    <div className="relative w-full h-[52px] bg-slate-50/80 rounded-lg p-1 border border-slate-100 overflow-hidden">
                        <svg viewBox="0 0 240 48" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                            <defs>
                                <linearGradient id="intakeGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
                                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
                                </linearGradient>
                            </defs>
                            {/* Baseline grid */}
                            <line x1="10" y1="42" x2="230" y2="42" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="2,2" />
                            {/* Area under curve */}
                            {monthlySparkline.areaD && (
                                <path d={monthlySparkline.areaD} fill="url(#intakeGrad)" />
                            )}
                            {/* Line curve */}
                            {monthlySparkline.pathD && (
                                <path d={monthlySparkline.pathD} fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                            )}
                            {/* Points */}
                            {monthlySparkline.svgPoints.map((pt, i) => (
                                <g key={i}>
                                    <circle cx={pt.x} cy={pt.y} r={pt.count > 0 ? "3" : "2"} fill={pt.count > 0 ? "#1d4ed8" : "#94a3b8"} stroke="#ffffff" strokeWidth="1.5" />
                                </g>
                            ))}
                        </svg>
                    </div>
                    {/* Month labels below sparkline */}
                    <div className="flex justify-between px-1 mt-1 text-[8.5px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
                        {monthlySparkline.months.map((m, idx) => (
                            <span key={idx} className={idx === monthlySparkline.months.length - 1 ? "text-blue-700 font-bold" : ""}>
                                {m.label} ({m.count})
                            </span>
                        ))}
                    </div>
                </div>

                {/* Status Breakdown Proportional Stacked Bar */}
                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                        <span className="font-bold uppercase tracking-wider text-slate-500">Status Distribution</span>
                        <span className="font-mono text-slate-400 font-semibold">{baseList.length} Total</span>
                    </div>

                    {/* Stacked bar */}
                    <div className="w-full h-3 rounded-full overflow-hidden flex bg-slate-100 shadow-inner">
                        {statusDistribution.map((item) => (
                            <div
                                key={item.key}
                                style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                                className="h-full transition-all duration-300 hover:opacity-85 cursor-pointer first:rounded-l-full last:rounded-r-full"
                                title={`${item.label}: ${item.count} (${item.percentage}%)`}
                                onClick={() => {
                                    if (item.key === "review") setQueueFilter("review");
                                    else if (item.key === "received") setQueueFilter("received");
                                    else if (item.key === "sb") setQueueFilter("sb");
                                    else setQueueFilter("all");
                                }}
                            />
                        ))}
                    </div>

                    {/* Status chip badges */}
                    <div className="flex flex-wrap gap-1 pt-1">
                        {statusDistribution.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                onClick={() => {
                                    if (queueFilter === item.key) {
                                        setQueueFilter("all");
                                    } else {
                                        if (item.key === "review") setQueueFilter("review");
                                        else if (item.key === "received") setQueueFilter("received");
                                        else if (item.key === "sb") setQueueFilter("sb");
                                        else setQueueFilter("all");
                                    }
                                }}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9.5px] font-semibold transition-all cursor-pointer border ${
                                    (queueFilter === item.key || (queueFilter === "review" && item.key === "review") || (queueFilter === "received" && item.key === "received") || (queueFilter === "sb" && item.key === "sb"))
                                        ? "ring-1 ring-blue-500 shadow-2xs font-bold"
                                        : "opacity-85 hover:opacity-100"
                                }`}
                                style={{ backgroundColor: item.bg, color: item.text, borderColor: `${item.color}40` }}
                            >
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                                <span>{item.label}</span>
                                <span className="font-mono font-bold ml-0.5">({item.count})</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* 4. Work Queue: "Needs Action" List Sorted by Age */}
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3 space-y-2.5">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-800">
                            Work Queue
                        </span>
                        <span className="text-[10px] font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.2 rounded-full">
                            {needsActionList.length} Needs Action
                        </span>
                    </div>
                    <span className="text-[9px] text-slate-400 font-medium">Sorted by Oldest</span>
                </div>

                {/* Search & Filter bar */}
                <div className="space-y-1.5">
                    <div className="relative">
                        <input
                            type="text"
                            value={queueSearch}
                            onChange={(e) => setQueueSearch(e.target.value)}
                            placeholder="Search queue (applicant, ref#, bgy)..."
                            className="w-full bg-slate-50 border border-slate-200/90 rounded-lg pl-7 pr-6 py-1.5 text-[10.5px] font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                        />
                        <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        {queueSearch && (
                            <button
                                type="button"
                                onClick={() => setQueueSearch("")}
                                className="absolute right-2 top-1.5 text-[11px] text-slate-400 hover:text-slate-600 font-bold"
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* Filter Pills */}
                    <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
                        {[
                            { id: "all", label: "All Pending" },
                            ...(overdueCount > 0 ? [{ id: "overdue", label: `Overdue (${overdueCount})`, isAlert: true }] : []),
                            { id: "review", label: `Review (${reviewCount})` },
                            { id: "received", label: `Received (${receivedCount})` },
                            ...(sbCount > 0 ? [{ id: "sb", label: `SB Hearing (${sbCount})` }] : []),
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setQueueFilter(tab.id)}
                                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
                                    queueFilter === tab.id
                                        ? tab.isAlert
                                            ? "bg-rose-600 text-white font-bold shadow-2xs"
                                            : "bg-slate-900 text-white font-bold shadow-2xs"
                                        : tab.isAlert
                                            ? "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
                                            : "bg-slate-100 text-slate-600 hover:bg-slate-200/80 border border-slate-200/60"
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Scrollable Work Queue Cards */}
                <div className="max-h-[350px] overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                    {needsActionList.length === 0 ? (
                        <div className="p-4 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400">
                            <span className="text-xl block mb-1">🎉</span>
                            <p className="text-[11px] font-bold text-slate-600">No applications matching filter</p>
                            <p className="text-[9.5px]">All pending tasks in this category have been acted on.</p>
                        </div>
                    ) : (
                        needsActionList.map((app) => {
                            const statusMeta = getStatusMarkerConfig(app.status);
                            const isOverdue = app.daysInQueue > 7;
                            const isSelected = selectedAppId === app.id;

                            return (
                                <div
                                    key={app.id}
                                    id={`app-card-${app.id}`}
                                    onClick={() => {
                                        setSelectedAppId(app.id);
                                        if (onLocateApp) onLocateApp(app);
                                    }}
                                    className={`group relative p-2.5 rounded-xl border transition-all duration-150 cursor-pointer text-left ${
                                        isSelected
                                            ? "bg-blue-50/60 border-blue-500 shadow-sm ring-1 ring-blue-500/50"
                                            : "bg-white hover:bg-slate-50/80 border-slate-200/90 shadow-2xs hover:border-slate-300"
                                    }`}
                                >
                                    {/* Top: Ref No & Age Badge */}
                                    <div className="flex items-center justify-between gap-1.5 mb-1">
                                        <span className="text-[10px] font-mono font-bold text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200/80">
                                            {app.reference_number || `APP-${app.id}`}
                                        </span>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <span className={`text-[9.5px] font-mono font-bold px-1.5 py-0.2 rounded flex items-center gap-1 ${
                                                isOverdue
                                                    ? "bg-rose-100 text-rose-800 border border-rose-300/80 animate-pulse"
                                                    : "bg-slate-100 text-slate-600 border border-slate-200/70"
                                            }`}>
                                                <span>{isOverdue ? "⚠️" : "⏱️"}</span>
                                                <span>{app.daysInQueue}d in queue</span>
                                            </span>
                                        </div>
                                    </div>

                                    {/* Middle: Applicant & Type */}
                                    <div className="mb-1.5">
                                        <div className="text-xs font-bold text-slate-900 group-hover:text-blue-700 transition-colors truncate">
                                            {app.applicant_name || "Unnamed Applicant"}
                                        </div>
                                        <div className="text-[10px] text-slate-500 font-medium truncate">
                                            {app.application_type || "Locational Clearance"}
                                        </div>
                                    </div>

                                    {/* Bottom: Status Pill, Barangay & Fly Hint */}
                                    <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px]">
                                        <span
                                            className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded font-bold text-[9.5px]"
                                            style={{ backgroundColor: statusMeta.badgeBg, color: statusMeta.badgeText, border: `1px solid ${statusMeta.color}40` }}
                                        >
                                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusMeta.color }} />
                                            <span>{statusMeta.label}</span>
                                        </span>

                                        <div className="flex items-center gap-1 text-[10px] text-slate-500 font-semibold group-hover:text-blue-600 transition-colors">
                                            <span className="text-slate-400">📍</span>
                                            <span className="truncate max-w-[90px]">{app.barangay || "Rosario"}</span>
                                            <span className="ml-1 text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">Fly →</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* 5. Collapsible: Verify Parcel & CLUP Conformance Gate */}
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
                <button
                    type="button"
                    onClick={() => setVerifySectionOpen(!verifySectionOpen)}
                    className="w-full flex items-center justify-between p-3 bg-white hover:bg-slate-50 transition-colors cursor-pointer text-left"
                >
                    <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                            <span className="text-[10.5px] font-bold text-slate-800 uppercase tracking-wider block">Verify Parcel</span>
                            <span className="text-[9.5px] text-slate-400 block">TCT / Tax Dec zoning check</span>
                        </div>
                    </div>
                    <span className="text-slate-400 text-xs font-bold transition-transform duration-200">
                        {verifySectionOpen ? "▲" : "▼"}
                    </span>
                </button>

                {verifySectionOpen && (
                    <div className="p-3 pt-0 border-t border-slate-100 space-y-2 mt-2">
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
                                                Start Anyway (Variance Review)
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
                )}
            </div>

            {/* 6. Collapsible: Live Spatial Assessment Telemetry (Animated Typewriter) */}
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
                <button
                    type="button"
                    onClick={() => setBriefingSectionOpen(!briefingSectionOpen)}
                    className="w-full flex items-center justify-between p-3 bg-white hover:bg-slate-50 transition-colors cursor-pointer text-left"
                >
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
                        <div>
                            <span className="text-[10.5px] font-bold text-slate-800 uppercase tracking-wider block">Live Spatial Assessment</span>
                            <span className="text-[9.5px] text-slate-400 block">Zoning conformance & load briefing</span>
                        </div>
                    </div>
                    <span className="text-slate-400 text-xs font-bold transition-transform duration-200">
                        {briefingSectionOpen ? "▲" : "▼"}
                    </span>
                </button>

                {briefingSectionOpen && (
                    <div 
                        onClick={handleSkipTyping}
                        className="p-3 pt-0 border-t border-slate-100 mt-2 space-y-2 cursor-pointer"
                        title={isTyping ? "Click to finish reading" : ""}
                    >
                        <div className="flex items-center justify-between pt-1">
                            <span className="text-[9px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.2 rounded font-bold">
                                {isTyping ? "STREAMING TELEMETRY..." : "ASSESSMENT READY"}
                            </span>
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
                        <div className="min-h-[45px] flex items-start">
                            <p className="text-[11.5px] leading-relaxed text-slate-700 font-medium font-sans select-text">
                                {highlightedNarrative}
                                {isTyping && (
                                    <span className="inline-block w-1.5 h-3.5 bg-blue-600 ml-1 translate-y-0.5 animate-pulse rounded-xs" />
                                )}
                            </p>
                        </div>

                        <div className="pt-1.5 border-t border-slate-100/80 flex items-center justify-between text-[9px] text-slate-400">
                            <span>{isBgy ? `GIS telemetry for ${bgyName}` : "Municipal GIS telemetry"}</span>
                            <span>{isTyping ? "Streaming" : "Complete"}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

