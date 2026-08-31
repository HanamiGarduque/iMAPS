import React, { useState, useEffect, useRef, useMemo } from "react";
import { Head, router } from "@inertiajs/react";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ── Leaflet Default Pin Fix for React-Leaflet ──
const customMapPin = L.divIcon({
    className: "custom-settings-pin",
    html: `
        <div style="background-color: #2563eb; color: white; padding: 4px 8px; border-radius: 9999px; font-size: 11px; font-weight: 700; border: 2px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.25); display: flex; align-items: center; gap: 4px; white-space: nowrap;">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: #60a5fa; display: inline-block;"></span>
            <span>Default Focus</span>
        </div>
    `,
    iconSize: [110, 28],
    iconAnchor: [55, 14],
});

// Map Controller to dynamically update center and zoom
function LiveMapUpdater({ center, zoom, basemapUrl }) {
    const map = useMap();
    useEffect(() => {
        if (center && Array.isArray(center) && center.length === 2 && !isNaN(center[0]) && !isNaN(center[1])) {
            map.flyTo(center, zoom, { duration: 0.8 });
        }
    }, [center, zoom, map]);
    return null;
}

// ── Basemap Providers Definition ──
const BASEMAP_PROVIDERS = {
    satellite: {
        id: "satellite",
        name: "Satellite Imagery",
        desc: "High-resolution Esri World Imagery with satellite photography",
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
        badge: "Esri World Imagery",
    },
    street: {
        id: "street",
        name: "OpenStreetMap Standard",
        desc: "Vector road networks, thoroughfares, and municipal topography",
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        badge: "OSM Standard",
    },
    topographic: {
        id: "topographic",
        name: "Topographic Terrain",
        desc: "Contour elevations, terrain relief, and geographical features",
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}",
        attribution: "Tiles &copy; Esri &mdash; Source: Esri, Earthstar Geographics, DeLorme, HERE",
        badge: "Esri Hillshade",
    },
};

// ── Quick Location Presets for Rosario, Batangas ──
const ROSARIO_LOCATION_PRESETS = [
    {
        name: "Rosario Municipal Hall (Poblacion)",
        coords: "13.8450, 121.2060",
        lat: 13.8450,
        lng: 121.2060,
        desc: "Government Center & MPDO Planning Office",
    },
    {
        name: "San Carlos Corridor",
        coords: "13.8612, 121.2185",
        lat: 13.8612,
        lng: 121.2185,
        desc: "Agro-Industrial & Commercial Hub",
    },
    {
        name: "Namunga Commercial Sector",
        coords: "13.8390, 121.2150",
        lat: 13.8390,
        lng: 121.2150,
        desc: "Retail strip and mixed-use commercial corridor",
    },
    {
        name: "Pinagsibaan Agri-District",
        coords: "13.8820, 121.2310",
        lat: 13.8820,
        lng: 121.2310,
        desc: "Northern agricultural and agro-industrial zone",
    },
];

// ── Layer Metadata Specifications ──
const LAYER_METADATA = {
    municipal_boundary: {
        title: "Municipal Boundary",
        table: "public.rosario_boundary",
        geometry: "MultiPolygon / Polygon",
        crs: "EPSG:4326 (WGS 84)",
        desc: "Defines the territorial administrative perimeter of the Municipality of Rosario, Batangas.",
        tag: "Municipal Extent",
        color: "blue",
    },
    barangay_boundary: {
        title: "Barangay Boundary",
        table: "public.barangay_boundary",
        geometry: "MultiPolygon",
        crs: "EPSG:4326 (WGS 84)",
        desc: "Sub-administrative polygon units covering all 48 political barangays in Rosario.",
        tag: "48 Barangays",
        color: "emerald",
    },
    land_use_plan: {
        title: "CLUP Land Use Plan",
        table: "public.land_use_plan",
        geometry: "MultiPolygon (Zoning)",
        crs: "EPSG:4326 (WGS 84)",
        desc: "Official Comprehensive Land Use Plan (CLUP) zoning classification polygons.",
        tag: "Zoning & CLUP",
        color: "purple",
    },
};

export default function Settings({ auth = {} }) {
    const [clock, setClock] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [activeTab, setActiveTab] = useState("spatial"); // 'spatial' | 'raster' | 'map_prefs' | 'diagnostics'

    const userName = auth?.user?.name || "Planning Officer";
    const userRole = auth?.user?.role || "Administrator";

    // ── Vector Shapefile Upload States ──
    const [uploadLayer, setUploadLayer] = useState("municipal_boundary");
    const [selectedFile, setSelectedFile] = useState(null);
    const [isDraggingShape, setIsDraggingShape] = useState(false);
    const [isUploadingShape, setIsUploadingShape] = useState(false);
    const fileInputRef = useRef(null);

    // ── Raster XYZ Tiles Upload States ──
    const [selectedTileFile, setSelectedTileFile] = useState(null);
    const [isDraggingTile, setIsDraggingTile] = useState(false);
    const [isUploadingTile, setIsUploadingTile] = useState(false);
    const tileInputRef = useRef(null);

    // ── Interactive Map Viewport Settings ──
    const [mapSettings, setMapSettings] = useState(() => {
        try {
            const saved = localStorage.getItem("imaps_map_preferences");
            if (saved) return JSON.parse(saved);
        } catch (e) {}
        return {
            defaultCenter: "13.8450, 121.2060",
            defaultZoom: 13,
            baseMap: "satellite",
            crs: "EPSG:4326 (WGS 84 / Geographic)",
        };
    });

    const [guideModalOpen, setGuideModalOpen] = useState(false);

    // Parse lat/lng array for preview map
    const parsedCenter = useMemo(() => {
        if (!mapSettings.defaultCenter) return [13.8450, 121.2060];
        const parts = mapSettings.defaultCenter.split(",").map((s) => parseFloat(s.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            return parts;
        }
        return [13.8450, 121.2060];
    }, [mapSettings.defaultCenter]);

    // Live clock ticker
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
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

    // Logout handler matching Applications module
    const handleLogout = () => {
        Swal.fire({
            title: "Sign Out?",
            text: "Are you sure you want to log out of iMAPS?",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Yes, sign out",
            cancelButtonText: "Cancel",
            buttonsStyling: false,
            customClass: {
                popup: "rounded-3xl border border-slate-200 shadow-2xl p-6 sm:p-8 bg-white font-sans",
                title: "text-lg font-bold text-slate-900",
                htmlContainer: "text-xs text-slate-500",
                actions: "flex items-center justify-center gap-3 mt-5",
                confirmButton:
                    "inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer",
                cancelButton:
                    "inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-all active:scale-95 cursor-pointer",
            },
        }).then((result) => {
            if (result.isConfirmed) {
                sessionStorage.removeItem("hasShownWelcome");
                router.post("/logout");
            }
        });
    };

    // Helper: format file size
    const formatBytes = (bytes) => {
        if (!bytes || bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

    // ── Vector Shapefile Upload Handlers ──
    const handleShapefileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.name.toLowerCase().endsWith(".zip")) {
            if (file.size > 50 * 1024 * 1024) {
                Swal.fire({
                    icon: "error",
                    title: "File Too Large",
                    text: `Selected file is ${formatBytes(file.size)}. Shapefile bundles cannot exceed 50MB.`,
                    customClass: { popup: "rounded-3xl", confirmButton: "bg-blue-600 text-white px-4 py-2 rounded-xl text-xs" },
                });
                if (e.target) e.target.value = null;
                return;
            }
            setSelectedFile(file);
        } else {
            Swal.fire({
                icon: "warning",
                title: "Invalid File Format",
                text: "Please select a valid .zip archive containing your shapefile bundle (.shp, .shx, .dbf, .prj).",
                customClass: { popup: "rounded-3xl", confirmButton: "bg-blue-600 text-white px-4 py-2 rounded-xl text-xs" },
            });
            if (e.target) e.target.value = null;
        }
    };

    const handleShapeDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingShape(true);
    };

    const handleShapeDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingShape(false);
    };

    const handleShapeDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingShape(false);

        const file = e.dataTransfer.files?.[0];
        if (file) {
            if (file.name.toLowerCase().endsWith(".zip")) {
                if (file.size > 50 * 1024 * 1024) {
                    Swal.fire({
                        icon: "error",
                        title: "File Too Large",
                        text: `Selected file is ${formatBytes(file.size)}. Max size is 50MB.`,
                        customClass: { popup: "rounded-3xl", confirmButton: "bg-blue-600 text-white px-4 py-2 rounded-xl text-xs" },
                    });
                    return;
                }
                setSelectedFile(file);
            } else {
                Swal.fire({
                    icon: "warning",
                    title: "ZIP Bundle Required",
                    text: "Please drop a .zip archive containing the shapefile components.",
                    customClass: { popup: "rounded-3xl", confirmButton: "bg-blue-600 text-white px-4 py-2 rounded-xl text-xs" },
                });
            }
        }
    };

    const handleUploadSubmit = (e) => {
        e.preventDefault();
        if (!uploadLayer || !selectedFile) {
            Swal.fire({
                icon: "warning",
                title: "Incomplete Form",
                text: "Please select a target map layer and choose a valid shapefile .zip bundle.",
                customClass: { popup: "rounded-3xl", confirmButton: "bg-blue-600 text-white px-4 py-2 rounded-xl text-xs" },
            });
            return;
        }

        const layerInfo = LAYER_METADATA[uploadLayer] || { title: uploadLayer };

        Swal.fire({
            title: `Overwrite ${layerInfo.title}?`,
            html: `<p class="text-xs text-slate-600">This will drop and regenerate the target PostGIS table <b>${layerInfo.table || uploadLayer}</b> with data from <b>${selectedFile.name}</b>.</p>`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Yes, ingest layer",
            cancelButtonText: "Cancel",
            buttonsStyling: false,
            customClass: {
                popup: "rounded-3xl border border-slate-200 shadow-2xl p-6 sm:p-8 bg-white font-sans",
                title: "text-lg font-bold text-slate-900",
                htmlContainer: "text-xs text-slate-500",
                actions: "flex items-center justify-center gap-3 mt-5",
                confirmButton:
                    "inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer",
                cancelButton:
                    "inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-all active:scale-95 cursor-pointer",
            },
        }).then((res) => {
            if (res.isConfirmed) {
                setIsUploadingShape(true);
                const formData = new FormData();
                formData.append("layer_type", uploadLayer);
                formData.append("shapefile_zip", selectedFile);

                router.post("/settings/upload-shapefile", formData, {
                    onSuccess: () => {
                        setIsUploadingShape(false);
                        setSelectedFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = null;
                        Swal.fire({
                            icon: "success",
                            title: "Spatial Layer Updated",
                            text: `Successfully converted and imported shapefile into ${layerInfo.table || uploadLayer}!`,
                            customClass: { popup: "rounded-3xl", confirmButton: "bg-blue-600 text-white px-4 py-2 rounded-xl text-xs" },
                        });
                    },
                    onError: (errors) => {
                        setIsUploadingShape(false);
                        const msg = errors.shapefile_zip || errors.layer_type || "An error occurred during shapefile upload.";
                        Swal.fire({
                            icon: "error",
                            title: "Import Failed",
                            text: msg,
                            customClass: { popup: "rounded-3xl", confirmButton: "bg-rose-600 text-white px-4 py-2 rounded-xl text-xs" },
                        });
                    },
                });
            }
        });
    };

    // ── Raster XYZ Tiles Upload Handlers ──
    const handleTileFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.name.toLowerCase().endsWith(".zip")) {
            if (file.size > 200 * 1024 * 1024) {
                Swal.fire({
                    icon: "error",
                    title: "File Exceeds Limit",
                    text: `Selected file is ${formatBytes(file.size)}. Max allowed size for tile archives is 200MB.`,
                    customClass: { popup: "rounded-3xl", confirmButton: "bg-blue-600 text-white px-4 py-2 rounded-xl text-xs" },
                });
                if (e.target) e.target.value = null;
                return;
            }
            setSelectedTileFile(file);
        } else {
            Swal.fire({
                icon: "warning",
                title: "Invalid Tile Bundle",
                text: "Please select a .zip archive containing standard numbered XYZ zoom folders.",
                customClass: { popup: "rounded-3xl", confirmButton: "bg-blue-600 text-white px-4 py-2 rounded-xl text-xs" },
            });
            if (e.target) e.target.value = null;
        }
    };

    const handleTileUploadSubmit = (e) => {
        e.preventDefault();
        if (!selectedTileFile) {
            Swal.fire({
                icon: "warning",
                title: "No Bundle Selected",
                text: "Please choose a valid .zip file containing your raster map tiles.",
                customClass: { popup: "rounded-3xl", confirmButton: "bg-blue-600 text-white px-4 py-2 rounded-xl text-xs" },
            });
            return;
        }

        Swal.fire({
            title: "Deploy Raster Tiles?",
            html: `<p class="text-xs text-slate-600">This will extract and replace the CLUP raster tiles in <code>/public/tiles/clup_tiles</code> with contents of <b>${selectedTileFile.name}</b>.</p>`,
            icon: "info",
            showCancelButton: true,
            confirmButtonText: "Deploy Tiles",
            cancelButtonText: "Cancel",
            buttonsStyling: false,
            customClass: {
                popup: "rounded-3xl border border-slate-200 shadow-2xl p-6 sm:p-8 bg-white font-sans",
                title: "text-lg font-bold text-slate-900",
                htmlContainer: "text-xs text-slate-500",
                actions: "flex items-center justify-center gap-3 mt-5",
                confirmButton:
                    "inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer",
                cancelButton:
                    "inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-all active:scale-95 cursor-pointer",
            },
        }).then((res) => {
            if (res.isConfirmed) {
                setIsUploadingTile(true);
                const formData = new FormData();
                formData.append("tiles_zip", selectedTileFile);

                router.post("/settings/upload-tiles", formData, {
                    onSuccess: () => {
                        setIsUploadingTile(false);
                        setSelectedTileFile(null);
                        if (tileInputRef.current) tileInputRef.current.value = null;
                        Swal.fire({
                            icon: "success",
                            title: "Raster Tiles Deployed",
                            text: "CLUP raster map tiles successfully deployed to public web directory!",
                            customClass: { popup: "rounded-3xl", confirmButton: "bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs" },
                        });
                    },
                    onError: (errors) => {
                        setIsUploadingTile(false);
                        Swal.fire({
                            icon: "error",
                            title: "Tile Deployment Error",
                            text: errors.tiles_zip || "An error occurred during tile extraction.",
                            customClass: { popup: "rounded-3xl", confirmButton: "bg-rose-600 text-white px-4 py-2 rounded-xl text-xs" },
                        });
                    },
                });
            }
        });
    };

    // ── Save Map Preferences Handler ──
    const handleSaveMapSettings = (e) => {
        e.preventDefault();
        try {
            localStorage.setItem("imaps_map_preferences", JSON.stringify(mapSettings));
        } catch (err) {}

        Swal.fire({
            icon: "success",
            title: "Preferences Saved",
            text: "Default map focal coordinates, zoom level, and basemap style have been updated successfully.",
            timer: 2000,
            showConfirmButton: false,
            customClass: { popup: "rounded-3xl" },
        });
    };

    const handleApplyPreset = (preset) => {
        setMapSettings((prev) => ({
            ...prev,
            defaultCenter: preset.coords,
        }));
    };

    const selectedBasemap = BASEMAP_PROVIDERS[mapSettings.baseMap] || BASEMAP_PROVIDERS.satellite;

    return (
        <>
            <Head title="System Settings | iMAPS" />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
                
                #dashboard-root {
                    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }
                .font-mono {
                    font-family: 'JetBrains Mono', monospace !important;
                }

                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 6px; }
                ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            `}</style>

            <div id="dashboard-root" className="bg-slate-100/60 font-sans text-slate-800 h-screen flex flex-col overflow-hidden">
                <Header
                    userName={userName}
                    userRole={userRole}
                    clock={clock}
                    onLogout={handleLogout}
                    sidebarOpen={sidebarOpen}
                    setSidebarOpen={setSidebarOpen}
                    activePage="settings"
                />

                <div className="flex-1 overflow-hidden relative flex flex-col min-w-0">
                    <Sidebar
                        userName={userName}
                        userRole={userRole}
                        sidebarOpen={sidebarOpen}
                        setSidebarOpen={setSidebarOpen}
                        onLogout={handleLogout}
                        activePage="settings"
                    />

                    {sidebarOpen && (
                        <div
                            onClick={() => setSidebarOpen(false)}
                            className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px] z-[750] transition-opacity duration-300"
                        />
                    )}

                    <main className="flex-1 w-full h-full flex flex-col overflow-hidden">
                        <div className="p-4 sm:p-6 flex-1 flex flex-col h-full overflow-y-auto max-w-[1580px] mx-auto w-full gap-4">
                            
                            {/* ── TOP HEADER BAR (MATCHING APPLICATIONS REGISTRY) ── */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                                <div>
                                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                                        <span>Configuration</span>
                                        <svg className="w-3 h-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                        </svg>
                                        <span className="text-blue-600 font-extrabold">System & Spatial Engine</span>
                                    </div>
                                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                                        System Settings
                                    </h1>
                                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                                        Manage PostGIS spatial layers, CLUP raster overlays, interactive map defaults, and municipal parameters
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap">
                                    {/* PostGIS Engine Status Badge */}
                                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200/90 shadow-2xs text-xs font-semibold text-slate-700">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                                        </span>
                                        <span>PostGIS 3.x Spatial DB</span>
                                    </div>

                                    {/* Help & Guide Modal Trigger */}
                                    <button
                                        type="button"
                                        onClick={() => setGuideModalOpen(true)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 hover:border-slate-300 shadow-2xs transition-all active:scale-98 cursor-pointer"
                                    >
                                        <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                                        </svg>
                                        <span>GIS Spec Guide</span>
                                    </button>
                                </div>
                            </div>

                            {/* ── SMART INTERACTIVE WORKFLOW CATEGORY CARDS (KPI / TAB CONTROLS) ── */}
                            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 shrink-0">
                                {[
                                    {
                                        id: "spatial",
                                        label: "Spatial Vector Layers",
                                        count: "PostGIS",
                                        sub: "Boundary & Zoning Shapes",
                                        dot: "bg-blue-600",
                                        icon: (
                                            <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                                            </svg>
                                        ),
                                        activeClass: "border-blue-600 ring-2 ring-blue-500/15 bg-blue-50/40",
                                    },
                                    {
                                        id: "raster",
                                        label: "CLUP Raster Overlay",
                                        count: "XYZ Tiles",
                                        sub: "Zoom Levels 12-18",
                                        dot: "bg-emerald-500",
                                        icon: (
                                            <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                            </svg>
                                        ),
                                        activeClass: "border-emerald-500 ring-2 ring-emerald-500/15 bg-emerald-50/40",
                                    },
                                    {
                                        id: "map_prefs",
                                        label: "Map Preferences",
                                        count: "Viewport",
                                        sub: "Center, Zoom & Basemap",
                                        dot: "bg-purple-500",
                                        icon: (
                                            <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                                            </svg>
                                        ),
                                        activeClass: "border-purple-500 ring-2 ring-purple-500/15 bg-purple-50/40",
                                    },
                                    {
                                        id: "diagnostics",
                                        label: "Municipal & System Info",
                                        count: "Rosario LGU",
                                        sub: "MPDO Metadata & Paths",
                                        dot: "bg-slate-700",
                                        icon: (
                                            <svg className="w-4 h-4 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                                            </svg>
                                        ),
                                        activeClass: "border-slate-700 ring-2 ring-slate-700/15 bg-slate-100/70",
                                    },
                                ].map((tab) => {
                                    const isSelected = activeTab === tab.id;
                                    return (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            onClick={() => setActiveTab(tab.id)}
                                            className={`p-3.5 rounded-2xl bg-white border text-left transition-all cursor-pointer shadow-2xs hover:border-slate-300 relative overflow-hidden group ${
                                                isSelected ? tab.activeClass : "border-slate-200/90 hover:bg-slate-50/50"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className="p-1 rounded-lg bg-slate-50 border border-slate-100 shrink-0">
                                                        {tab.icon}
                                                    </div>
                                                    <span className="text-[11px] font-bold text-slate-600 group-hover:text-slate-900 transition-colors truncate">
                                                        {tab.label}
                                                    </span>
                                                </div>
                                                <span className={`w-2 h-2 rounded-full ${tab.dot} shrink-0`} />
                                            </div>
                                            <div className="mt-2 flex items-baseline justify-between">
                                                <span className="text-lg font-bold text-slate-900 font-mono tracking-tight">{tab.count}</span>
                                                <span className="text-[10.5px] text-slate-400 font-semibold">{tab.sub}</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* ── TAB CONTENT CONTAINERS ── */}
                            <div className="flex-1 min-h-0">
                                
                                {/* ── TAB 1: SPATIAL VECTOR LAYERS MANAGEMENT ── */}
                                {activeTab === "spatial" && (
                                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full items-start">
                                        
                                        {/* Upload Card */}
                                        <div className="lg:col-span-7 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col gap-4">
                                            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
                                                <div>
                                                    <h2 className="text-sm font-bold text-slate-900">
                                                        PostGIS Shapefile Ingestion
                                                    </h2>
                                                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                                                        Upload ESRI shapefiles to overwrite target PostGIS database boundary tables
                                                    </p>
                                                </div>
                                                <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200/60 font-mono text-[10.5px] font-bold">
                                                    shp2pgsql · EPSG:4326
                                                </span>
                                            </div>

                                            <form onSubmit={handleUploadSubmit} className="space-y-4">
                                                {/* Target Map Layer Selector */}
                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                                        Target Map Layer <span className="text-rose-500">*</span>
                                                    </label>
                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                        {Object.entries(LAYER_METADATA).map(([key, meta]) => {
                                                            const isChecked = uploadLayer === key;
                                                            return (
                                                                <button
                                                                    key={key}
                                                                    type="button"
                                                                    onClick={() => setUploadLayer(key)}
                                                                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                                                                        isChecked
                                                                            ? "border-blue-500 bg-blue-50/50 ring-1 ring-blue-500/20 text-blue-950 font-semibold shadow-2xs"
                                                                            : "border-slate-200 bg-slate-50/50 hover:bg-white text-slate-700 hover:border-slate-300"
                                                                    }`}
                                                                >
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-xs font-bold">{meta.title}</span>
                                                                        {isChecked ? (
                                                                            <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                                                                        ) : (
                                                                            <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                                                                        )}
                                                                    </div>
                                                                    <span className="text-[10px] font-mono text-slate-400 mt-2 truncate">
                                                                        {meta.table}
                                                                    </span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* Selected Layer Info Banner */}
                                                {uploadLayer && LAYER_METADATA[uploadLayer] && (
                                                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start gap-2.5">
                                                        <svg className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                                                        </svg>
                                                        <div className="text-xs">
                                                            <p className="font-semibold text-slate-800">
                                                                {LAYER_METADATA[uploadLayer].title} &mdash; <span className="font-mono text-slate-500">{LAYER_METADATA[uploadLayer].table}</span>
                                                            </p>
                                                            <p className="text-slate-500 text-[11px] mt-0.5">
                                                                {LAYER_METADATA[uploadLayer].desc}
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Modern Drag & Drop Zone */}
                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                                        Shapefile Bundle Archive (.zip) <span className="text-rose-500">*</span>
                                                    </label>

                                                    <input
                                                        type="file"
                                                        accept=".zip"
                                                        ref={fileInputRef}
                                                        onChange={handleShapefileChange}
                                                        className="hidden"
                                                    />

                                                    <div
                                                        onClick={() => fileInputRef.current?.click()}
                                                        onDragOver={handleShapeDragOver}
                                                        onDragLeave={handleShapeDragLeave}
                                                        onDrop={handleShapeDrop}
                                                        className={`w-full border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-2 ${
                                                            isDraggingShape
                                                                ? "border-blue-500 bg-blue-50 scale-[0.99]"
                                                                : selectedFile
                                                                ? "border-blue-300 bg-blue-50/40 hover:bg-blue-50/70"
                                                                : "border-slate-300 bg-slate-50/60 hover:bg-slate-100 hover:border-slate-400"
                                                        }`}
                                                    >
                                                        {selectedFile ? (
                                                            <>
                                                                <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center shadow-xs">
                                                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                    </svg>
                                                                </div>
                                                                <div className="text-center">
                                                                    <p className="text-xs font-bold text-slate-900 truncate max-w-sm">
                                                                        {selectedFile.name}
                                                                    </p>
                                                                    <p className="text-[11px] font-mono text-blue-700 font-semibold mt-0.5">
                                                                        {formatBytes(selectedFile.size)} · Shapefile Bundle
                                                                    </p>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSelectedFile(null);
                                                                        if (fileInputRef.current) fileInputRef.current.value = null;
                                                                    }}
                                                                    className="mt-1 text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
                                                                >
                                                                    Remove and choose different file
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 text-slate-400 flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
                                                                    <svg className="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                                                    </svg>
                                                                </div>
                                                                <div>
                                                                    <p className="text-xs font-bold text-slate-800">
                                                                        Click to browse or drag shapefile .zip here
                                                                    </p>
                                                                    <p className="text-[11px] text-slate-400 mt-0.5 font-medium">
                                                                        Must contain .shp, .shx, .dbf, and .prj files (Max 50MB)
                                                                    </p>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Submit Button */}
                                                <button
                                                    type="submit"
                                                    disabled={isUploadingShape || !selectedFile || !uploadLayer}
                                                    className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-sm shadow-blue-600/20 transition-all active:scale-98 cursor-pointer"
                                                >
                                                    {isUploadingShape ? (
                                                        <>
                                                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                            </svg>
                                                            <span>Ingesting and transforming shapefile...</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                            </svg>
                                                            <span>Upload & Overwrite Layer Table</span>
                                                        </>
                                                    )}
                                                </button>
                                            </form>
                                        </div>

                                        {/* Reference & Checklist Side Card */}
                                        <div className="lg:col-span-5 flex flex-col gap-4">
                                            {/* Requirements Card */}
                                            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                    </div>
                                                    <h3 className="text-xs font-bold text-slate-900">
                                                        Required Shapefile Elements
                                                    </h3>
                                                </div>

                                                <p className="text-[11px] text-slate-500">
                                                    The .zip archive must contain all four fundamental shapefile files sharing the exact same basename:
                                                </p>

                                                <div className="space-y-1.5">
                                                    {[
                                                        { ext: ".shp", label: "Geometry vector features & polygon coordinates", req: "Mandatory" },
                                                        { ext: ".shx", label: "Spatial index positional offset format", req: "Mandatory" },
                                                        { ext: ".dbf", label: "dBase tabular attributes (names, codes, areas)", req: "Mandatory" },
                                                        { ext: ".prj", label: "Coordinate system projection metadata", req: "Mandatory" },
                                                    ].map((item) => (
                                                        <div key={item.ext} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200/60 px-1.5 py-0.5 rounded text-[11px]">
                                                                    {item.ext}
                                                                </span>
                                                                <span className="text-[11px] text-slate-700 font-medium">{item.label}</span>
                                                            </div>
                                                            <span className="text-[10px] font-bold text-emerald-700 uppercase">{item.req}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Table Mapping Card */}
                                            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
                                                <h3 className="text-xs font-bold text-slate-900">
                                                    Database Schema Mappings
                                                </h3>
                                                <div className="space-y-2 text-xs">
                                                    {Object.entries(LAYER_METADATA).map(([key, meta]) => (
                                                        <div key={key} className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/50 flex flex-col gap-1">
                                                            <div className="flex items-center justify-between">
                                                                <span className="font-semibold text-slate-800">{meta.title}</span>
                                                                <span className="text-[10px] font-mono font-bold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                                                                    {meta.geometry}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                                                                <span>Table: {meta.table}</span>
                                                                <span className="text-blue-600 font-bold">{meta.crs}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ── TAB 2: RASTER MAP OVERLAY (CLUP XYZ TILES) ── */}
                                {activeTab === "raster" && (
                                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full items-start">
                                        
                                        {/* Upload Tile Bundle Card */}
                                        <div className="lg:col-span-7 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col gap-4">
                                            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
                                                <div>
                                                    <h2 className="text-sm font-bold text-slate-900">
                                                        CLUP Raster Map Tiles Deployment
                                                    </h2>
                                                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                                                        Deploy pre-rendered XYZ map tile folders for high-performance offline CLUP zoning overlays
                                                    </p>
                                                </div>
                                                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-mono text-[10.5px] font-bold">
                                                    XYZ Tiles · 200MB Max
                                                </span>
                                            </div>

                                            <form onSubmit={handleTileUploadSubmit} className="space-y-4">
                                                {/* Tile Target Directory Note */}
                                                <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/80 flex items-start gap-2.5">
                                                    <svg className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    <div className="text-xs">
                                                        <p className="font-semibold text-emerald-900">
                                                            Destination: <span className="font-mono">/public/tiles/clup_tiles/{`{z}/{x}/{y}`}.png</span>
                                                        </p>
                                                        <p className="text-emerald-700 text-[11px] mt-0.5">
                                                            Uploading a new tile bundle will automatically clean out deprecated tile caches to ensure crisp, seamless rendering across all zoom levels.
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Drag & Drop Tile Zip Zone */}
                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                                        Tile Archive Package (.zip) <span className="text-rose-500">*</span>
                                                    </label>

                                                    <input
                                                        type="file"
                                                        accept=".zip"
                                                        ref={tileInputRef}
                                                        onChange={handleTileFileChange}
                                                        className="hidden"
                                                    />

                                                    <div
                                                        onClick={() => tileInputRef.current?.click()}
                                                        onDragOver={(e) => { e.preventDefault(); setIsDraggingTile(true); }}
                                                        onDragLeave={(e) => { e.preventDefault(); setIsDraggingTile(false); }}
                                                        onDrop={(e) => {
                                                            e.preventDefault();
                                                            setIsDraggingTile(false);
                                                            const file = e.dataTransfer.files?.[0];
                                                            if (file && file.name.toLowerCase().endsWith(".zip")) {
                                                                setSelectedTileFile(file);
                                                            }
                                                        }}
                                                        className={`w-full border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-2 ${
                                                            isDraggingTile
                                                                ? "border-emerald-500 bg-emerald-50 scale-[0.99]"
                                                                : selectedTileFile
                                                                ? "border-emerald-300 bg-emerald-50/40 hover:bg-emerald-50/70"
                                                                : "border-slate-300 bg-slate-50/60 hover:bg-slate-100 hover:border-slate-400"
                                                        }`}
                                                    >
                                                        {selectedTileFile ? (
                                                            <>
                                                                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
                                                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                    </svg>
                                                                </div>
                                                                <div className="text-center">
                                                                    <p className="text-xs font-bold text-slate-900 truncate max-w-sm">
                                                                        {selectedTileFile.name}
                                                                    </p>
                                                                    <p className="text-[11px] font-mono text-emerald-700 font-semibold mt-0.5">
                                                                        {formatBytes(selectedTileFile.size)} · XYZ Tile Bundle
                                                                    </p>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSelectedTileFile(null);
                                                                        if (tileInputRef.current) tileInputRef.current.value = null;
                                                                    }}
                                                                    className="mt-1 text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
                                                                >
                                                                    Remove and choose different file
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 text-slate-400 flex items-center justify-center shadow-2xs">
                                                                    <svg className="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                                                    </svg>
                                                                </div>
                                                                <div>
                                                                    <p className="text-xs font-bold text-slate-800">
                                                                        Click to browse or drag tile bundle .zip here
                                                                    </p>
                                                                    <p className="text-[11px] text-slate-400 mt-0.5 font-medium">
                                                                        Standard XYZ zoom directory structure (Up to 200MB)
                                                                    </p>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Submit Button */}
                                                <button
                                                    type="submit"
                                                    disabled={isUploadingTile || !selectedTileFile}
                                                    className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-sm shadow-emerald-600/20 transition-all active:scale-98 cursor-pointer"
                                                >
                                                    {isUploadingTile ? (
                                                        <>
                                                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                            </svg>
                                                            <span>Extracting and deploying raster tiles...</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                                            </svg>
                                                            <span>Extract & Deploy Raster Tiles</span>
                                                        </>
                                                    )}
                                                </button>
                                            </form>
                                        </div>

                                        {/* Tile Directory Structure Guide Card */}
                                        <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                                                    </svg>
                                                </div>
                                                <h3 className="text-xs font-bold text-slate-900">
                                                    Tile Bundle Structure Guide
                                                </h3>
                                            </div>

                                            <p className="text-[11px] text-slate-500">
                                                Generated using QGIS &ldquo;Generate XYZ Tiles&rdquo; or GDAL2Tiles. The root of the ZIP file must directly contain the zoom level folders:
                                            </p>

                                            <div className="bg-slate-900 text-slate-200 p-3 rounded-xl font-mono text-[11px] space-y-1">
                                                <div className="text-emerald-400">tiles_bundle.zip/</div>
                                                <div className="pl-4">├── 12/ (zoom level 12)</div>
                                                <div className="pl-8">└── 3421/ (x column)</div>
                                                <div className="pl-12 text-slate-400">└── 1984.png (y tile)</div>
                                                <div className="pl-4">├── 13/</div>
                                                <div className="pl-4">├── 14/</div>
                                                <div className="pl-4 text-emerald-400">└── ... up to zoom 18/</div>
                                            </div>

                                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                                                <span className="text-slate-500">Supported Formats:</span>
                                                <span className="font-bold text-slate-800">PNG / WebP / JPG</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ── TAB 3: MAP PREFERENCES & LIVE GIS VIEWPORT PREVIEW ── */}
                                {activeTab === "map_prefs" && (
                                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full items-start">
                                        
                                        {/* Configuration Form Card */}
                                        <div className="lg:col-span-6 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col gap-4">
                                            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
                                                <div>
                                                    <h2 className="text-sm font-bold text-slate-900">
                                                        Map Engine & Default Viewport
                                                    </h2>
                                                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                                                        Set default focus coordinates, zoom level, and base cartography styles
                                                    </p>
                                                </div>
                                                <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 border border-purple-200/60 font-mono text-[10.5px] font-bold">
                                                    Leaflet + PostGIS
                                                </span>
                                            </div>

                                            <form onSubmit={handleSaveMapSettings} className="space-y-4">
                                                {/* Default Center Lat/Lng Input */}
                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                                        Default Center Coordinates (Latitude, Longitude)
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={mapSettings.defaultCenter}
                                                        onChange={(e) => setMapSettings({ ...mapSettings, defaultCenter: e.target.value })}
                                                        placeholder="13.8450, 121.2060"
                                                        className="w-full px-3.5 py-2 text-xs font-mono font-medium text-slate-800 rounded-xl border border-slate-200 bg-white hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 shadow-2xs transition-all outline-none"
                                                    />

                                                    {/* Quick Presets */}
                                                    <div className="mt-2">
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                                                            Rosario Presets:
                                                        </span>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {ROSARIO_LOCATION_PRESETS.map((preset) => (
                                                                <button
                                                                    key={preset.coords}
                                                                    type="button"
                                                                    onClick={() => handleApplyPreset(preset)}
                                                                    className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${
                                                                        mapSettings.defaultCenter.trim() === preset.coords
                                                                            ? "bg-blue-600 text-white border-blue-600 font-bold shadow-2xs"
                                                                            : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                                                                    }`}
                                                                    title={preset.desc}
                                                                >
                                                                    {preset.name.split(" (")[0]}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Zoom Level & CRS Projection */}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                                            Default Zoom Level: <span className="font-mono font-bold text-blue-600">{mapSettings.defaultZoom}</span>
                                                        </label>
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="range"
                                                                min="10"
                                                                max="18"
                                                                value={mapSettings.defaultZoom}
                                                                onChange={(e) => setMapSettings({ ...mapSettings, defaultZoom: Number(e.target.value) })}
                                                                className="w-full accent-blue-600 cursor-pointer"
                                                            />
                                                            <input
                                                                type="number"
                                                                min="10"
                                                                max="18"
                                                                value={mapSettings.defaultZoom}
                                                                onChange={(e) => setMapSettings({ ...mapSettings, defaultZoom: Number(e.target.value) })}
                                                                className="w-14 px-2 py-1 text-xs text-center font-mono font-bold text-slate-800 rounded-lg border border-slate-200 outline-none"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                                            Coordinate Reference System
                                                        </label>
                                                        <input
                                                            type="text"
                                                            disabled
                                                            value={mapSettings.crs}
                                                            className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded-xl cursor-not-allowed"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Default Basemap Selector */}
                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                                        Default Base Cartography
                                                    </label>
                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                        {Object.values(BASEMAP_PROVIDERS).map((provider) => {
                                                            const isSelected = mapSettings.baseMap === provider.id;
                                                            return (
                                                                <button
                                                                    key={provider.id}
                                                                    type="button"
                                                                    onClick={() => setMapSettings({ ...mapSettings, baseMap: provider.id })}
                                                                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                                                                        isSelected
                                                                            ? "border-blue-500 bg-blue-50/50 ring-1 ring-blue-500/20 text-blue-950 font-semibold shadow-2xs"
                                                                            : "border-slate-200 bg-slate-50/50 hover:bg-white text-slate-700 hover:border-slate-300"
                                                                    }`}
                                                                >
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-xs font-bold">{provider.name.split(" ")[0]}</span>
                                                                        {isSelected && (
                                                                            <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                                                                        )}
                                                                    </div>
                                                                    <span className="text-[10px] text-slate-500 mt-1 line-clamp-2">
                                                                        {provider.desc}
                                                                    </span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* Save Button */}
                                                <button
                                                    type="submit"
                                                    className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm shadow-blue-600/20 transition-all active:scale-98 cursor-pointer mt-2"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                    </svg>
                                                    <span>Save System Map Preferences</span>
                                                </button>
                                            </form>
                                        </div>

                                        {/* Interactive Live Preview Card */}
                                        <div className="lg:col-span-6 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col gap-3">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h3 className="text-xs font-bold text-slate-900">
                                                        Live Viewport Preview
                                                    </h3>
                                                    <p className="text-[11px] text-slate-500 font-medium">
                                                        Active focus at [{parsedCenter.join(", ")}] @ Zoom {mapSettings.defaultZoom}
                                                    </p>
                                                </div>
                                                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-[10px] font-bold border border-slate-200/80">
                                                    {selectedBasemap.badge}
                                                </span>
                                            </div>

                                            {/* Leaflet Live Map Viewport */}
                                            <div className="w-full h-[320px] rounded-xl overflow-hidden border border-slate-200 relative shadow-inner">
                                                <MapContainer
                                                    center={parsedCenter}
                                                    zoom={mapSettings.defaultZoom}
                                                    style={{ width: "100%", height: "100%" }}
                                                    zoomControl={true}
                                                    attributionControl={false}
                                                >
                                                    <TileLayer
                                                        url={selectedBasemap.url}
                                                        attribution={selectedBasemap.attribution}
                                                    />
                                                    <LiveMapUpdater
                                                        center={parsedCenter}
                                                        zoom={mapSettings.defaultZoom}
                                                        basemapUrl={selectedBasemap.url}
                                                    />
                                                    <Marker position={parsedCenter} icon={customMapPin}>
                                                        <Popup>
                                                            <div className="p-1 text-xs">
                                                                <p className="font-bold text-slate-900">Default Center</p>
                                                                <p className="font-mono text-slate-500 text-[10px]">{parsedCenter.join(", ")}</p>
                                                            </div>
                                                        </Popup>
                                                    </Marker>
                                                </MapContainer>
                                            </div>

                                            <div className="flex items-center justify-between text-[11px] text-slate-500 px-1 pt-1">
                                                <span>Basemap: <b className="text-slate-800">{selectedBasemap.name}</b></span>
                                                <span className="font-mono">PST: {clock || "Active"}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ── TAB 4: MUNICIPAL PARAMETERS & SYSTEM DIAGNOSTICS ── */}
                                {activeTab === "diagnostics" && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        
                                        {/* Rosario LGU Details */}
                                        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
                                                    </svg>
                                                </div>
                                                <h3 className="text-xs font-bold text-slate-900">
                                                    Local Government Unit
                                                </h3>
                                            </div>
                                            <div className="space-y-2 text-xs">
                                                <div className="flex justify-between py-1 border-b border-slate-100">
                                                    <span className="text-slate-500">Municipality</span>
                                                    <span className="font-semibold text-slate-800">Rosario</span>
                                                </div>
                                                <div className="flex justify-between py-1 border-b border-slate-100">
                                                    <span className="text-slate-500">Province / Region</span>
                                                    <span className="font-semibold text-slate-800">Batangas · IV-A</span>
                                                </div>
                                                <div className="flex justify-between py-1 border-b border-slate-100">
                                                    <span className="text-slate-500">Lead Office</span>
                                                    <span className="font-semibold text-slate-800">MPDO Planning</span>
                                                </div>
                                                <div className="flex justify-between py-1 border-b border-slate-100">
                                                    <span className="text-slate-500">Barangays Count</span>
                                                    <span className="font-mono font-bold text-blue-600">48 Jurisdictions</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Database & Spatial Engine */}
                                        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                                                    </svg>
                                                </div>
                                                <h3 className="text-xs font-bold text-slate-900">
                                                    Spatial Database Status
                                                </h3>
                                            </div>
                                            <div className="space-y-2 text-xs">
                                                <div className="flex justify-between py-1 border-b border-slate-100">
                                                    <span className="text-slate-500">Spatial Extension</span>
                                                    <span className="font-semibold text-emerald-700">PostGIS Enabled</span>
                                                </div>
                                                <div className="flex justify-between py-1 border-b border-slate-100">
                                                    <span className="text-slate-500">Projection CRS</span>
                                                    <span className="font-mono text-slate-800">EPSG:4326 (WGS 84)</span>
                                                </div>
                                                <div className="flex justify-between py-1 border-b border-slate-100">
                                                    <span className="text-slate-500">Active Schema</span>
                                                    <span className="font-mono text-slate-800">public</span>
                                                </div>
                                                <div className="flex justify-between py-1 border-b border-slate-100">
                                                    <span className="text-slate-500">Shape Parser</span>
                                                    <span className="font-mono font-bold text-blue-600">shp2pgsql CLI</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Storage Paths & Cache */}
                                        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 rounded-lg bg-purple-50 text-purple-700">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                                                    </svg>
                                                </div>
                                                <h3 className="text-xs font-bold text-slate-900">
                                                    Storage & Upload Limits
                                                </h3>
                                            </div>
                                            <div className="space-y-2 text-xs">
                                                <div className="flex justify-between py-1 border-b border-slate-100">
                                                    <span className="text-slate-500">Shapefile Max Size</span>
                                                    <span className="font-mono font-bold text-slate-800">50 MB</span>
                                                </div>
                                                <div className="flex justify-between py-1 border-b border-slate-100">
                                                    <span className="text-slate-500">Tile Bundle Max Size</span>
                                                    <span className="font-mono font-bold text-slate-800">200 MB</span>
                                                </div>
                                                <div className="flex justify-between py-1 border-b border-slate-100">
                                                    <span className="text-slate-500">Temp Processing</span>
                                                    <span className="font-mono text-[10.5px] text-slate-600">storage/app/temp_shapefiles</span>
                                                </div>
                                                <div className="flex justify-between py-1 border-b border-slate-100">
                                                    <span className="text-slate-500">Tile Public Root</span>
                                                    <span className="font-mono text-[10.5px] text-slate-600">public/tiles/clup_tiles</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </main>
                </div>
            </div>

            {/* ── GIS SPEC GUIDE & HELP MODAL ── */}
            {guideModalOpen && (
                <div
                    className="fixed inset-0 z-[9999] bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
                    onClick={() => setGuideModalOpen(false)}
                >
                    <div
                        className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200/90 space-y-4 font-sans"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm border border-blue-200/60">
                                    GIS
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900">Spatial Data Ingestion Guide</h3>
                                    <p className="text-[11px] text-slate-500 font-medium">Specifications for municipal shapefiles and raster tiles</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setGuideModalOpen(false)}
                                className="w-7 h-7 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="space-y-3 text-xs text-slate-600">
                            <div className="p-3 rounded-2xl bg-blue-50/60 border border-blue-100">
                                <p className="font-bold text-blue-900 mb-1">1. Shapefile Compression</p>
                                <p className="text-[11px] leading-relaxed">
                                    Ensure all shapefiles are bundled inside a root <code className="bg-white px-1 py-0.5 rounded border border-blue-200">.zip</code> without nested subfolders. The <code className="bg-white px-1 py-0.5 rounded border border-blue-200">.shp</code>, <code className="bg-white px-1 py-0.5 rounded border border-blue-200">.shx</code>, <code className="bg-white px-1 py-0.5 rounded border border-blue-200">.dbf</code>, and <code className="bg-white px-1 py-0.5 rounded border border-blue-200">.prj</code> files must share the identical filename.
                                </p>
                            </div>

                            <div className="p-3 rounded-2xl bg-emerald-50/60 border border-emerald-100">
                                <p className="font-bold text-emerald-900 mb-1">2. Raster Map Overlays</p>
                                <p className="text-[11px] leading-relaxed">
                                    Raster CLUP maps should be pre-sliced in XYZ tile format (Mercator projection). The archive must contain zoom level folders (e.g. 12, 13, 14, 15, 16, 17, 18) directly in the root of the ZIP file.
                                </p>
                            </div>

                            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                                <p className="font-bold text-slate-900 mb-1">3. Coordinate System Standard</p>
                                <p className="text-[11px] leading-relaxed">
                                    All spatial geometry features in iMAPS are projected in <b>WGS 84 (EPSG:4326)</b> coordinates. The ingestion engine executes <code className="bg-white px-1 py-0.5 rounded border border-slate-200 font-mono text-[10px]">shp2pgsql -s 4326</code> to ensure standardized spatial alignment.
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => setGuideModalOpen(false)}
                            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                        >
                            Understood, Close Guide
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}