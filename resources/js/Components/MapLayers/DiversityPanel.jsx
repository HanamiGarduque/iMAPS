import React, { useMemo, useState, useRef, useEffect } from 'react';
import ROSARIO_BARANGAYS_DATA from './rosario_barangays_data.json';
import { DIVERSITY_TIERS, getDiversityTheme, computeDiversityAggregates, findRank } from '@/utils/diversityTheme';

// 1. Comprehensive Zoning Code to Classification & Color Map (Official CLUP 2030)
const ZONE_MAP = {
    "PDA-SZ": { label: "Production Agricultural Sub-Zone", code: "PDA-SZ", fill: "#94d180", bg: "#1e3a29" },
    "PTA-SZ-RA": { label: "Protection Agricultural Rice Area", code: "PTA-SZ-RA", fill: "#94d180", bg: "#1e3a29" },
    "5491-APDA-SZ": { label: "Buffer / Greenbelt Sub-Zone", code: "5491-APDA-SZ", fill: "#61631f", bg: "#2a2b16" },
    "FZ": { label: "Forest Zone", code: "FZ", fill: "#5bb93c", bg: "#173815" },
    "FR-SZ": { label: "Forest Reserve Sub-Zone", code: "FR-SZ", fill: "#5bb93c", bg: "#173815" },
    "THSP-SZ": { label: "Tombol Hill Special Protection", code: "THSP-SZ", fill: "#5bb93c", bg: "#173815" },
    "WZ": { label: "Water Zone", code: "WZ", fill: "#2dcacd", bg: "#0f3739" },
    "R1-Z": { label: "Low-Density Residential (R-1)", code: "R1-Z", fill: "#fffc2b", bg: "#3a390e" },
    "R2-Z": { label: "Medium-Density Residential (R-2)", code: "R2-Z", fill: "#fffc2b", bg: "#3a390e" },
    "BR2-SZ": { label: "Basic R-2 Sub-Zone", code: "BR2-SZ", fill: "#ffc92b", bg: "#3a310e" },
    "MR2-SZ": { label: "Maximum R-2 Sub-Zone", code: "MR2-SZ", fill: "#ffc92b", bg: "#3a310e" },
    "Residential": { label: "Residential Zone", code: "R1-Z", fill: "#fffc2b", bg: "#3a390e" },
    "C1-Z": { label: "Commercial-1 Zone (C-1)", code: "C1-Z", fill: "#eb3356", bg: "#3a131b" },
    "C2-Z": { label: "Commercial-2 Zone (C-2)", code: "C2-Z", fill: "#eb3356", bg: "#3a131b" },
    "C/MP-Z": { label: "Cemetery / Memorial Park", code: "C/MP-Z", fill: "#36ff39", bg: "#123b13" },
    "I1-Z": { label: "Light Industrial (I-1)", code: "I1-Z", fill: "#de29c0", bg: "#3a0e33" },
    "I2-Z": { label: "Medium Industrial (I-2)", code: "I2-Z", fill: "#de29c0", bg: "#3a0e33" },
    "I3-Z": { label: "Heavy Industrial (I-3)", code: "I3-Z", fill: "#de29c0", bg: "#3a0e33" },
    "AgIndZ": { label: "Agri-Industrial Zone", code: "AgIndZ", fill: "#ff7cae", bg: "#3a1b29" },
    "AgIndZ-PTR": { label: "Agri-Industrial Poultry", code: "AgIndZ-PTR", fill: "#ff7cae", bg: "#3a1b29" },
    "AgIndZ-PGR": { label: "Agri-Industrial Piggery", code: "AgIndZ-PGR", fill: "#ff7cae", bg: "#3a1b29" },
    "GI-Z": { label: "General Institutional Zone", code: "GI-Z", fill: "#6146db", bg: "#1f173b" },
    "PR-Z": { label: "Parks & Recreation Zone", code: "PR-Z", fill: "#36ff39", bg: "#123b13" },
    "T-Z": { label: "Tourism Zone", code: "T-Z", fill: "#ffa97a", bg: "#3a2419" },
    "ECT-Z": { label: "Eco-Tourism Zone", code: "ECT-Z", fill: "#ffa97a", bg: "#3a2419" },
    "UTS-Z": { label: "Utilities & Transport Zone", code: "UTS-Z", fill: "#969696", bg: "#25272a" },
    "CMRF": { label: "Materials Recovery Facility", code: "CMRF", fill: "#969696", bg: "#25272a" },
    "ROAD": { label: "Road Network", code: "ROAD", fill: "#94a3b8", bg: "#25272a" },
    "PROPOSED ROAD": { label: "Proposed Bypass Network", code: "PROPOSED ROAD", fill: "#94a3b8", bg: "#25272a" },
};

// Helper resolver for DB codenames to full classifications
const getZoneInfo = (code) => {
    if (!code) return { label: "Undesignated", code: "", fill: "#94a3b8", bg: "#1e293b" };
    if (ZONE_MAP[code]) return { ...ZONE_MAP[code], code };
    return { label: code, code, fill: "#94a3b8", bg: "#1e293b" };
};

export default function DiversityPanel({
    donutLoaded = true,
    overallDiversity,
    selectedBgy,
    onClearBgy,
    onSelectBgy,
    bgyStats = {},
    diversityTierFilter = "all",
    onSelectDiversityTier = () => {},
}) {
    const [activeTab, setActiveTab] = useState("corridors"); // "corridors" | "farming"
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const searchContainerRef = useRef(null);

    const isBgy = Boolean(selectedBgy && selectedBgy.name);
    const bgyName = selectedBgy?.name || "";

    // Lookup preloaded GeoJSON barangay baseline (used for the static area/name/geometry index)
    const matchedGeoBgy = useMemo(() => {
        if (!bgyName) return null;
        return ROSARIO_BARANGAYS_DATA.find(
            (b) => b.name.toLowerCase() === bgyName.toLowerCase()
        );
    }, [bgyName]);

    // Live backend record for the selected barangay (real Simpson's index, CLUP variance,
    // permit pressure forecast, spatial cluster). Falls back to whatever the map click sent.
    const bgyStat = (bgyStats && bgyStats[bgyName])
        ? bgyStats[bgyName]
        : (selectedBgy?.data || matchedGeoBgy || {});

    // Merge the static 48-barangay geometry index with live backend stats so every
    // barangay row (search, explorer) shows the real, currently-computed diversity score.
    const mergedBarangays = useMemo(() => {
        return ROSARIO_BARANGAYS_DATA.map((b) => {
            const live = bgyStats?.[b.name];
            const diversity = typeof live?.diversity === 'number' ? live.diversity : b.diversity;
            return {
                name: b.name,
                area_ha: b.area_ha,
                zone: live?.Primary_Zone || b.zone,
                dist: b.dist,
                diversity,
                variance: live?.variance,
                varianceStatus: live?.varianceStatus,
                permitCount: live?.permitCount ?? live?.Total ?? 0,
                cluster: live?.cluster || null,
                pressure: live?.pressure || null,
            };
        });
    }, [bgyStats]);

    // Municipal-wide aggregates computed live from the merged list (never hardcoded)
    const aggregates = useMemo(() => computeDiversityAggregates(mergedBarangays), [mergedBarangays]);
    const municipalMean = typeof overallDiversity?.score === 'number' ? overallDiversity.score : aggregates.mean;
    const rankInfo = useMemo(() => findRank(aggregates.ranked, bgyName), [aggregates, bgyName]);

    // Active Simpson's Diversity Score (0.00 to 1.00)
    const rawScore = isBgy
        ? (bgyStat.diversity ?? selectedBgy?.data?.diversity ?? matchedGeoBgy?.diversity ?? 0)
        : municipalMean;
    const score = typeof rawScore === 'number' ? rawScore : parseFloat(rawScore) || 0;
    const scoreTheme = getDiversityTheme(score);

    // Total Land Area in Hectares
    const totalAreaHa = isBgy
        ? (matchedGeoBgy?.area_ha || Math.round((selectedBgy?.data?.area_sqkm || 3.5) * 100))
        : 14700;

    // Dynamic Distribution metrics: strictly switches to selected barangay when clicked
    const rawDistribution = useMemo(() => {
        if (isBgy) {
            if (bgyStat.distribution && bgyStat.distribution.length > 0) return bgyStat.distribution;
            if (selectedBgy?.data?.distribution && selectedBgy.data.distribution.length > 0) return selectedBgy.data.distribution;
            if (matchedGeoBgy?.dist && matchedGeoBgy.dist.length > 0) return matchedGeoBgy.dist;
            return [];
        }
        return overallDiversity?.distribution || [];
    }, [isBgy, bgyStat, selectedBgy, matchedGeoBgy, overallDiversity]);

    const topDistribution = rawDistribution.slice(0, 5);

    // Dominant & Secondary Zone Derivation
    const rawPrimaryCode = rawDistribution[0]?.name || bgyStat.Primary_Zone || matchedGeoBgy?.zone || "PDA-SZ";
    const primaryZone = getZoneInfo(rawPrimaryCode);
    const primaryPct = rawDistribution[0]?.value ?? (isBgy ? 100 : 60);

    const rawSecondaryCode = rawDistribution[1]?.name || (isBgy ? null : "PTA-SZ-RA");
    const secondaryZone = rawSecondaryCode ? getZoneInfo(rawSecondaryCode) : null;
    const secondaryPct = rawDistribution[1]?.value ?? (isBgy ? 0 : 9.6);

    const sectorCount = rawDistribution.length;

    // Comparison against the real, live-computed Rosario municipal average
    const diffFromAvg = score - municipalMean;
    const pctDiff = municipalMean > 0 ? Math.round((diffFromAvg / municipalMean) * 100) : 0;

    // Real backend analytics: CLUP variance (live vs. 2030 plan), permit pressure forecast,
    // and the spatial-cluster classification. No more client-side guesses.
    const clupVariance = typeof bgyStat.variance === 'number' ? bgyStat.variance : null;
    const varianceStatus = bgyStat.varianceStatus || null;
    const varianceColor = bgyStat.varianceColor || null;
    const clupTarget = typeof bgyStat.clupTargetDiversity === 'number' ? bgyStat.clupTargetDiversity : null;
    const permitCount = bgyStat.permitCount ?? 0;
    const pressure = bgyStat.pressure || null;
    const cluster = bgyStat.cluster || null;

    // Fast-Search Filtered Barangays (all 48, live scores, optionally tier-filtered)
    const filteredBarangays = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return mergedBarangays.filter((b) => {
            if (diversityTierFilter !== "all" && getDiversityTheme(b.diversity).tier !== diversityTierFilter) return false;
            if (!query) return true;
            return b.name.toLowerCase().includes(query) || (b.zone || "").toLowerCase().includes(query);
        });
    }, [mergedBarangays, searchQuery, diversityTierFilter]);

    // Close search dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
                setIsSearchOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Explorer lists: prefer the backend's already-ranked top/low barangays (real Simpson
    // index, includes cluster + pressure), fall back to a client-side rank of the merged list.
    const explorerTop = useMemo(() => {
        const source = (overallDiversity?.topBarangays?.length ? overallDiversity.topBarangays : aggregates.ranked)
            .map((b) => ({ ...b, diversity: b.diversity ?? b.score ?? 0 }));
        return diversityTierFilter === "all"
            ? source.slice(0, 8)
            : source.filter((b) => getDiversityTheme(b.diversity).tier === diversityTierFilter).slice(0, 8);
    }, [overallDiversity, aggregates, diversityTierFilter]);

    const explorerLow = useMemo(() => {
        const source = (overallDiversity?.lowBarangays?.length ? overallDiversity.lowBarangays : [...aggregates.ranked].reverse())
            .map((b) => ({ ...b, diversity: b.diversity ?? b.score ?? 0 }));
        return diversityTierFilter === "all"
            ? source.slice(0, 6)
            : source.filter((b) => getDiversityTheme(b.diversity).tier === diversityTierFilter).slice(0, 6);
    }, [overallDiversity, aggregates, diversityTierFilter]);

    // SVG Donut calculation
    const circumference = 213.6; // 2 * Math.PI * 34
    const donutSegments = useMemo(() => {
        let cumulative = 0;
        return topDistribution.map((item) => {
            const val = item.value || 0;
            const dashArrayVal = (val / 100) * circumference;
            const remainder = Math.max(0, circumference - dashArrayVal);
            const offset = -cumulative;
            cumulative += dashArrayVal;
            return {
                ...item,
                dashArrayVal,
                remainder,
                offset,
                zone: getZoneInfo(item.name)
            };
        });
    }, [topDistribution, circumference]);

    const activeTierTheme = diversityTierFilter !== "all" ? DIVERSITY_TIERS.find((t) => t.id === diversityTierFilter) : null;

    return (
        <div className="flex flex-col gap-3 p-3.5 bg-white/95 backdrop-blur-2xl rounded-3xl max-w-sm text-slate-800 border border-slate-200/80 shadow-2xl">

            {/* 0. Active Tier Filter Banner (reflects the map legend's click-to-filter state) */}
            {activeTierTheme && (
                <div
                    className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-2xl border"
                    style={{ backgroundColor: `${activeTierTheme.fill}14`, borderColor: `${activeTierTheme.fill}55` }}
                >
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: activeTierTheme.fill }} />
                        <span className="text-[10.5px] font-bold text-slate-800 truncate">
                            Filtering: {activeTierTheme.label}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => onSelectDiversityTier("all")}
                        className="text-[9.5px] font-bold text-slate-500 hover:text-slate-900 shrink-0 underline cursor-pointer"
                    >
                        Clear
                    </button>
                </div>
            )}

            {/* 1. Fast-Search & Barangay Selector Bar (Executive Navigation) */}
            <div ref={searchContainerRef} className="relative z-50">
                <div className="flex items-center gap-2 p-1.5 px-3 rounded-2xl bg-slate-50 border border-slate-200 shadow-inner">
                    <svg className="w-4 h-4 text-cyan-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setIsSearchOpen(true);
                        }}
                        onFocus={() => setIsSearchOpen(true)}
                        placeholder="Search or jump to barangay... (48)"
                        className="bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none w-full font-medium"
                    />
                    {searchQuery ? (
                        <button
                            type="button"
                            onClick={() => {
                                setSearchQuery("");
                                setIsSearchOpen(false);
                            }}
                            className="text-slate-400 hover:text-slate-800 text-xs px-1 cursor-pointer"
                        >
                            ✕
                        </button>
                    ) : (
                        <span className="text-[10px] font-mono text-cyan-700 font-bold px-1.5 py-0.5 rounded bg-cyan-50 border border-cyan-200">
                            {filteredBarangays.length}
                        </span>
                    )}
                </div>

                {/* Search Dropdown Results */}
                {isSearchOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-60 overflow-y-auto z-50 p-1.5 space-y-1">
                        <div className="flex items-center justify-between px-2 py-1 text-[9px] font-bold text-slate-400 border-b border-slate-100 uppercase tracking-wider">
                            <span>Barangay Name</span>
                            <span>Simpson Mix • Area</span>
                        </div>
                        {filteredBarangays.length > 0 ? (
                            filteredBarangays.map((b) => {
                                const tierInfo = getDiversityTheme(b.diversity);
                                return (
                                    <button
                                        key={b.name}
                                        type="button"
                                        onClick={() => {
                                            if (onSelectBgy) onSelectBgy(b.name);
                                            setSearchQuery("");
                                            setIsSearchOpen(false);
                                        }}
                                        className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-cyan-50 border border-transparent hover:border-cyan-200 text-left transition-all cursor-pointer group"
                                    >
                                        <div className="flex items-center gap-2 min-w-0 pr-1">
                                            <span
                                                className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                                                style={{ backgroundColor: tierInfo.fill }}
                                                title={tierInfo.classification}
                                            />
                                            <div className="truncate">
                                                <span className="text-xs font-bold text-slate-800 group-hover:text-cyan-700 block truncate">
                                                    {b.name}
                                                </span>
                                                <span className="text-[9px] text-slate-400 block truncate">
                                                    {getZoneInfo(b.zone).label}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <span className="text-xs font-mono font-bold text-cyan-700 block">
                                                {Number(b.diversity).toFixed(2)}
                                            </span>
                                            <span className="text-[9px] font-mono text-slate-400 block">
                                                {b.area_ha} ha
                                            </span>
                                        </div>
                                    </button>
                                );
                            })
                        ) : (
                            <div className="p-3 text-center text-xs text-slate-400 font-medium">
                                No barangay matching "{searchQuery}"
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* 2. Consolidated Scorecard: identity, score, rank, and vs-municipal comparison in one place.
                 Background is a pale tint of the current tier color so it still reads as a hero header. */}
            <div
                className="border rounded-2xl p-3.5 shadow-md space-y-2.5"
                style={{ backgroundColor: scoreTheme.lightBg, borderColor: `${scoreTheme.fill}45` }}
            >
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 pr-2">
                        <span className="text-[9px] font-bold uppercase tracking-widest block" style={{ color: scoreTheme.stroke }}>
                            {isBgy ? "Barangay 3D Spotlight" : "Municipal Character"}
                        </span>
                        <h3 className="text-sm font-black text-slate-900 mt-0.5 truncate">
                            {isBgy ? `Brgy. ${bgyName}` : "Rosario Town Spatial Mix"}
                        </h3>
                    </div>

                    {isBgy && onClearBgy ? (
                        <button
                            type="button"
                            onClick={onClearBgy}
                            className="text-[10px] font-bold text-slate-600 hover:text-slate-900 bg-white/70 hover:bg-white px-2 py-1 rounded-xl transition-colors cursor-pointer border border-slate-200 shrink-0"
                            title="Return to municipal overview"
                        >
                            ✕ Deselect
                        </button>
                    ) : (
                        <span
                            className="px-2 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 border bg-white/70"
                            style={{ borderColor: `${scoreTheme.fill}55`, color: scoreTheme.stroke }}
                        >
                            Mean: {municipalMean.toFixed(2)}
                        </span>
                    )}
                </div>

                {/* Score + Tier Badge Row */}
                <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white/70 border border-white">
                    <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 font-mono font-black text-sm text-white shadow"
                        style={{ backgroundColor: scoreTheme.stroke }}
                    >
                        {score.toFixed(2)}
                    </div>
                    <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-900 block truncate">{scoreTheme.classification}</span>
                        <span className="text-[9.5px] text-slate-500 block truncate">{scoreTheme.summary}</span>
                    </div>
                </div>

                <div className="pt-0.5 flex items-center justify-between text-[10px] text-slate-500">
                    <span>Total Area: {totalAreaHa.toLocaleString()} ha</span>
                    {isBgy && rankInfo ? (
                        <span className="font-mono font-bold" style={{ color: scoreTheme.stroke }}>
                            Rank #{rankInfo.rank} of {rankInfo.total} · Top {rankInfo.percentile}%
                        </span>
                    ) : (
                        <span className="font-mono text-slate-600">{aggregates.count} barangays tracked</span>
                    )}
                </div>

                {isBgy && (
                    <div className="pt-2 border-t border-white flex items-center justify-between">
                        <span className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">
                            Vs. Municipal Mean ({municipalMean.toFixed(2)})
                        </span>
                        <span className={`text-[9.5px] font-semibold font-mono px-2 py-0.5 rounded ${
                            diffFromAvg >= 0
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}>
                            {diffFromAvg >= 0 ? `+${pctDiff}%` : `${pctDiff}%`} vs municipal mean
                        </span>
                    </div>
                )}
            </div>

            {/* 3. Live Analytics: real CLUP variance + real permit-pressure forecast (SARIMAX) */}
            {isBgy && (
                <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-2xs space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
                            <span className="text-[8px] font-bold uppercase tracking-wider text-slate-500 block">
                                CLUP 2030 Variance
                            </span>
                            {clupVariance !== null ? (
                                <div className="flex items-center gap-1 mt-0.5">
                                    <span className="text-[10.5px] font-mono font-bold" style={{ color: varianceColor || '#64748b' }}>
                                        {clupVariance > 0 ? `+${clupVariance.toFixed(2)}` : clupVariance.toFixed(2)} Δ
                                    </span>
                                    <span className="text-[8px] px-1 rounded bg-slate-200/70 text-slate-600 truncate">
                                        {varianceStatus || "—"}
                                    </span>
                                </div>
                            ) : (
                                <span className="text-[10px] text-slate-400 mt-0.5 block">No CLUP baseline yet</span>
                            )}
                        </div>

                        <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
                            <span className="text-[8px] font-bold uppercase tracking-wider text-slate-500 block">
                                Live Clearances
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[10.5px] font-mono font-bold text-slate-800">
                                    {permitCount} Permit{permitCount === 1 ? "" : "s"}
                                </span>
                                {permitCount > 0 && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Recorded clearances" />
                                )}
                            </div>
                        </div>
                    </div>

                    {clupTarget !== null && (
                        <div className="space-y-1">
                            <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
                                <span>Planned (CLUP 2030): {clupTarget.toFixed(2)}</span>
                                <span>Live: {score.toFixed(2)}</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden relative">
                                <div className="h-full bg-slate-400/60 absolute" style={{ width: `${Math.min(100, clupTarget * 100)}%` }} />
                                <div className="h-full absolute" style={{ width: '2px', left: `${Math.min(100, clupTarget * 100)}%`, backgroundColor: '#475569' }} />
                                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, score * 100)}%`, backgroundColor: scoreTheme.fill }} />
                            </div>
                        </div>
                    )}

                    {pressure && (
                        <div className="pt-2 border-t border-slate-100 space-y-1.5">
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                                    Application Pressure Forecast
                                </span>
                                <span
                                    className="text-[9px] font-bold px-1.5 py-0.2 rounded border"
                                    style={{ color: pressure.color, borderColor: `${pressure.color}55`, backgroundColor: `${pressure.color}15` }}
                                >
                                    {pressure.level}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-[10.5px]">
                                <span className="text-slate-600">
                                    ~<span className="font-mono font-bold text-slate-800">{pressure.forecast6m}</span> filings expected / 6 mo
                                </span>
                                <span className="text-slate-600">
                                    Proj. Mix: <span className="font-mono font-bold text-slate-800">{Number(pressure.projectedDiversity6m ?? score).toFixed(2)}</span>
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* 4. Spatial Cluster Directive: real backend classification (barangay), or a live municipal summary */}
            <div className="bg-gradient-to-br from-cyan-50 via-white to-indigo-50 border border-cyan-200 rounded-2xl p-3.5 shadow-md space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200/70">
                    <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-md bg-cyan-100 text-cyan-700 flex items-center justify-center font-bold text-xs">
                            ⚖️
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-cyan-700">
                            {isBgy ? "MPDO Spatial Cluster" : "Rosario Spatial Strategy"}
                        </span>
                    </div>
                    {isBgy && cluster && (
                        <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded border"
                            style={{ color: cluster.color, borderColor: `${cluster.color}55`, backgroundColor: `${cluster.color}15` }}
                        >
                            {cluster.tag}
                        </span>
                    )}
                </div>

                {isBgy ? (
                    cluster ? (
                        <div>
                            <h5 className="text-xs font-bold text-slate-900 mb-1">{cluster.name}</h5>
                            <p className="text-[10.5px] text-slate-600 leading-relaxed">{cluster.description}</p>
                            <div className="pt-1.5 mt-1.5 border-t border-slate-200/70 flex items-start gap-1.5">
                                <span className="text-slate-500 text-[9.5px] shrink-0">Guideline:</span>
                                <span className="font-semibold text-cyan-700 text-[9.5px] leading-relaxed">{cluster.guideline}</span>
                            </div>
                        </div>
                    ) : (
                        <p className="text-[10.5px] text-slate-500 leading-relaxed">
                            No spatial cluster classification is available for this barangay yet — it may be missing CLUP 2030 baseline land-use records.
                        </p>
                    )
                ) : (
                    <div className="space-y-2">
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                            Rosario's live municipal mix scores <strong className="text-slate-900">{municipalMean.toFixed(2)}</strong> on Simpson's Diversity Index, led by{' '}
                            <strong className="text-slate-900">{primaryZone.label}</strong> at <strong className="text-slate-900">{primaryPct}%</strong> of mapped land area across {sectorCount || '—'} tracked sectors.
                        </p>
                        {topDistribution.length > 0 && (
                            <div className="pt-2 border-t border-slate-200/70">
                                <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 mb-1">
                                    {topDistribution.slice(0, 2).map((d) => (
                                        <span key={d.name}>{getZoneInfo(d.name).label}: {d.value}%</span>
                                    ))}
                                </div>
                                <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden flex">
                                    {topDistribution.map((d) => (
                                        <div key={d.name} className="h-full" style={{ width: `${d.value}%`, backgroundColor: getZoneInfo(d.name).fill }} title={`${getZoneInfo(d.name).label}: ${d.value}%`} />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* 5. Dominant & Secondary CLUP Zoning Breakdown */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-3 shadow-2xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                            <span className="text-[8.5px] font-bold uppercase tracking-wider text-slate-500">
                                Dominant Land Use
                            </span>
                            {primaryZone.code && (
                                <span className="text-[8px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                                    {primaryZone.code}
                                </span>
                            )}
                        </div>
                        <h4 className="text-xs font-bold text-slate-900 mt-0.5 truncate" title={primaryZone.label}>
                            {primaryZone.label}
                        </h4>
                    </div>
                    <div className="text-right shrink-0">
                        <span className="text-sm font-mono font-black text-cyan-700">
                            {primaryPct}%
                        </span>
                        <span className="block text-[8.5px] font-mono text-slate-500">
                            {((primaryPct / 100) * totalAreaHa).toFixed(1)} ha
                        </span>
                    </div>
                </div>

                {secondaryZone && (
                    <div className="flex items-center justify-between pt-2">
                        <div className="min-w-0 pr-2">
                            <span className="text-[8px] font-bold uppercase tracking-wider text-slate-500 block">
                                Secondary Land Use
                            </span>
                            <span className="text-[11px] font-semibold text-slate-700 truncate block mt-0.5" title={secondaryZone.label}>
                                {secondaryZone.label}
                            </span>
                        </div>
                        <div className="text-right shrink-0">
                            <span className="text-xs font-mono font-bold text-slate-700">
                                {secondaryPct}%
                            </span>
                            <span className="block text-[8.5px] font-mono text-slate-500">
                                {((secondaryPct / 100) * totalAreaHa).toFixed(1)} ha
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* 6. Zoning Breakdown Donut Chart & StatBars */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                        <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: primaryZone.fill }}
                        />
                        <h4 className="text-xs font-bold text-slate-900 truncate">
                            {isBgy ? `Brgy. ${bgyName} Zoning Mix` : "Municipal Zoning Breakdown"}
                        </h4>
                    </div>
                    <span className="text-[9px] font-mono text-slate-500 shrink-0">
                        Top {topDistribution.length} of {sectorCount}
                    </span>
                </div>

                <div className="flex items-center gap-3.5">
                    {/* Donut Chart */}
                    <div className="relative w-20 h-20 shrink-0 drop-shadow-md">
                        <svg viewBox="0 0 88 88" className="w-full h-full -rotate-90">
                            <circle cx="44" cy="44" r="34" fill="none" stroke="#e2e8f0" strokeWidth="10" />
                            {donutSegments.map((seg, index) => (
                                <circle
                                    key={seg.name}
                                    cx="44" cy="44" r="34" fill="none" stroke={seg.zone.fill} strokeWidth="10"
                                    strokeDasharray={donutLoaded ? `${seg.dashArrayVal} ${seg.remainder}` : `0 ${circumference}`}
                                    strokeDashoffset={seg.offset}
                                    style={{ transition: `stroke-dasharray 0.8s cubic-bezier(0.34,1.56,0.64,1) ${index * 0.1}s` }}
                                />
                            ))}
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                            <span className="text-[7.5px] font-bold uppercase tracking-wider" style={{ color: scoreTheme.stroke }}>INDEX</span>
                            <span className="text-xs font-black font-mono text-slate-900">{score.toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Breakdown List with Hectares */}
                    <div className="flex-1 space-y-2 min-w-0">
                        {topDistribution.length > 0 ? topDistribution.map((item) => {
                            const zone = getZoneInfo(item.name);
                            const itemHa = ((item.value / 100) * totalAreaHa).toFixed(1);
                            return (
                                <div key={item.name} className="space-y-0.5">
                                    <div className="flex items-center justify-between text-[10px]">
                                        <span className="text-slate-600 truncate font-medium pr-1" title={zone.label}>
                                            {zone.label}
                                        </span>
                                        <span className="font-mono font-bold text-slate-800 shrink-0 text-right">
                                            {item.value}% <span className="text-[8.5px] text-slate-400 font-normal">({itemHa} ha)</span>
                                        </span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-500"
                                            style={{ width: `${item.value}%`, backgroundColor: zone.fill }}
                                        />
                                    </div>
                                </div>
                            );
                        }) : (
                            <span className="text-xs text-slate-400 font-medium">No zoning records available.</span>
                        )}
                    </div>
                </div>
            </div>

            {/* 7. Interactive Barangay Explorer (Municipal Mode) — backed by the real, ranked list from the server */}
            {!isBgy && (
                <div className="bg-white rounded-2xl border border-slate-200/90 p-3 shadow-2xs">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
                        <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-cyan-500" />
                            <h4 className="text-xs font-bold text-slate-900">
                                Barangay Explorer
                            </h4>
                        </div>

                        {/* Mode Toggle */}
                        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-[9px] font-bold">
                            <button
                                type="button"
                                onClick={() => setActiveTab("corridors")}
                                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                                    activeTab === "corridors" ? "bg-white text-slate-900 shadow-xs font-bold" : "text-slate-500 hover:text-slate-800"
                                }`}
                            >
                                High Mix
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab("farming")}
                                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                                    activeTab === "farming" ? "bg-white text-slate-900 shadow-xs font-bold" : "text-slate-500 hover:text-slate-800"
                                }`}
                            >
                                Agricultural
                            </button>
                        </div>
                    </div>

                    <div className="space-y-1">
                        {(() => {
                            const list = activeTab === "corridors" ? explorerTop : explorerLow;
                            // Literal Tailwind class strings per tab (kept literal so the JIT scanner can find them)
                            const accent = activeTab === "corridors"
                                ? { border: "hover:border-cyan-300", name: "group-hover:text-cyan-700", arrow: "group-hover:text-cyan-600" }
                                : { border: "hover:border-emerald-300", name: "group-hover:text-emerald-700", arrow: "group-hover:text-emerald-600" };

                            if (list.length === 0) {
                                return (
                                    <div className="p-3 text-center text-[10.5px] text-slate-400 font-medium">
                                        No barangays match this filter.
                                    </div>
                                );
                            }

                            return list.map((b, idx) => {
                                const pInfo = getZoneInfo(b.primaryZone || b.zone);
                                const bTier = getDiversityTheme(b.diversity);
                                return (
                                    <button
                                        key={b.name}
                                        type="button"
                                        onClick={() => onSelectBgy && onSelectBgy(b.name)}
                                        className={`w-full text-left p-1.5 px-2 rounded-xl bg-slate-50 hover:bg-white border border-slate-200/70 ${accent.border} transition-all flex items-center justify-between group cursor-pointer`}
                                        title={`Fly to Brgy. ${b.name} on the 3D map`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0 pr-2">
                                            <span
                                                className="w-4 h-4 rounded-full text-[9px] font-mono font-bold flex items-center justify-center text-white shrink-0 shadow-xs"
                                                style={{ backgroundColor: bTier.stroke }}
                                            >
                                                {idx + 1}
                                            </span>
                                            <div className="min-w-0">
                                                <span className={`text-xs font-bold text-slate-800 ${accent.name} block truncate`}>
                                                    {b.name}
                                                </span>
                                                <span className="text-[9px] text-slate-500 block truncate">
                                                    {b.cluster?.tag || pInfo.label}
                                                    {b.pressure?.level ? ` • ${b.pressure.level}` : ''}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <span
                                                className="px-1.5 py-0.2 rounded-md text-[9.5px] font-mono font-bold border"
                                                style={{
                                                    backgroundColor: `${bTier.fill}20`,
                                                    borderColor: `${bTier.fill}55`,
                                                    color: bTier.stroke
                                                }}
                                            >
                                                {Number(b.diversity).toFixed(2)}
                                            </span>
                                            <span className={`text-[10px] text-slate-400 ${accent.arrow} font-bold`}>
                                                →
                                            </span>
                                        </div>
                                    </button>
                                );
                            });
                        })()}
                    </div>
                </div>
            )}
        </div>
    );
}
