import { Component, useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, lazy, Suspense } from "react";
import { Head, router } from "@inertiajs/react";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell,
    PieChart,
    Pie,
} from "recharts";

import StatusPanel, { STATUS_MARKER_CONFIG, getStatusMarkerConfig, matchesAppFilters } from "@/Components/MapLayers/StatusPanel";
import TrendsPanel from "@/Components/MapLayers/TrendsPanel";
import useForecastWatchlist from "@/Components/MapLayers/useForecastWatchlist";
import ForecastBrief from "@/Components/MapLayers/ForecastBrief";
import DiversityPanel from "@/Components/MapLayers/DiversityPanel";
import LeafletMap, { getAppCoordinates, PIN_ZOOM } from "@/Components/Maps/LeafletMap";
import LayersPanel, { MODULES } from "@/Components/Maps/LayersPanel";
import TimelineBar from "@/Components/Maps/TimelineBar";
import DiversityTimeline from "@/Components/Maps/DiversityTimeline";
import AttributeTable from "@/Components/Maps/AttributeTable";
import MapSkeleton from "@/Components/Maps/MapSkeleton";
import { ApplicationDetails, BarangayCard } from "@/Components/Maps/IdentifyCards";
import { getLens } from "@/utils/diversityTheme";
import { getZoneInfo } from "@/utils/clupZones";
import { confirmSignOut } from "@/utils/signOut";


// The 3D view is split into its own chunk (it pulls in maplibre-gl). It loads
// on first use and is warmed during idle time after first paint.
const MapLibre3DView = lazy(() => import("@/Components/MapLayers/MapLibre3DView"));

class MapsErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, errorInfo) {
        this.setState({ errorInfo });
        console.error("MapsErrorBoundary caught an error", error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: "2rem", background: "#fee2e2", color: "#991b1b", minHeight: "100vh", fontFamily: "monospace" }}>
                    <h2 style={{ fontSize: "1.5rem", fontWeight: "bold" }}>Maps page crashed!</h2>
                    <br />
                    <strong style={{ fontSize: "1.2rem" }}>{this.state.error && this.state.error.toString()}</strong>
                    <br /><br />
                    <pre style={{ background: "rgba(255,255,255,0.5)", padding: "1rem", whiteSpace: "pre-wrap" }}>
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </pre>
                </div>
            );
        }
        return this.props.children;
    }
}

// Bumped when the forecast payload shape changes, so a cached run from an
// older shape is ignored rather than read as empty.
const FORECAST_CACHE_KEY = "imaps_forecast_data_v3";

const quarterLabel = (y, q) => `Q${q} '${String(y).slice(-2)}`;

// Quarters the LC timeline can scrub through: 2021 Q1 up to the latest
// recorded quarter, then the forecast quarters. The forecast quarters are the
// ones the model actually returned (it anchors on the last *completed*
// quarter, so its first one can be a quarter still being recorded); without a
// usable run, the two quarters after the latest record. `outdated` names the
// run's quarters when they are all already recorded.
function buildTimelineQuarters(urbanGrowthData, modelQuarters = []) {
    let currentYear, currentQuarter;

    let maxDate = null;
    if (urbanGrowthData?.historicalPins) {
        Object.values(urbanGrowthData.historicalPins).forEach(pins => {
            if (Array.isArray(pins)) {
                pins.forEach(p => {
                    if (p?.created_at) {
                        const d = new Date(p.created_at);
                        if (!isNaN(d.getTime())) {
                            if (!maxDate || d > maxDate) maxDate = d;
                        }
                    }
                });
            }
        });
    }

    if (maxDate) {
        currentYear = maxDate.getFullYear();
        currentQuarter = Math.floor(maxDate.getMonth() / 3) + 1;
    } else {
        const now = new Date();
        currentYear = now.getFullYear();
        currentQuarter = Math.floor(now.getMonth() / 3) + 1;
    }

    // Quarters as one running number, so comparing and stepping is arithmetic.
    const toIndex = (y, q) => y * 4 + q - 1;
    const fromIndex = (i) => ({ year: Math.floor(i / 4), quarter: (i % 4) + 1 });
    const recordedEnd = toIndex(currentYear, currentQuarter);

    const model = modelQuarters.map((m) => toIndex(m.year, m.quarter));
    const usable = model.length > 0 && model[model.length - 1] > recordedEnd;
    const outdated = model.length > 0 && !usable
        ? `${quarterLabel(modelQuarters[0].year, modelQuarters[0].quarter)}–${quarterLabel(modelQuarters[modelQuarters.length - 1].year, modelQuarters[modelQuarters.length - 1].quarter)}`
        : null;
    const forecast = usable ? model : [recordedEnd + 1, recordedEnd + 2];

    const quarters = [];
    for (let i = toIndex(2021, 1); i < forecast[0]; i++) {
        const { year, quarter } = fromIndex(i);
        quarters.push({ year, quarter, label: quarterLabel(year, quarter), isForecast: false });
    }
    forecast.forEach((i) => {
        const { year, quarter } = fromIndex(i);
        quarters.push({ year, quarter, label: quarterLabel(year, quarter), isForecast: true });
    });
    return { quarters, outdated };
}

// Map scale at a latitude and zoom, for a 96-dpi screen, rounded the way a
// scale readout usually is.
function mapScale(lat, zoom) {
    const metersPerPixel = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
    const scale = metersPerPixel / 0.0002645833;
    const magnitude = Math.pow(10, Math.floor(Math.log10(scale)) - 1);
    return Math.round(scale / magnitude) * magnitude;
}

const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

const ICONS = {
    layers: "M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3",
    zoomIn: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6",
    zoomOut: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6",
    extent: "M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15",
    panel: "M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z",
    fullscreen: "M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4",
    table: "M3.75 5.25h16.5v13.5H3.75zM3.75 9.75h16.5M3.75 14.25h16.5M9 9.75v9",
};

function ToolButton({ icon, label, onClick, pressed, disabled }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            aria-pressed={pressed}
            title={label}
            className={`w-8 h-8 flex items-center justify-center rounded-[3px] border cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[#0b2a5b] ${
                pressed ? "bg-[#dce6f3] border-[#9fb4d3] text-[#0b2a5b]" : "border-transparent text-slate-700 hover:bg-white hover:border-slate-300"
            }`}
        >
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[icon]} />
            </svg>
        </button>
    );
}

const Divider = () => <span className="w-px h-5 bg-slate-300 mx-1" aria-hidden="true" />

function DockHeader({ title, onClose, closeLabel }) {
    return (
        <div className="shrink-0 flex items-center justify-between h-8 px-3 bg-[#e6e9ee] border-b border-slate-300">
            <h2 className="text-[12px] font-semibold text-slate-800">{title}</h2>
            <button
                type="button"
                onClick={onClose}
                aria-label={closeLabel}
                className="w-6 h-6 flex items-center justify-center rounded-[3px] text-slate-500 hover:text-slate-900 hover:bg-white/70 cursor-pointer"
            >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}

function MapsInner({ userName, userRole, bgyStats, recent, filters, overallDiversity, urbanGrowthData }) {
    const [activeLayer, setActiveLayer] = useState("status");
    const [mapStyle, setMapStyle] = useState("satellite");
    const [appTypeFilter, setAppTypeFilter] = useState(filters?.application_type || "All");
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [layersOpen, setLayersOpen] = useState(isDesktop);
    const [panelOpen, setPanelOpen] = useState(isDesktop);
    const [clock, setClock] = useState("");
    const [showClup, setShowClup] = useState(false);
    const [clupOpacity, setClupOpacity] = useState(0.7);
    const [showLabels, setShowLabels] = useState(true);
    const [selectedBgy, setSelectedBgy] = useState(null);
    const [mapZoom, setMapZoom] = useState(13);
    const [resetTrigger, setResetTrigger] = useState(0);
    const [inspectedApp, setInspectedApp] = useState(null);
    const [statusFilter, setStatusFilter] = useState("All");
    const [flyToTarget, setFlyToTarget] = useState(null);
    const [verifiedParcel, setVerifiedParcel] = useState(null);
    const [diversityBandFilter, setDiversityBandFilter] = useState("all");
    const diversityLens = "mix";
    const [hoveredBgy, setHoveredBgy] = useState(null);
    const [cursor, setCursor] = useState(null);
    const [hoveredAppId, setHoveredAppId] = useState(null);
    const [tableHeight, setTableHeight] = useState(0);
    // A barangay to keep selected across a module switch (from the barangay card).
    const carryBgyRef = useRef(null);

    // ── LC demand timeline ──
    const [customForecastData, setCustomForecastData] = useState(() => {
        try {
            const saved = localStorage.getItem(FORECAST_CACHE_KEY);
            if (saved) return JSON.parse(saved);
        } catch (e) {}
        return null;
    });

    const handleForecastGenerated = (data) => {
        if (!data) return;
        setCustomForecastData(data);
        try {
            localStorage.setItem(FORECAST_CACHE_KEY, JSON.stringify(data));
        } catch (e) {}
    };

    // The model predicts a count per barangay-quarter. Nothing is invented from
    // it: a forecast quarter has counts, not application records.
    const forecastDemand = useMemo(() => {
        const rows = Array.isArray(customForecastData?.demand) ? customForecastData.demand : [];
        const byQuarter = {};
        rows.forEach((d) => {
            const key = `${d.year}-${d.quarter}`;
            const name = (d.barangay || "").trim();
            if (!name) return;
            (byQuarter[key] ||= {})[name.toLowerCase()] = Math.round(Number(d.predicted) || 0);
        });
        return byQuarter;
    }, [customForecastData]);

    const { quarters: timelineQuarters, outdated: forecastOutdated } = useMemo(() => {
        const modelQuarters = Object.keys(forecastDemand)
            .map((k) => k.split("-").map(Number))
            .sort((a, b) => a[0] - b[0] || a[1] - b[1])
            .map(([year, quarter]) => ({ year, quarter }));
        return buildTimelineQuarters(urbanGrowthData, modelQuarters);
    }, [urbanGrowthData, forecastDemand]);
    const firstForecastIndex = timelineQuarters.findIndex((q) => q.isForecast);
    const [activeQuarterIndex, setActiveQuarterIndex] = useState(() =>
        firstForecastIndex !== -1 ? firstForecastIndex : timelineQuarters.length - 1
    );
    // A new run can move where the forecast starts; open on its first quarter.
    useEffect(() => {
        if (firstForecastIndex !== -1) setActiveQuarterIndex(firstForecastIndex);
    }, [firstForecastIndex]);
    const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
    const activeQuarter = timelineQuarters[activeQuarterIndex] || timelineQuarters[timelineQuarters.length - 1];

    // Recorded filings for the active quarter. A forecast quarter has none —
    // its numbers live in forecastDemand.
    const activeHistoricalPins = useMemo(() => {
        if (!activeQuarter || activeQuarter.isForecast) return [];
        const start = new Date(activeQuarter.year, (activeQuarter.quarter - 1) * 3, 1);
        const end = new Date(activeQuarter.year, activeQuarter.quarter * 3, 0, 23, 59, 59, 999);
        return (urbanGrowthData?.historicalPins?.[activeQuarter.year] ?? []).filter((p) => {
            const d = p?.created_at ? new Date(p.created_at) : null;
            return d && !isNaN(d.getTime()) && d >= start && d <= end;
        });
    }, [urbanGrowthData, activeQuarter]);

    const quarterSeries = useMemo(() => {
        const recorded = {};
        Object.values(urbanGrowthData?.historicalPins || {}).flat().forEach((p) => {
            const d = p?.created_at ? new Date(p.created_at) : null;
            if (!d || isNaN(d.getTime())) return;
            (recorded[`${d.getFullYear()}-${Math.floor(d.getMonth() / 3) + 1}`] ||= []).push(p);
        });
        return timelineQuarters.map((q) => {
            const key = `${q.year}-${q.quarter}`;
            if (q.isForecast) {
                // null total = nothing to show for this quarter yet, which the
                // timeline draws as an empty bar rather than a zero.
                const byBgy = forecastDemand[key];
                const total = byBgy ? Object.values(byBgy).reduce((sum, n) => sum + n, 0) : null;
                return { ...q, total, byBgy: byBgy || {} };
            }
            const byBgy = {};
            (recorded[key] || []).forEach((p) => {
                const b = (p.barangay || "").trim().toLowerCase();
                if (b) byBgy[b] = (byBgy[b] || 0) + 1;
            });
            return { ...q, total: (recorded[key] || []).length, byBgy };
        });
    }, [urbanGrowthData, timelineQuarters, forecastDemand]);

    // The model's own validation figures, or nothing. There is no stand-in:
    // a fixed MAE/WMAPE here read as accuracy no model had measured.
    const forecastMetrics = useMemo(() => {
        const m = customForecastData?.metrics;
        if (!m) return null;
        const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
        return {
            mae: num(m.validation_mae),
            wmape: num(m.validation_wmape),
            r2: num(m.validation_r2),
        };
    }, [customForecastData]);

    // The "what to prepare for" summary the forecast brief shows on a forecast quarter.
    const forecastWatch = useForecastWatchlist({
        forecastData: customForecastData,
        activeQuarter,
        series: quarterSeries,
        mae: forecastMetrics?.mae ?? null,
        urbanGrowthData,
    });

    // What the choropleth colours: predicted counts on a forecast quarter,
    // filing counts on a recorded one.
    const demandByBgy = useMemo(() => {
        if (activeQuarter?.isForecast) {
            return forecastDemand[`${activeQuarter.year}-${activeQuarter.quarter}`] || {};
        }
        const counts = {};
        activeHistoricalPins.forEach((p) => {
            const b = (p.barangay || "").trim().toLowerCase();
            if (b) counts[b] = (counts[b] || 0) + 1;
        });
        return counts;
    }, [activeHistoricalPins, activeQuarter, forecastDemand]);

    // ── Diversity timeline ──
    // One step per quarter, each scored over the five years ending that
    // quarter (a rolling five-year window). The latest step is the headline
    // score and the default. Picking a quarter re-scores every barangay on the
    // map and in the panel. Steps whose five years reach back before the first
    // recorded filing are partial and drawn dimmed.
    const mixTimeline = useMemo(() => overallDiversity?.timeline || [], [overallDiversity]);
    const diversitySteps = useMemo(
        () => mixTimeline.map((s) => ({ year: s.year, quarter: s.quarter, label: s.label, from: s.from, to: s.to, quarters: s.quarters, isPartial: s.partial })),
        [mixTimeline]
    );
    const lastStep = diversitySteps.length - 1;
    // The year picker offers one step per year: the last quarter of each
    // year, so the final choice is the latest quarter ("Now").
    const diversityChoices = useMemo(
        () => diversitySteps.flatMap((s, i) => (i === lastStep || diversitySteps[i + 1]?.year !== s.year ? [i] : [])),
        [diversitySteps, lastStep]
    );
    const [diversityStepIndex, setDiversityStepIndex] = useState(() => lastStep);
    const [isDiversityPlaying, setIsDiversityPlaying] = useState(false);
    const stepIndex = Math.min(diversityStepIndex, lastStep);
    const diversityStep = diversitySteps[stepIndex];
    // The latest step is the headline window, which bgyStats already carries
    // (with its plan fallback), so only earlier steps are swapped in.
    const stepData = stepIndex < lastStep ? mixTimeline[stepIndex] : null;

    const diversityStats = useMemo(() => {
        if (!stepData) return bgyStats;
        const out = {};
        Object.entries(bgyStats || {}).forEach(([name, stat]) => {
            const s = stepData.barangays?.[name];
            out[name] = {
                ...stat,
                diversity: s ? s.diversity : null,
                distribution: s?.distribution || [],
                mixRecords: s?.records ?? 0,
                developedHa: s?.developedHa ?? 0,
                mixSource: "records",
            };
        });
        return out;
    }, [bgyStats, stepData]);

    const diversityOverall = useMemo(() => {
        if (!stepData) return overallDiversity;
        const m = stepData.municipal || {};
        return { ...overallDiversity, score: m.diversity, distribution: m.distribution || [], records: m.records ?? 0, developedHa: m.developedHa ?? 0, source: "records" };
    }, [overallDiversity, stepData]);

    // The bars follow the selected barangay, or Rosario when none is picked.
    const diversitySeries = useMemo(() => {
        const name = selectedBgy?.name;
        return mixTimeline.map((s) => {
            const entry = name ? s.barangays?.[name] : s.municipal;
            return { total: entry ? entry.diversity : null, records: entry?.records ?? 0 };
        });
    }, [mixTimeline, selectedBgy]);

    // Every barangay's score per step, for the timeline's mini maps. The last
    // step reads bgyStats, as the big map does.
    const diversityYearScores = useMemo(
        () => mixTimeline.map((s, i) => {
            const out = {};
            if (i === lastStep) Object.entries(bgyStats || {}).forEach(([name, st]) => { out[name] = st.diversity ?? null; });
            else Object.keys(bgyStats || {}).forEach((name) => { out[name] = s.barangays?.[name]?.diversity ?? null; });
            return out;
        }),
        [mixTimeline, bgyStats, lastStep]
    );

    // "Oct 2021 – Sep 2026", and how much of the five years it covers.
    const mixPeriod = (step) => {
        if (!step?.from) return "";
        const m = (d) => new Date(`${d}T00:00:00`).toLocaleDateString("en-PH", { month: "short", year: "numeric" });
        const span = step.isPartial ? ` · ${(step.quarters / 4).toFixed(2).replace(/\.?0+$/, "")} of 5 yrs recorded` : "";
        return `${m(step.from)} – ${m(step.to)}${span}`;
    };

    // ── 3D (diversity only) ──
    const [is3DMode, setIs3DMode] = useState(true);
    const show3D = is3DMode && activeLayer === "diversity";
    const [has3DMounted, setHas3DMounted] = useState(false);
    useEffect(() => {
        if (show3D) setHas3DMounted(true);
    }, [show3D]);
    // Each map reports its own parcels, so the hidden one can't overwrite the
    // visible one's answer.
    const [parcels2D, setParcels2D] = useState(false);
    const [parcels3D, setParcels3D] = useState(false);
    const parcelsVisible = show3D ? parcels3D : parcels2D;

    // ── Applications, scoped the way the map shows them ──
    const applications = Array.isArray(recent) ? recent : [];
    const scopedApps = useMemo(() => {
        const target = (selectedBgy?.name || "").trim().toLowerCase();
        return applications.filter(
            (a) => matchesAppFilters(a, appTypeFilter, "All") && (!target || (a.barangay || "").trim().toLowerCase() === target)
        );
    }, [applications, appTypeFilter, selectedBgy]);

    const statusCounts = useMemo(() => {
        const counts = {};
        const keyByConfig = new Map(Object.entries(STATUS_MARKER_CONFIG).map(([k, v]) => [v, k]));
        scopedApps.forEach((a) => {
            const key = keyByConfig.get(getStatusMarkerConfig(a.status));
            counts[key] = (counts[key] || 0) + 1;
        });
        return counts;
    }, [scopedApps]);

    // What the map shows as markers, and the attribute table lists.
    const visibleApps = useMemo(() => scopedApps.filter((a) => matchesAppFilters(a, null, statusFilter)), [scopedApps, statusFilter]);
    const visibleAppCount = visibleApps.length;

    // The attribute table opens when a barangay is picked and closes when it is
    // cleared; the status-bar button toggles it, listing every barangay when
    // none is picked. The tracking panel shrinks to its content so the map
    // shows through below it.
    const [tableOpen, setTableOpen] = useState(false);
    useEffect(() => {
        setTableOpen(Boolean(selectedBgy?.name));
    }, [selectedBgy?.name]);
    const showTable = activeLayer === "status" && tableOpen;
    const compactPanel = activeLayer === "status";
    // An open application takes the whole tracking panel: it gets the full map
    // height and the table narrows beside it instead of pushing it to scroll.
    const showAppDetails = activeLayer === "status" && Boolean(inspectedApp);
    const canvasRef = useRef(null);
    const panelBodyRef = useRef(null);
    const [panelNeedsRoom, setPanelNeedsRoom] = useState(false);
    useLayoutEffect(() => {
        const measure = () => {
            const canvas = canvasRef.current;
            const body = panelBodyRef.current;
            if (!showTable || !panelOpen || !canvas || !body) return setPanelNeedsRoom(false);
            const DOCK_HEADER = 32;
            setPanelNeedsRoom(DOCK_HEADER + body.scrollHeight > canvas.clientHeight - tableHeight - 12);
        };
        measure();
        const observer = new ResizeObserver(measure);
        if (canvasRef.current) observer.observe(canvasRef.current);
        return () => observer.disconnect();
    }, [showTable, panelOpen, tableHeight, inspectedApp, selectedBgy, compactPanel]);
    const mapInsets = {
        right: panelOpen && isDesktop() ? 372 : 0,
        bottom: showTable ? tableHeight : 0,
    };

    const selectedBgyApps = useMemo(() => {
        if (!selectedBgy?.name) return null;
        return {
            total: scopedApps.length,
            pending: scopedApps.filter((a) => getStatusMarkerConfig(a.status) !== STATUS_MARKER_CONFIG.Released && getStatusMarkerConfig(a.status) !== STATUS_MARKER_CONFIG.Denied).length,
        };
    }, [selectedBgy, scopedApps]);

    // ── Actions ──
    const selectBarangay = useCallback((name) => {
        if (!name) return;
        setSelectedBgy({ name, data: bgyStats?.[name] || {} });
        setPanelOpen(true);
    }, [bgyStats]);

    const handleLocateApp = useCallback((app) => {
        if (!app) return;
        setInspectedApp(app);
        setPanelOpen(true);
        setFlyToTarget({ coords: getAppCoordinates(app), zoom: 17, timestamp: Date.now() });
    }, []);

    // The open application closes when it stops being in view: zooming out past
    // the level where markers show, collapsing the table, or de-selecting it.
    const prevZoomRef = useRef(mapZoom);
    useEffect(() => {
        const zoomedOut = mapZoom < prevZoomRef.current;
        prevZoomRef.current = mapZoom;
        if (zoomedOut && mapZoom < PIN_ZOOM) setInspectedApp(null);
    }, [mapZoom]);

    const handleTableSelect = useCallback((app) => {
        if (inspectedApp?.id === app.id) setInspectedApp(null);
        else handleLocateApp(app);
    }, [inspectedApp, handleLocateApp]);

    // An empty-map click first closes the open application, then the barangay.
    const handleMapClick = useCallback(() => {
        if (inspectedApp) setInspectedApp(null);
        else setSelectedBgy(null);
    }, [inspectedApp]);

    const handleInspectApp = useCallback((app) => {
        setInspectedApp(app);
        setPanelOpen(true);
    }, []);

    // A parcel picked from the header search (TCT, Tax Dec or PIN): outline it
    // in its CLUP zone colour, fly to it and open its barangay. The header then
    // asks whether to start an application on it.
    const handleParcelFound = useCallback(({ parcel }) => {
        const lat = parseFloat(parcel?.latitude);
        const lng = parseFloat(parcel?.longitude);
        if (Number.isNaN(lat) || Number.isNaN(lng)) return;
        const bgy = (parcel.barangay || "").trim();
        if (bgy && bgyStats?.[bgy]) selectBarangay(bgy);
        setVerifiedParcel({ lat, lng, geometry: parcel.geometry, zoneInfo: getZoneInfo(parcel.clup_zone_code || parcel.land_use_class) });
        setFlyToTarget({ coords: [lat, lng], zoom: 18, timestamp: Date.now() });
    }, [selectBarangay, bgyStats]);

    const handleAppTypeChange = (type) => {
        setAppTypeFilter(type);
        router.get(
            window.location.pathname,
            { application_type: type },
            { preserveState: true, preserveScroll: true, only: ["total", "thisMonth", "statusMap", "bgyStats", "recent"] }
        );
    };

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
        else document.exitFullscreen().catch(() => {});
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
        const id = setInterval(tick, 30000);
        return () => clearInterval(id);
    }, []);

    // Changing module starts from a clean slate.
    useEffect(() => {
        if (activeLayer !== "diversity") setDiversityBandFilter("all");
        if (activeLayer !== "trends") setIsTimelinePlaying(false);
        if (activeLayer !== "diversity") setIsDiversityPlaying(false);
        if (activeLayer !== "status") setInspectedApp(null);
        const carried = carryBgyRef.current;
        carryBgyRef.current = null;
        setSelectedBgy(carried ? { name: carried, data: bgyStats?.[carried] || {} } : null);
        setHoveredBgy(null);
        setParcels2D(false);
        setParcels3D(false);
    }, [activeLayer]);

    useEffect(() => {
        if (!isTimelinePlaying || activeLayer !== "trends" || timelineQuarters.length <= 1) return;
        const id = setInterval(() => {
            setActiveQuarterIndex((i) => (i >= timelineQuarters.length - 1 ? 0 : i + 1));
        }, 1400);
        return () => clearInterval(id);
    }, [isTimelinePlaying, activeLayer, timelineQuarters.length]);

    useEffect(() => {
        if (!isDiversityPlaying || activeLayer !== "diversity" || diversityChoices.length <= 1) return;
        const id = setInterval(() => {
            setDiversityStepIndex((i) => diversityChoices.find((c) => c > i) ?? diversityChoices[0]);
        }, 1400);
        return () => clearInterval(id);
    }, [isDiversityPlaying, activeLayer, diversityChoices]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
            const key = e.key.toLowerCase();
            if (key === "1") setActiveLayer("status");
            else if (key === "2") setActiveLayer("trends");
            else if (key === "3") setActiveLayer("diversity");
            else if (key === "4") setShowClup((v) => !v);
            else if (key === "i") setPanelOpen((v) => !v);
            else if (key === "f") toggleFullscreen();
            else if (e.key === "Escape" && !sidebarOpen) {
                if (inspectedApp) setInspectedApp(null);
                else setSelectedBgy(null);
            } else return;
            e.preventDefault();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [sidebarOpen, inspectedApp]);

    const handleLogout = confirmSignOut;

    // Barangay figures as the active module shows them: the diversity index
    // reads the period picked on its timeline.
    const mapStats = activeLayer === "diversity" ? diversityStats : bgyStats;

    // ── What the canvas is showing, in words ──
    const moduleInfo = MODULES.find((m) => m.id === activeLayer);
    const quarterCount = activeQuarter?.isForecast
        ? Object.values(demandByBgy).reduce((sum, n) => sum + n, 0)
        : activeHistoricalPins.length;
    const mapSubtitle = activeLayer === "status"
        ? `${appTypeFilter === "All" ? "All permit types" : appTypeFilter} · ${visibleAppCount} application${visibleAppCount === 1 ? "" : "s"}${statusFilter !== "All" ? ` · ${STATUS_MARKER_CONFIG[statusFilter]?.label}` : ""}`
        : activeLayer === "trends"
            ? quarterCount
                ? `${activeQuarter?.label} · ${quarterCount} LC ${activeQuarter?.isForecast ? "projected" : "filed"}`
                : `${activeQuarter?.label} · no LC ${activeQuarter?.isForecast ? "forecast available" : "records"} for this quarter`
            : `5 years to ${diversityStep?.label}${diversityStep?.isPartial ? " (partial)" : ""} · mix 0 to 1${show3D ? " · 3D" : ""}`;
    const statusSummary = activeLayer === "status"
        ? `${visibleAppCount} application${visibleAppCount === 1 ? "" : "s"}`
        : activeLayer === "trends"
            ? `${quarterCount} LC · ${activeQuarter?.label}`
            : `${Object.keys(bgyStats || {}).length} barangays · ${mixPeriod(diversityStep)}`;

    const scaleLat = cursor?.lat ?? 13.845;

    // One readout for whatever barangay is under the cursor (or hovered in a list).
    const hoverText = useMemo(() => {
        if (activeLayer === "status" && hoveredAppId != null) {
            const app = applications.find((a) => a.id === hoveredAppId);
            if (app) return `${app.applicant_name || "Applicant"} · ${getStatusMarkerConfig(app.status).label} · ${app.barangay || ""}`;
        }
        if (!hoveredBgy) return "";
        const stat = mapStats?.[hoveredBgy] || {};
        if (activeLayer === "trends") {
            const key = hoveredBgy.trim().toLowerCase();
            const n = demandByBgy[key] || 0;
            return `${hoveredBgy}: ${n} LC ${activeQuarter?.isForecast ? "projected" : "filed"}, ${activeQuarter?.label}`;
        }
        if (activeLayer === "diversity") {
            const lens = getLens(diversityLens);
            const v = lens.getValue(stat);
            return `${hoveredBgy}: ${lens.format(v)} · ${lens.getBand(v).classification}`;
        }
        const n = stat.Total ?? 0;
        return `${hoveredBgy}: ${n} application${n === 1 ? "" : "s"}${stat.Primary_Zone ? ` · ${stat.Primary_Zone}` : ""}`;
    }, [hoveredBgy, hoveredAppId, applications, mapStats, activeLayer, demandByBgy, activeQuarter, diversityLens]);

    return (
        <>
            <Head title="Maps | iMAPS" />
            <style>{`
                #dashboard-root { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
                #dashboard-root .font-mono { font-family: 'JetBrains Mono', monospace !important; }
                #dashboard-root ::-webkit-scrollbar { width: 8px; height: 8px; }
                #dashboard-root ::-webkit-scrollbar-thumb { background: #c3c9d2; border-radius: 4px; border: 2px solid transparent; background-clip: padding-box; }
                #dashboard-root ::-webkit-scrollbar-track { background: transparent; }
            `}</style>

            <div id="dashboard-root" className="h-screen flex flex-col overflow-hidden bg-[#e3e6eb] text-slate-800">
                <Header
                    userName={userName}
                    userRole={userRole}
                    clock={clock}
                    onLogout={handleLogout}
                    sidebarOpen={sidebarOpen}
                    setSidebarOpen={setSidebarOpen}
                    onSelectLocation={(loc) => selectBarangay(loc?.label)}
                    onSelectParcel={handleParcelFound}
                />

                <div className="flex-1 relative overflow-hidden">
                    <Sidebar
                        userName={userName}
                        userRole={userRole}
                        sidebarOpen={sidebarOpen}
                        setSidebarOpen={setSidebarOpen}
                        onLogout={handleLogout}
                        activePage="maps"
                    />
                    {sidebarOpen && (
                        <div onClick={() => setSidebarOpen(false)} className="absolute inset-0 bg-slate-950/20 z-[750]" aria-hidden="true" />
                    )}

                    <div className="absolute inset-0 flex flex-col">
                        {/* ── Map toolbar ── */}
                        <div className="shrink-0 flex items-center gap-0.5 h-10 px-2 bg-[#f1f3f6] border-b border-slate-300" role="toolbar" aria-label="Map tools">
                            <ToolButton icon="layers" label="Layers panel" pressed={layersOpen} onClick={() => setLayersOpen((v) => !v)} />
                            <Divider />
                            <ToolButton icon="zoomIn" label="Zoom in" disabled={show3D} onClick={() => setMapZoom((z) => Math.min(19, z + 1))} />
                            <ToolButton icon="zoomOut" label="Zoom out" disabled={show3D} onClick={() => setMapZoom((z) => Math.max(11, z - 1))} />
                            <ToolButton icon="extent" label="Zoom to Rosario" disabled={show3D} onClick={() => { setSelectedBgy(null); setResetTrigger((t) => t + 1); }} />
                            <Divider />
                            <div className="flex border border-slate-300 rounded-[3px] overflow-hidden" role="group" aria-label="Map view">
                                {["2D", "3D"].map((v) => {
                                    const on = (v === "3D") === show3D;
                                    const disabled = v === "3D" && activeLayer !== "diversity";
                                    return (
                                        <button
                                            key={v}
                                            type="button"
                                            aria-pressed={on}
                                            disabled={disabled}
                                            title={disabled ? "3D is available in the Diversity Index" : `${v} view`}
                                            onClick={() => setIs3DMode(v === "3D")}
                                            className={`h-7 px-2.5 text-[11.5px] font-semibold cursor-pointer disabled:cursor-not-allowed disabled:text-slate-400 ${v === "3D" ? "border-l border-slate-300" : ""} ${
                                                on ? "bg-[#0b2a5b] text-white" : "bg-white text-slate-700 hover:bg-slate-50"
                                            }`}
                                        >
                                            {v}
                                        </button>
                                    );
                                })}
                            </div>

                            <span className="ml-auto" />
                            <ToolButton icon="panel" label="Identify and analysis panel" pressed={panelOpen} onClick={() => setPanelOpen((v) => !v)} />
                            <ToolButton icon="fullscreen" label="Fullscreen" onClick={toggleFullscreen} />
                        </div>

                        <div className="flex-1 min-h-0 flex relative">
                            {/* ── Layers dock ── */}
                            {layersOpen && (
                                <aside className="absolute lg:relative inset-y-0 left-0 z-[620] w-[272px] shrink-0 flex flex-col bg-[#f5f6f8] border-r border-slate-300 shadow-xl lg:shadow-none" aria-label="Layers">
                                    <DockHeader title="Layers" onClose={() => setLayersOpen(false)} closeLabel="Close layers panel" />
                                    <div className="flex-1 min-h-0">
                                        <LayersPanel
                                            activeLayer={activeLayer}
                                            onSelectLayer={setActiveLayer}
                                            appTypeFilter={appTypeFilter}
                                            onAppTypeChange={handleAppTypeChange}
                                            statusFilter={statusFilter}
                                            onStatusFilterChange={setStatusFilter}
                                            statusCounts={statusCounts}
                                            activeQuarter={activeQuarter}
                                            demandByBgy={demandByBgy}
                                            hoveredBgy={hoveredBgy}
                                            diversityBandFilter={diversityBandFilter}
                                            onSelectBand={setDiversityBandFilter}
                                            bgyStats={mapStats}
                                            parcelsVisible={parcelsVisible}
                                            showClup={showClup}
                                            onToggleClup={setShowClup}
                                            clupOpacity={clupOpacity}
                                            onClupOpacity={setClupOpacity}
                                            showLabels={showLabels}
                                            onToggleLabels={setShowLabels}
                                            mapStyle={mapStyle}
                                            onMapStyle={setMapStyle}
                                        />
                                    </div>
                                </aside>
                            )}

                            {/* ── Map canvas ── */}
                            <main className="flex-1 min-w-0 flex flex-col">
                                <div ref={canvasRef} className="flex-1 min-h-0 relative">
                                    {/* Both maps stay mounted once created and are hidden with
                                        `visibility`, so neither is rebuilt on a 2D/3D switch. */}
                                    <div className="absolute inset-0" style={{ visibility: show3D ? "hidden" : "visible" }} aria-hidden={show3D}>
                                        <LeafletMap
                                            bgyStats={mapStats}
                                            applications={applications}
                                            currentLayer={activeLayer}
                                            mapStyle={mapStyle}
                                            appTypeFilter={appTypeFilter}
                                            statusFilter={statusFilter}
                                            selectedAppId={inspectedApp?.id ?? null}
                                            hoveredAppId={hoveredAppId}
                                            selectedBgy={selectedBgy}
                                            flyToTarget={flyToTarget}
                                            verifiedParcel={verifiedParcel}
                                            mapZoom={mapZoom}
                                            onZoomChange={setMapZoom}
                                            showClup={showClup}
                                            clupOpacity={clupOpacity}
                                            showLabels={showLabels}
                                            resetTrigger={resetTrigger}
                                            diversityLens={diversityLens}
                                            diversityBandFilter={diversityBandFilter}
                                            hoveredBgy={hoveredBgy}
                                            onHoverBgy={setHoveredBgy}
                                            onParcelsVisible={setParcels2D}
                                            onCursorMove={setCursor}
                                            onHoverApp={setHoveredAppId}
                                            onInspectApp={handleInspectApp}
                                            insets={mapInsets}
                                            demandCounts={demandByBgy}
                                            onFeatureClick={(name) => selectBarangay(name)}
                                            onMapClick={handleMapClick}
                                        />
                                    </div>

                                    {has3DMounted && (
                                        <div className="absolute inset-0" style={{ visibility: show3D ? "visible" : "hidden" }} aria-hidden={!show3D}>
                                            <Suspense fallback={<MapSkeleton visible label="Loading 3D view…" tone="#e9ecf0" />}>
                                                <MapLibre3DView
                                                    active={show3D}
                                                    selectedBgy={selectedBgy}
                                                    onFeatureClick={(name) => selectBarangay(name)}
                                                    onMapClick={handleMapClick}
                                                    bgyStats={diversityStats}
                                                    rightPanelOpen={panelOpen}
                                                    panelWidth={372}
                                                    bandFilter={diversityBandFilter}
                                                    hoveredBgy={hoveredBgy}
                                                    onHoverBgy={setHoveredBgy}
                                                    onParcelsVisible={setParcels3D}
                                                />
                                            </Suspense>
                                        </div>
                                    )}

                                    {/* Map title, like a print layout's. It also reads out whatever is
                                        under the cursor, so nothing floats over the data itself.
                                        On LC demand the forecast brief below takes its place, except
                                        on phones, where the brief would cover the map. */}
                                    <div className={`absolute top-3 left-3 z-[500] ${activeLayer === "trends" ? "sm:hidden" : ""} bg-white/95 border border-slate-300 rounded-[3px] shadow-sm w-[300px] max-w-[calc(100%-1.5rem)]`}>
                                        <div className="px-3 py-1.5">
                                            <div className="text-[13px] font-semibold text-slate-900 leading-tight truncate">{moduleInfo?.label}</div>
                                            <div className="text-[11px] text-slate-600 leading-tight truncate">{mapSubtitle}</div>
                                        </div>
                                        {selectedBgy?.name && (
                                            <div className="flex items-center gap-2 px-3 py-1 border-t border-slate-200 bg-[#eaf0f8]">
                                                <span className="text-[11.5px] text-[#0b2a5b] truncate"><b>{selectedBgy.name}</b> selected</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedBgy(null)}
                                                    className="ml-auto text-[11px] font-semibold text-[#0b2a5b] hover:underline cursor-pointer shrink-0"
                                                >
                                                    Clear
                                                </button>
                                            </div>
                                        )}
                                        <div className="px-3 py-1 border-t border-slate-200 text-[11px] leading-tight truncate text-slate-600" aria-live="polite">
                                            {hoverText || (show3D ? "Drag to orbit · click a barangay to open it" : "Hover a barangay · click to open it")}
                                        </div>
                                    </div>

                                    {/* LC demand brief, over the empty west of the map beside the
                                        Layers panel. Only the cards take clicks; the space below
                                        them still pans the map. */}
                                    {activeLayer === "trends" && (
                                        <div className="hidden sm:flex absolute top-3 left-3 bottom-10 z-[500] w-[272px] flex-col pointer-events-none">
                                            <div className="pointer-events-auto min-h-0 flex flex-col">
                                                <ForecastBrief
                                                    quarter={activeQuarter}
                                                    count={quarterCount}
                                                    demandByBgy={demandByBgy}
                                                    hoveredBgy={hoveredBgy}
                                                    selectedName={selectedBgy?.name || null}
                                                    onClearSelection={() => setSelectedBgy(null)}
                                                    watch={forecastWatch}
                                                    onSelectBgy={selectBarangay}
                                                    onHoverBgy={setHoveredBgy}
                                                    onSelectQuarter={(q) => {
                                                        const i = timelineQuarters.findIndex((t) => t.year === q.year && t.quarter === q.quarter);
                                                        if (i === -1) return;
                                                        setActiveQuarterIndex(i);
                                                        setIsTimelinePlaying(false);
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Attribute table for the selected barangay, floating over the
                                        bottom of the map so the canvas keeps its full size. */}
                                    {showTable && (
                                        <div className={`absolute bottom-0 left-0 z-[610] ${panelOpen && panelNeedsRoom ? "right-0 sm:right-[372px]" : "right-0"}`}>
                                            <AttributeTable
                                                title={`applications · ${selectedBgy?.name || "All barangays"}`}
                                                apps={visibleApps}
                                                total={scopedApps.length}
                                                selectedAppId={inspectedApp?.id ?? null}
                                                onSelect={handleTableSelect}
                                                onHover={setHoveredAppId}
                                                onZoomToSelected={() => inspectedApp && handleLocateApp(inspectedApp)}
                                                onHeightChange={setTableHeight}
                                                onCollapse={() => setInspectedApp(null)}
                                            />
                                        </div>
                                    )}

                                    {/* ── Identify & analysis dock ── */}
                                    {panelOpen && (
                                        <aside
                                            className={`absolute top-0 right-0 z-[620] w-full sm:w-[372px] flex flex-col bg-white border-l border-slate-300 shadow-[-6px_0_16px_rgba(15,23,42,0.10)] ${
                                                compactPanel ? "border-b rounded-bl-md" : "bottom-0"
                                            }`}
                                            style={compactPanel ? { maxHeight: panelNeedsRoom || !showTable ? "100%" : `calc(100% - ${tableHeight + 12}px)` } : undefined}
                                            aria-label="Identify and analysis"
                                        >
                                            <DockHeader title={moduleInfo?.label} onClose={() => setPanelOpen(false)} closeLabel="Close analysis panel" />
                                            <div ref={panelBodyRef} className={compactPanel ? "min-h-0 flex flex-col overflow-y-auto" : "flex-1 min-h-0 flex flex-col"}>
                                                {showAppDetails && (
                                                    <ApplicationDetails
                                                        app={inspectedApp}
                                                        barangayZone={bgyStats?.[(inspectedApp.barangay || "").trim()]?.Primary_Zone}
                                                        onClose={() => setInspectedApp(null)}
                                                    />
                                                )}

                                                {selectedBgy?.name && !showAppDetails && (
                                                    <BarangayCard
                                                        name={selectedBgy.name}
                                                        stat={mapStats?.[selectedBgy.name] || selectedBgy.data || {}}
                                                        apps={selectedBgyApps || {}}
                                                        demand={demandByBgy[selectedBgy.name.trim().toLowerCase()] || 0}
                                                        activeQuarter={activeQuarter}
                                                        activeLayer={activeLayer}
                                                        onSwitch={(id) => {
                                                            if (id === activeLayer) return;
                                                            carryBgyRef.current = selectedBgy.name;
                                                            setActiveLayer(id);
                                                        }}
                                                        onClose={() => setSelectedBgy(null)}
                                                    />
                                                )}

                                                {activeLayer === "status" && !showAppDetails && !selectedBgy?.name && (
                                                    <StatusPanel
                                                        recent={applications.filter((a) => matchesAppFilters(a, appTypeFilter, "All"))}
                                                        selectedBgy={selectedBgy}
                                                    />
                                                )}

                                                {activeLayer === "trends" && (
                                                    <TrendsPanel
                                                        activeQuarter={activeQuarter}
                                                        forecastMetrics={forecastMetrics}
                                                        forecastData={customForecastData}
                                                        forecastOutdated={forecastOutdated}
                                                        urbanGrowthData={urbanGrowthData}
                                                        selectedBgy={selectedBgy}
                                                        onSelectBgy={selectBarangay}
                                                        onHoverBgy={setHoveredBgy}
                                                        onForecastGenerated={handleForecastGenerated}
                                                        activePins={activeHistoricalPins}
                                                        series={quarterSeries}
                                                        activeIndex={activeQuarterIndex}
                                                        onSelectQuarter={setActiveQuarterIndex}
                                                    />
                                                )}

                                                {activeLayer === "diversity" && (
                                                    <div className="flex-1 min-h-0 flex flex-col">
                                                        <DiversityPanel
                                                            overallDiversity={diversityOverall}
                                                            period={diversityStep}
                                                            selectedBgy={selectedBgy}
                                                            onSelectBgy={selectBarangay}
                                                            bgyStats={diversityStats}
                                                            lens={diversityLens}
                                                            bandFilter={diversityBandFilter}
                                                            onSelectBand={setDiversityBandFilter}
                                                            hoveredBgy={hoveredBgy}
                                                            onHoverBgy={setHoveredBgy}
                                                        />
                                                    </div>
                                                )}

                                            </div>
                                        </aside>
                                    )}
                                </div>

                                {activeLayer === "trends" && (
                                    <TimelineBar
                                        quarters={timelineQuarters}
                                        index={activeQuarterIndex}
                                        onIndex={(i) => {
                                            setActiveQuarterIndex(i);
                                            setIsTimelinePlaying(false);
                                        }}
                                        playing={isTimelinePlaying}
                                        onTogglePlay={() => setIsTimelinePlaying((p) => !p)}
                                        count={quarterCount}
                                        series={quarterSeries}
                                    />
                                )}

                                {activeLayer === "diversity" && diversitySteps.length > 1 && (
                                    <DiversityTimeline
                                        steps={diversitySteps}
                                        series={diversitySeries}
                                        yearScores={diversityYearScores}
                                        choices={diversityChoices}
                                        index={stepIndex}
                                        onIndex={(i) => {
                                            setDiversityStepIndex(i);
                                            setIsDiversityPlaying(false);
                                        }}
                                        playing={isDiversityPlaying}
                                        onTogglePlay={() => setIsDiversityPlaying((p) => !p)}
                                        who={selectedBgy?.name || "Rosario"}
                                        selectedName={selectedBgy?.name || null}
                                        planScore={selectedBgy ? bgyStats?.[selectedBgy.name]?.clupTargetDiversity : overallDiversity?.planScore}
                                        bandFor={(total) => getLens(diversityLens).getBand(total)}
                                    />
                                )}
                            </main>

                        </div>

                        {/* ── Status bar ── */}
                        <div className="shrink-0 flex items-center h-6 px-2 bg-[#f1f3f6] border-t border-slate-300 text-[11px] text-slate-600 tabular-nums overflow-hidden" aria-live="off">
                            <span className="w-[210px] shrink-0 truncate" title="Cursor position">
                                {cursor && !show3D ? `${cursor.lat.toFixed(5)}° N, ${cursor.lng.toFixed(5)}° E` : "—"}
                            </span>
                            <span className="px-3 border-l border-slate-300 hidden sm:block">Scale 1:{mapScale(scaleLat, mapZoom).toLocaleString("en-PH")}</span>
                            <span className="px-3 border-l border-slate-300 hidden sm:block">Zoom {mapZoom}</span>
                            <span className="px-3 border-l border-slate-300 hidden md:block">EPSG:4326</span>
                            <div className="ml-auto min-w-0 flex items-center gap-1.5 pl-3 border-l border-slate-300">
                            {activeLayer === "status" && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        // Closing the table closes the application it had open, as collapsing it does.
                                        if (tableOpen) setInspectedApp(null);
                                        setTableOpen(!tableOpen);
                                    }}
                                    aria-pressed={tableOpen}
                                    aria-label="Attribute table"
                                    title={`${tableOpen ? "Close" : "Open"} attribute table · ${selectedBgy?.name || "All barangays"}`}
                                    className={`w-5 h-5 shrink-0 flex items-center justify-center rounded-[3px] border cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0b2a5b] ${
                                        tableOpen ? "bg-[#dce6f3] border-[#9fb4d3] text-[#0b2a5b]" : "border-transparent text-slate-600 hover:bg-white hover:border-slate-300"
                                    }`}
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.table} />
                                    </svg>
                                </button>
                            )}
                            <span className="truncate">{statusSummary}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export default function Maps(props) {
    return (
        <MapsErrorBoundary>
            <MapsInner {...props} />
        </MapsErrorBoundary>
    );
}
