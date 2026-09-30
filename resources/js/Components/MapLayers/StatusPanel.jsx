import { useMemo } from 'react';
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
    },
    "Technical Review": {
        shortLabel: "Review",
        label: "Technical Review",
        color: "#f59e0b", // Amber Gold
        border: "#d97706",
        badgeBg: "#fffbeb",
        badgeText: "#92400e",
    },
    "Under Sangguniang Bayan": {
        shortLabel: "SB Hearing",
        label: "Under SB Hearing",
        color: "#8b5cf6", // Purple
        border: "#7c3aed",
        badgeBg: "#f5f3ff",
        badgeText: "#5b21b6",
    },
    "For Release": {
        shortLabel: "For Release",
        label: "For Release",
        color: "#0ea5e9", // Sky Blue
        border: "#0284c7",
        badgeBg: "#f0f9ff",
        badgeText: "#075985",
    },
    "Released": {
        shortLabel: "Released",
        label: "Released",
        color: "#2563eb", // Blue (matches Applications)
        border: "#1d4ed8",
        badgeBg: "#eff6ff",
        badgeText: "#1e40af",
    },
    "Denied": {
        shortLabel: "Denied",
        label: "Denied",
        color: "#f43f5e", // Rose Red
        border: "#e11d48",
        badgeBg: "#fff1f2",
        badgeText: "#9f1239",
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
            label: "2d in process",
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
            label: `${days}d in process`,
            color: "text-slate-500",
            isOverdue: false,
        };
    } else if (days <= 14) {
        return {
            days,
            status: "warning",
            label: `${days}d pending`,
            color: "text-amber-700 font-medium",
            isOverdue: true,
        };
    } else {
        return {
            days,
            status: "overdue",
            label: `${days}d · past SLA`,
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
            label: "Manual review",
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
            label: "Conforming",
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
            label: "SB reclassification",
            desc: `Agri-Industrial use within a ${zoneDisplay} zone requires SB reclassification and DAR clearance.`,
        };
    }

    return {
        status: "variance",
        isConforming: false,
        badgeClass: "text-amber-800 bg-amber-50 border-amber-200/80",
        dotClass: "bg-amber-500",
        title: "Variance Required",
        label: "Variance review",
        desc: `${requested.label} use does not conform to this parcel's ${zoneDisplay} CLUP classification.`,
    };
};

const isResolved = (app) => getSLAInfo(app?.created_at, app?.status).status === "completed";

// The shared status filter: "All" or a STATUS_MARKER_CONFIG key. The map
// markers, the legend and the attribute table all read the same value.
export function matchesAppFilters(app, appTypeFilter, statusFilter) {
    if (appTypeFilter && appTypeFilter !== "All") {
        if (!(app?.application_type || "").toLowerCase().includes(appTypeFilter.toLowerCase())) return false;
    }
    if (!statusFilter || statusFilter === "All") return true;
    return getStatusMarkerConfig(app?.status) === STATUS_MARKER_CONFIG[statusFilter];
}

const ageInDays = (app) => {
    if (!app?.created_at) return 0;
    return Math.max(1, Math.floor((Date.now() - new Date(app.created_at).getTime()) / 86400000));
};

export default function StatusPanel({
    recent = [],
    selectedBgy = null,
}) {
    const isBgy = Boolean(selectedBgy?.name);
    const bgyName = selectedBgy?.name || "";

    const baseList = useMemo(() => {
        const list = Array.isArray(recent) ? recent : [];
        if (!isBgy) return list;
        const target = bgyName.trim().toLowerCase();
        return list.filter((r) => (r.barangay || "").trim().toLowerCase() === target);
    }, [recent, isBgy, bgyName]);

    const stats = useMemo(() => {
        const now = new Date();
        let open = 0;
        let releasedThisMonth = 0;
        let openDays = 0;
        baseList.forEach((app) => {
            if (!isResolved(app)) {
                open++;
                openDays += ageInDays(app);
            } else if (getStatusMarkerConfig(app?.status) === STATUS_MARKER_CONFIG.Released) {
                const d = new Date(app.updated_at || app.created_at || 0);
                if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) releasedThisMonth++;
            }
        });
        return { total: baseList.length, open, releasedThisMonth, avgOpenDays: open ? Math.round(openDays / open) : 0 };
    }, [baseList]);

    const kpis = [
        { label: "Applications", value: stats.total },
        { label: "In process", value: stats.open },
        { label: "Released this month", value: stats.releasedThisMonth },
    ];

    // Status mix of what is in scope, as one thin bar under the numbers.
    const breakdown = useMemo(() => {
        const counts = {};
        baseList.forEach((app) => {
            const cfg = getStatusMarkerConfig(app.status);
            counts[cfg.label] = (counts[cfg.label] || 0) + 1;
        });
        return Object.values(STATUS_MARKER_CONFIG)
            .map((cfg) => ({ cfg, n: counts[cfg.label] || 0 }))
            .filter((x) => x.n > 0);
    }, [baseList]);

    return (
        <div className="shrink-0 flex flex-col">
            <div className="shrink-0 border-b border-slate-200">
                <div className="grid grid-cols-3">
                    {kpis.map((k, i) => (
                        <div key={k.label} className={`px-3 pt-2.5 pb-2 ${i > 0 ? "border-l border-slate-200" : ""}`}>
                            <span className="block text-[20px] font-semibold tabular-nums leading-none text-slate-900">{k.value}</span>
                            <span className="block text-[10.5px] text-slate-500 mt-1 leading-tight">{k.label}</span>
                        </div>
                    ))}
                </div>
                {breakdown.length > 0 && (
                    <div className="flex h-1.5 mx-3 mb-2.5 rounded-full overflow-hidden bg-slate-100" role="img"
                        aria-label={breakdown.map((b) => `${b.cfg.label} ${b.n}`).join(", ")}>
                        {breakdown.map((b) => (
                            <span key={b.cfg.label} title={`${b.cfg.label}: ${b.n}`} style={{ width: `${(b.n / stats.total) * 100}%`, backgroundColor: b.cfg.color }} />
                        ))}
                    </div>
                )}
            </div>

        </div>
    );
}
