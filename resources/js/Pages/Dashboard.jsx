import { Component, useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, lazy, Suspense } from "react";
import { Head, router } from "@inertiajs/react";
import Swal from "sweetalert2";
import { performLogout } from "@/utils/auth";
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
import DiversityPanel from "@/Components/MapLayers/DiversityPanel";
import LeafletMap, { getAppCoordinates, PIN_ZOOM } from "@/Components/Dashboard/LeafletMap";
import LayersPanel, { MODULES } from "@/Components/Dashboard/LayersPanel";
import TimelineBar from "@/Components/Dashboard/TimelineBar";
import AttributeTable from "@/Components/Dashboard/AttributeTable";
import MapSkeleton from "@/Components/Dashboard/MapSkeleton";
import { ApplicationDetails, BarangayCard } from "@/Components/Dashboard/IdentifyCards";
import { getLens } from "@/utils/diversityTheme";
import { getZoneInfo } from "@/utils/clupZones";


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
                    <h2 style={{ fontSize: "1.5rem", fontWeight: "bold" }}>Dashboard component crashed!</h2>
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

// Quarters the LC timeline can scrub through: 2021 Q1 up to the current
// quarter (recorded), then the next two quarters (forecast).
function buildTimelineQuarters(urbanGrowthData) {
    const quarters = [];
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

    for (let y = 2021; y <= currentYear; y++) {
        for (let q = 1; q <= 4; q++) {
            if (y === currentYear && q > currentQuarter) break;
            quarters.push({ year: y, quarter: q, label: `Q${q} '${String(y).slice(-2)}`, isForecast: false });
        }
    }

    let fy = currentYear;
    let fq = currentQuarter;
    for (let i = 0; i < 2; i++) {
        fq++;
        if (fq > 4) { fq = 1; fy++; }
        quarters.push({ year: fy, quarter: fq, label: `Q${fq} '${String(fy).slice(-2)}`, isForecast: true });
    }
    return quarters;
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

function DashboardInner({ userName, userRole, bgyStats, recent, filters, overallDiversity, urbanGrowthData }) {
    const [activeLayer, setActiveLayer] = useState("status");
    const [mapStyle, setMapStyle] = useState("light");
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
    const timelineQuarters = useMemo(() => buildTimelineQuarters(urbanGrowthData), [urbanGrowthData]);
    const [activeQuarterIndex, setActiveQuarterIndex] = useState(() => {
        const idx = timelineQuarters.findIndex((q) => q.isForecast);
        return idx !== -1 ? idx : timelineQuarters.length - 1;
    });
    const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
    const activeQuarter = timelineQuarters[activeQuarterIndex] || timelineQuarters[timelineQuarters.length - 1];

    const [apiQuarterData, setApiQuarterData] = useState({ pins: [], metrics: null });
    const [forecastQuarterMap, setForecastQuarterMap] = useState({});
    const [quarterLoading, setQuarterLoading] = useState(false);
    const [customForecastData, setCustomForecastData] = useState(() => {
        try {
            const saved = localStorage.getItem("imaps_forecast_data");
            if (saved) return JSON.parse(saved);
        } catch (e) {}
        return null;
    });

    const handleForecastGenerated = (data) => {
        if (!data) return;
        setCustomForecastData(data);
        try {
            localStorage.setItem("imaps_forecast_data", JSON.stringify(data));
        } catch (e) {}
    };

    // Pre-fetch all forecast quarters so every forecast quarter in the timeline displays filled bars
    useEffect(() => {
        const forecastQuarters = timelineQuarters.filter((q) => q.isForecast);
        forecastQuarters.forEach((q) => {
            const key = `${q.year}-${q.quarter}`;
            if (!forecastQuarterMap[key]) {
                fetch(`/api/forecast/${q.year}/${q.quarter}`)
                    .then((res) => res.json())
                    .then((res) => {
                        if (res.status === "success" && Array.isArray(res.data?.pins)) {
                            setForecastQuarterMap((prev) => ({ ...prev, [key]: res.data.pins }));
                        }
                    })
                    .catch(() => {});
            }
        });
    }, [timelineQuarters]);

    useEffect(() => {
        if (!activeQuarter) return;
        let cancelled = false;
        setQuarterLoading(true);
        fetch(`/api/forecast/${activeQuarter.year}/${activeQuarter.quarter}`)
            .then((res) => res.json())
            .then((res) => {
                if (!cancelled && res.status === "success") {
                    setApiQuarterData(res.data);
                    setForecastQuarterMap((prev) => ({
                        ...prev,
                        [`${activeQuarter.year}-${activeQuarter.quarter}`]: res.data?.pins || [],
                    }));
                }
            })
            .catch((err) => {
                console.error("Forecast API error", err);
                if (!cancelled) setApiQuarterData({ pins: [], metrics: null });
            })
            .finally(() => {
                if (!cancelled) setQuarterLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [activeQuarter]);

    const activeHistoricalPins = useMemo(() => {
        if (!activeQuarter) return [];
        if (activeQuarter.isForecast) {
            const custom = customForecastData?.pins;
            if (Array.isArray(custom) && custom.length > 0) {
                const qPins = custom.filter((p) => Number(p.year) === Number(activeQuarter.year) && Number(p.quarter) === Number(activeQuarter.quarter));
                if (qPins.length > 0) return qPins;
            }
            const mapped = forecastQuarterMap[`${activeQuarter.year}-${activeQuarter.quarter}`];
            if (Array.isArray(mapped) && mapped.length > 0) return mapped;
            return apiQuarterData.pins || [];
        }
        const start = new Date(activeQuarter.year, (activeQuarter.quarter - 1) * 3, 1);
        const end = new Date(activeQuarter.year, activeQuarter.quarter * 3, 0, 23, 59, 59, 999);
        return (urbanGrowthData?.historicalPins?.[activeQuarter.year] ?? []).filter((p) => {
            const d = p?.created_at ? new Date(p.created_at) : null;
            return d && !isNaN(d.getTime()) && d >= start && d <= end;
        });
    }, [urbanGrowthData, activeQuarter, apiQuarterData, customForecastData, forecastQuarterMap]);

    const quarterSeries = useMemo(() => {
        const recorded = {};
        Object.values(urbanGrowthData?.historicalPins || {}).flat().forEach((p) => {
            const d = p?.created_at ? new Date(p.created_at) : null;
            if (!d || isNaN(d.getTime())) return;
            (recorded[`${d.getFullYear()}-${Math.floor(d.getMonth() / 3) + 1}`] ||= []).push(p);
        });
        const custom = Array.isArray(customForecastData?.pins) ? customForecastData.pins : [];
        return timelineQuarters.map((q, i) => {
            let pins = recorded[`${q.year}-${q.quarter}`] || [];
            if (q.isForecast) {
                const own = custom.filter((p) => Number(p.year) === Number(q.year) && Number(p.quarter) === Number(q.quarter));
                const mapped = forecastQuarterMap[`${q.year}-${q.quarter}`];
                pins = own.length > 0 ? own : (mapped && mapped.length > 0 ? mapped : (i === activeQuarterIndex ? activeHistoricalPins : null));
            }
            const byBgy = {};
            (pins || []).forEach((p) => {
                const b = (p.barangay || "").trim().toLowerCase();
                if (b) byBgy[b] = (byBgy[b] || 0) + 1;
            });
            return { ...q, total: pins ? pins.length : null, byBgy };
        });
    }, [urbanGrowthData, customForecastData, timelineQuarters, activeQuarterIndex, activeHistoricalPins, forecastQuarterMap]);

    const forecastMetrics = useMemo(() => {
        if (customForecastData?.metrics) {
            const m = customForecastData.metrics;
            return { mae: Number(m.validation_mae ?? m.mae ?? 2.155), wmape: Number(m.validation_wmape ?? m.wmape ?? 0.302) };
        }
        return apiQuarterData.metrics || { mae: 2.155, wmape: 0.302 };
    }, [customForecastData, apiQuarterData]);

    const demandByBgy = useMemo(() => {
        const counts = {};
        activeHistoricalPins.forEach((p) => {
            const b = (p.barangay || "").trim().toLowerCase();
            if (b) counts[b] = (counts[b] || 0) + 1;
        });
        return counts;
    }, [activeHistoricalPins]);

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

    // The attribute table appears once a barangay is picked; the tracking panel
    // shrinks to its content so the map shows through below it.
    const showTable = activeLayer === "status" && Boolean(selectedBgy?.name);
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
        const hasShownWelcome = sessionStorage.getItem("hasShownWelcome");
        if (!hasShownWelcome && userName) {
            Swal.fire({
                toast: true,
                position: "top-end",
                icon: "success",
                title: `Welcome back, ${userName || "Staff"}!`,
                showConfirmButton: false,
                timer: 2500,
                customClass: { popup: "swal-small-toast" },
            });
            sessionStorage.setItem("hasShownWelcome", "true");
        }
    }, [userName]);

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

    const handleLogout = () => {
        Swal.fire({
            title: "Sign out?",
            text: "Are you sure you want to log out of iMAPS?",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Sign out",
            cancelButtonText: "Cancel",
            buttonsStyling: false,
            customClass: {
                popup: "rounded-md border border-slate-200 shadow-xl p-6 bg-white",
                title: "text-lg font-semibold text-slate-900",
                htmlContainer: "text-xs text-slate-500",
                actions: "flex items-center justify-center gap-3 mt-5",
                confirmButton: "inline-flex items-center justify-center px-4 py-2 rounded-[3px] bg-[#0b2a5b] hover:bg-[#0e3574] text-white text-xs font-semibold cursor-pointer",
                cancelButton: "inline-flex items-center justify-center px-4 py-2 rounded-[3px] bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-300 cursor-pointer",
            },
        }).then((r) => {
            if (r.isConfirmed) {
                performLogout();
            }
        });
    };

    // ── What the canvas is showing, in words ──
    const moduleInfo = MODULES.find((m) => m.id === activeLayer);
    const quarterCount = activeHistoricalPins.length;
    const mapSubtitle = activeLayer === "status"
        ? `${appTypeFilter === "All" ? "All permit types" : appTypeFilter} · ${visibleAppCount} application${visibleAppCount === 1 ? "" : "s"}${statusFilter !== "All" ? ` · ${STATUS_MARKER_CONFIG[statusFilter]?.label}` : ""}`
        : activeLayer === "trends"
            ? quarterCount
                ? `${activeQuarter?.label} · ${quarterCount} LC ${activeQuarter?.isForecast ? "projected" : "filed"}`
                : `${activeQuarter?.label} · no LC ${activeQuarter?.isForecast ? "forecast available" : "records"} for this quarter`
            : `Mix score, 0 to 1 · higher is more varied${show3D ? " · 3D" : ""}`;
    const statusSummary = activeLayer === "status"
        ? `${visibleAppCount} application${visibleAppCount === 1 ? "" : "s"}`
        : activeLayer === "trends"
            ? `${quarterCount} LC · ${activeQuarter?.label}`
            : `${Object.keys(bgyStats || {}).length} barangays`;

    const scaleLat = cursor?.lat ?? 13.845;

    // One readout for whatever barangay is under the cursor (or hovered in a list).
    const hoverText = useMemo(() => {
        if (activeLayer === "status" && hoveredAppId != null) {
            const app = applications.find((a) => a.id === hoveredAppId);
            if (app) return `${app.applicant_name || "Applicant"} · ${getStatusMarkerConfig(app.status).label} · ${app.barangay || ""}`;
        }
        if (!hoveredBgy) return "";
        const stat = bgyStats?.[hoveredBgy] || {};
        if (activeLayer === "trends") {
            const n = demandByBgy[hoveredBgy.trim().toLowerCase()] || 0;
            return `${hoveredBgy}: ${n} LC ${activeQuarter?.isForecast ? "projected" : "filed"}, ${activeQuarter?.label}`;
        }
        if (activeLayer === "diversity") {
            const lens = getLens(diversityLens);
            const v = lens.getValue(stat);
            return `${hoveredBgy}: ${lens.format(v)} · ${lens.getBand(v).classification}`;
        }
        const n = stat.Total ?? 0;
        return `${hoveredBgy}: ${n} application${n === 1 ? "" : "s"}${stat.Primary_Zone ? ` · ${stat.Primary_Zone}` : ""}`;
    }, [hoveredBgy, hoveredAppId, applications, bgyStats, activeLayer, demandByBgy, activeQuarter, diversityLens]);

    return (
        <>
            <Head title="Dashboard | iMAPS" />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
                #dashboard-root { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
                #dashboard-root .font-mono { font-family: 'JetBrains Mono', monospace !important; }
                .swal-small-toast { width: auto !important; padding: 0.5rem 0.75rem !important; min-height: unset !important; border-radius: 4px !important; }
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
                        activePage="dashboard"
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
                                            diversityBandFilter={diversityBandFilter}
                                            onSelectBand={setDiversityBandFilter}
                                            bgyStats={bgyStats}
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
                                            bgyStats={bgyStats}
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
                                            historicalPins={activeHistoricalPins}
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
                                                    bgyStats={bgyStats}
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

                                    {activeLayer === "trends" && quarterLoading && (
                                        <div className="absolute top-0 inset-x-0 z-[520] h-0.5 overflow-hidden bg-slate-200" role="progressbar" aria-label="Loading quarter">
                                            <div className="imaps-loading-bar h-full w-1/3 bg-[#fd8d3c]" />
                                        </div>
                                    )}

                                    {/* Map title, like a print layout's. It also reads out whatever is
                                        under the cursor, so nothing floats over the data itself. */}
                                    <div className="absolute top-3 left-3 z-[500] bg-white/95 border border-slate-300 rounded-[3px] shadow-sm w-[300px] max-w-[calc(100%-1.5rem)]">
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

                                    {/* Attribute table for the selected barangay, floating over the
                                        bottom of the map so the canvas keeps its full size. */}
                                    {showTable && (
                                        <div className={`absolute bottom-0 left-0 z-[610] ${panelOpen && panelNeedsRoom ? "right-0 sm:right-[372px]" : "right-0"}`}>
                                            <AttributeTable
                                                title={`applications · ${selectedBgy.name}`}
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
                                                        stat={bgyStats?.[selectedBgy.name] || selectedBgy.data || {}}
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
                                                        urbanGrowthData={urbanGrowthData}
                                                        selectedBgy={selectedBgy}
                                                        onSelectBgy={selectBarangay}
                                                        onHoverBgy={setHoveredBgy}
                                                        onForecastGenerated={handleForecastGenerated}
                                                        activePins={activeHistoricalPins}
                                                        loading={quarterLoading}
                                                        series={quarterSeries}
                                                        activeIndex={activeQuarterIndex}
                                                        onSelectQuarter={setActiveQuarterIndex}
                                                    />
                                                )}

                                                {activeLayer === "diversity" && (
                                                    <div className="flex-1 min-h-0 flex flex-col">
                                                        <DiversityPanel
                                                            overallDiversity={overallDiversity}
                                                            selectedBgy={selectedBgy}
                                                            onSelectBgy={selectBarangay}
                                                            bgyStats={bgyStats}
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
                            <span className="ml-auto pl-3 border-l border-slate-300 truncate">{statusSummary}</span>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export default function Dashboard(props) {
    return (
        <MapsErrorBoundary>
            <DashboardInner {...props} />
        </MapsErrorBoundary>
    );
}
