import React, { useState, useEffect, useRef } from "react";
import { Head, router } from "@inertiajs/react";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";

// ── Layer Metadata Specifications ──
const LAYER_METADATA = {
    municipal_boundary: {
        id: "municipal_boundary",
        title: "Municipal Boundary",
        table: "public.rosario_boundary",
        geometry: "MultiPolygon",
        crs: "EPSG:4326 (WGS 84)",
        desc: "Defines the outer territorial administrative perimeter of the Municipality of Rosario.",
    },
    barangay_boundary: {
        id: "barangay_boundary",
        title: "Barangay Boundary",
        table: "public.barangay_boundary",
        geometry: "MultiPolygon",
        crs: "EPSG:4326 (WGS 84)",
        desc: "Sub-administrative polygon units covering all 48 political barangays in Rosario.",
    },
    land_use_plan: {
        id: "land_use_plan",
        title: "CLUP Land Use Plan",
        table: "public.land_use_plan",
        geometry: "MultiPolygon (Zoning)",
        crs: "EPSG:4326 (WGS 84)",
        desc: "Official Comprehensive Land Use Plan (CLUP) zoning classification polygons.",
    },
    land_parcels: {
        id: "land_parcels",
        title: "Land Parcels",
        table: "public.land_parcels",
        geometry: "MultiPolygon",
        crs: "EPSG:4326 (WGS 84)",
        desc: "Cadastral land parcels defining individual property boundaries.",
    },
};

export default function Settings({ auth = {} }) {
    const [clock, setClock] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [activeTab, setActiveTab] = useState(() => {
        const saved = sessionStorage.getItem("imaps_settings_section");
        return ["spatial", "raster", "diagnostics"].includes(saved) ? saved : "spatial";
    });
    const [statusMessage, setStatusMessage] = useState(null);
    const [copiedKey, setCopiedKey] = useState(null);

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

    // ── GIS Documentation Modal ──
    const [guideModalOpen, setGuideModalOpen] = useState(false);
    const [guideTab, setGuideTab] = useState("shapefiles"); // 'shapefiles' | 'tiles' | 'crs'

    useEffect(() => {
        sessionStorage.setItem("imaps_settings_section", activeTab);
    }, [activeTab]);

    useEffect(() => {
        const handleEscape = (event) => {
            if (event.key === "Escape" && guideModalOpen) setGuideModalOpen(false);
        };
        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [guideModalOpen]);

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

    // Logout handler
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
                popup: "rounded-2xl border border-slate-200 shadow-xl p-6 bg-white font-sans",
                title: "text-base font-bold text-slate-900",
                htmlContainer: "text-xs text-slate-500",
                actions: "flex items-center justify-center gap-3 mt-4",
                confirmButton:
                    "inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer",
                cancelButton:
                    "inline-flex items-center justify-center px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-colors cursor-pointer",
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
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    };

    // Helper: copy to clipboard
    const copyToClipboard = (text, key) => {
        if (navigator?.clipboard) {
            navigator.clipboard.writeText(text);
        }
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 1800);
    };

    // Vector Shapefile Handlers
    const validateZipFile = (file, maxBytes, label) => {
        if (!file.name.toLowerCase().endsWith(".zip")) {
            return `Please upload a valid ${label} ZIP archive (.zip).`;
        }
        if (file.size > maxBytes) {
            return `This file size is ${formatBytes(file.size)}. Maximum allowed size is ${formatBytes(maxBytes)}.`;
        }
        return "";
    };

    const handleShapefileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const error = validateZipFile(file, 50 * 1024 * 1024, "shapefile");
        if (error) {
            Swal.fire({
                icon: "error",
                title: "Cannot upload this file",
                text: error,
                customClass: { popup: "rounded-2xl", confirmButton: "bg-blue-600 text-white px-4 py-2 rounded-lg text-xs" },
            });
            if (e.target) e.target.value = null;
            return;
        }
        setSelectedFile(file);
        setStatusMessage(null);
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
            const error = validateZipFile(file, 50 * 1024 * 1024, "shapefile");
            if (error) {
                Swal.fire({
                    icon: "error",
                    title: "Cannot upload this file",
                    text: error,
                    customClass: { popup: "rounded-2xl", confirmButton: "bg-blue-600 text-white px-4 py-2 rounded-lg text-xs" },
                });
                return;
            }
            setSelectedFile(file);
            setStatusMessage(null);
        }
    };

    const handleUploadSubmit = (e) => {
        e.preventDefault();
        if (!uploadLayer || !selectedFile) {
            setStatusMessage({ type: "error", text: "Please select a target layer and choose a valid ZIP bundle." });
            return;
        }

        const layerInfo = LAYER_METADATA[uploadLayer] || { title: uploadLayer };

        Swal.fire({
            title: `Replace ${layerInfo.title}?`,
            html: `
                <div class="text-left text-xs text-slate-600 space-y-2 mt-2">
                    <p>This will drop and recreate the spatial table <b>${layerInfo.table || uploadLayer}</b> using the contents of <b>${selectedFile.name}</b>.</p>
                    <p class="text-slate-400">All coordinates will be standardized to EPSG:4326 (WGS 84).</p>
                </div>
            `,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Yes, replace layer",
            cancelButtonText: "Cancel",
            buttonsStyling: false,
            customClass: {
                popup: "rounded-2xl border border-slate-200 shadow-xl p-6 bg-white font-sans",
                title: "text-base font-bold text-slate-900",
                actions: "flex items-center justify-center gap-3 mt-4",
                confirmButton:
                    "inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer",
                cancelButton:
                    "inline-flex items-center justify-center px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-colors cursor-pointer",
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
                        setStatusMessage({ type: "success", text: `${layerInfo.title} was imported successfully.` });
                        Swal.fire({
                            icon: "success",
                            title: "Layer Updated",
                            text: `Successfully imported shapefile into ${layerInfo.table || uploadLayer}.`,
                            customClass: { popup: "rounded-2xl", confirmButton: "bg-blue-600 text-white px-4 py-2 rounded-lg text-xs" },
                        });
                    },
                    onError: (errors) => {
                        setIsUploadingShape(false);
                        const msg = errors.shapefile_zip || errors.layer_type || "An error occurred during shapefile upload.";
                        setStatusMessage({ type: "error", text: msg });
                        Swal.fire({
                            icon: "error",
                            title: "Import Failed",
                            text: msg,
                            customClass: { popup: "rounded-2xl", confirmButton: "bg-rose-600 text-white px-4 py-2 rounded-lg text-xs" },
                        });
                    },
                });
            }
        });
    };

    // Raster XYZ Tiles Handlers
    const handleTileFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const error = validateZipFile(file, 200 * 1024 * 1024, "tile");
        if (error) {
            Swal.fire({
                icon: "error",
                title: "Cannot upload this file",
                text: error,
                customClass: { popup: "rounded-2xl", confirmButton: "bg-blue-600 text-white px-4 py-2 rounded-lg text-xs" },
            });
            if (e.target) e.target.value = null;
            return;
        }
        setSelectedTileFile(file);
        setStatusMessage(null);
    };

    const handleTileUploadSubmit = (e) => {
        e.preventDefault();
        if (!selectedTileFile) {
            setStatusMessage({ type: "error", text: "Please choose a valid raster tile ZIP archive." });
            return;
        }

        Swal.fire({
            title: "Deploy Raster Overlay?",
            html: `
                <div class="text-left text-xs text-slate-600 space-y-2 mt-2">
                    <p>This will extract and replace the CLUP raster tiles in <code>/public/tiles/clup_tiles</code> with contents of <b>${selectedTileFile.name}</b>.</p>
                </div>
            `,
            icon: "info",
            showCancelButton: true,
            confirmButtonText: "Deploy Tiles",
            cancelButtonText: "Cancel",
            buttonsStyling: false,
            customClass: {
                popup: "rounded-2xl border border-slate-200 shadow-xl p-6 bg-white font-sans",
                title: "text-base font-bold text-slate-900",
                actions: "flex items-center justify-center gap-3 mt-4",
                confirmButton:
                    "inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer",
                cancelButton:
                    "inline-flex items-center justify-center px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-colors cursor-pointer",
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
                        setStatusMessage({ type: "success", text: "CLUP raster tiles were deployed successfully." });
                        Swal.fire({
                            icon: "success",
                            title: "Tiles Deployed",
                            text: "CLUP raster map tiles successfully updated in the public directory.",
                            customClass: { popup: "rounded-2xl", confirmButton: "bg-blue-600 text-white px-4 py-2 rounded-lg text-xs" },
                        });
                    },
                    onError: (errors) => {
                        setIsUploadingTile(false);
                        setStatusMessage({ type: "error", text: errors.tiles_zip || "An error occurred during tile deployment." });
                        Swal.fire({
                            icon: "error",
                            title: "Deployment Failed",
                            text: errors.tiles_zip || "An error occurred during tile deployment.",
                            customClass: { popup: "rounded-2xl", confirmButton: "bg-rose-600 text-white px-4 py-2 rounded-lg text-xs" },
                        });
                    },
                });
            }
        });
    };

    return (
        <>
            <Head title="GIS Settings | iMAPS" />

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
                
                #settings-page-root, .swal2-popup {
                    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                }
                .font-mono {
                    font-family: 'JetBrains Mono', monospace !important;
                }

                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 6px; }
                ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            `}</style>

            <div id="settings-page-root" className="bg-slate-50/75 text-slate-800 h-screen flex flex-col overflow-hidden antialiased">
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
                            className="absolute inset-0 bg-slate-900/20 backdrop-blur-xs z-[750] transition-opacity duration-200"
                        />
                    )}

                    <main className="flex-1 w-full h-full flex flex-col overflow-hidden">
                        <div className="p-6 sm:p-8 flex-1 flex flex-col h-full overflow-y-auto max-w-6xl mx-auto w-full gap-5">

                            {/* ── HEADER SECTION ── */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 shrink-0">
                                <div>
                                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Settings</h1>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Manage PostGIS spatial layers, raster tile caches, and municipal GIS database specifications.
                                    </p>
                                </div>

                                <div className="flex items-center gap-2.5">
                                    <button
                                        type="button"
                                        onClick={() => setGuideModalOpen(true)}
                                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200/90 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-700 text-xs font-semibold shadow-2xs transition-all active:scale-98 cursor-pointer"
                                    >
                                        <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                                        </svg>
                                        <span>GIS Documentation</span>
                                    </button>
                                </div>
                            </div>

                            {/* ── NOTIFICATION ALERT ── */}
                            {statusMessage && (
                                <div
                                    role="status"
                                    className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-medium transition-all shrink-0 ${statusMessage.type === "success"
                                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                            : "border-rose-200 bg-rose-50 text-rose-800"
                                        }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full ${statusMessage.type === "success" ? "bg-emerald-500" : "bg-rose-500"}`} />
                                        <span>{statusMessage.text}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setStatusMessage(null)}
                                        className="text-current opacity-70 hover:opacity-100 cursor-pointer text-xs p-1"
                                    >
                                        ✕
                                    </button>
                                </div>
                            )}

                            {/* ── TAB NAVIGATION ── */}
                            <div className="border-b border-slate-200/80 pb-0.5 shrink-0">
                                <nav className="-mb-px flex space-x-6 sm:space-x-8 overflow-x-auto" aria-label="Settings Tabs">
                                    {[
                                        {
                                            id: "spatial",
                                            label: "Vector Layers",
                                            icon: (
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3" />
                                                </svg>
                                            ),
                                        },
                                        {
                                            id: "raster",
                                            label: "Raster Overlays",
                                            icon: (
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                                                </svg>
                                            ),
                                        },
                                        {
                                            id: "diagnostics",
                                            label: "System Information",
                                            icon: (
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                                                </svg>
                                            ),
                                        },
                                    ].map((tab) => {
                                        const isSelected = activeTab === tab.id;
                                        return (
                                            <button
                                                key={tab.id}
                                                type="button"
                                                onClick={() => setActiveTab(tab.id)}
                                                className={`py-3 px-1 border-b-2 text-xs font-medium transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${isSelected
                                                        ? "border-blue-600 text-blue-600 font-semibold"
                                                        : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
                                                    }`}
                                            >
                                                <span className={isSelected ? "text-blue-600" : "text-slate-400"}>
                                                    {tab.icon}
                                                </span>
                                                <span>{tab.label}</span>
                                            </button>
                                        );
                                    })}
                                </nav>
                            </div>

                            {/* ── TAB 1: VECTOR LAYERS ── */}
                            {activeTab === "spatial" && (
                                <div className="space-y-6 animate-in fade-in duration-200">
                                    {/* Ingestion Card */}
                                    <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
                                        <div className="p-5 sm:p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                            <div className="flex items-start gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 shrink-0 shadow-2xs mt-0.5">
                                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <h2 className="text-sm font-bold text-slate-900">PostGIS Shapefile Ingestion</h2>
                                                    <p className="text-xs text-slate-500 mt-0.5">
                                                        Select a target spatial layer and upload an ESRI Shapefile package (.zip) to update physical database geometry.
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="text-[11px] font-mono text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 shrink-0">
                                                shp2pgsql -d -I -s 4326
                                            </span>
                                        </div>

                                        <form onSubmit={handleUploadSubmit} className="p-5 sm:p-6 space-y-5">
                                            {/* Layer Select */}
                                            <div>
                                                <div className="flex items-center justify-between mb-2.5">
                                                    <label className="block text-xs font-semibold text-slate-800">
                                                        Destination Spatial Layer
                                                    </label>
                                                    <span className="text-[11px] text-slate-400">Click to choose target table</span>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                                    {Object.values(LAYER_METADATA).map((meta) => {
                                                        const isSelected = uploadLayer === meta.id;
                                                        return (
                                                            <div
                                                                key={meta.id}
                                                                onClick={() => setUploadLayer(meta.id)}
                                                                role="button"
                                                                tabIndex="0"
                                                                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setUploadLayer(meta.id); }}
                                                                className={`p-4 rounded-xl border text-left cursor-pointer transition-all duration-150 relative ${isSelected
                                                                        ? "border-blue-600 bg-blue-50/40 text-blue-950 ring-1 ring-blue-600/30 shadow-2xs"
                                                                        : "border-slate-200 hover:border-slate-300 bg-white text-slate-700 hover:bg-slate-50/60 shadow-2xs"
                                                                    }`}
                                                            >
                                                                <div className="flex items-center justify-between gap-2 mb-2">
                                                                    <span className="text-xs font-bold text-slate-900">{meta.title}</span>
                                                                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${isSelected ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 bg-white"
                                                                        }`}>
                                                                        {isSelected && (
                                                                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                                            </svg>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <p className={`text-[11px] font-mono inline-block px-1.5 py-0.5 rounded border truncate max-w-full ${isSelected
                                                                        ? "text-blue-700 bg-blue-100/50 border-blue-200"
                                                                        : "text-slate-600 bg-slate-100 border-slate-200"
                                                                    }`}>
                                                                    {meta.table}
                                                                </p>
                                                                <div className="mt-3 pt-2.5 border-t border-slate-100 text-[10.5px] text-slate-500 font-mono">
                                                                    {meta.geometry}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* File Dropzone */}
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <label className="block text-xs font-semibold text-slate-800">
                                                        Shapefile Archive Package (.zip)
                                                    </label>
                                                    <span className="text-[11px] text-slate-400">Max size: 50 MB</span>
                                                </div>

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
                                                    role="button"
                                                    tabIndex="0"
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter" || e.key === " ") {
                                                            e.preventDefault();
                                                            fileInputRef.current?.click();
                                                        }
                                                    }}
                                                    className={`border-2 border-dashed rounded-xl p-7 text-center cursor-pointer transition-all duration-150 ${isDraggingShape
                                                            ? "border-blue-500 bg-blue-50/70 ring-2 ring-blue-500/20"
                                                            : selectedFile
                                                                ? "border-slate-300 bg-slate-50/40"
                                                                : "border-slate-200 hover:border-slate-300 bg-slate-50/40 hover:bg-slate-50"
                                                        }`}
                                                >
                                                    {selectedFile ? (
                                                        <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 shadow-2xs max-w-lg mx-auto text-left">
                                                            <div className="flex items-center gap-3.5 min-w-0">
                                                                <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs font-mono shrink-0">
                                                                    ZIP
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-bold text-slate-900 truncate">{selectedFile.name}</p>
                                                                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                                                                        {formatBytes(selectedFile.size)} · ESRI Shapefile Bundle
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedFile(null);
                                                                    if (fileInputRef.current) fileInputRef.current.value = null;
                                                                }}
                                                                className="text-xs text-rose-600 hover:text-rose-700 font-medium px-2.5 py-1 rounded-md hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-colors cursor-pointer shrink-0 ml-3"
                                                            >
                                                                Remove
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="max-w-md mx-auto">
                                                            <div className="mx-auto w-11 h-11 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 mb-3 shadow-2xs">
                                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                                                                </svg>
                                                            </div>
                                                            <p className="text-xs text-slate-800 font-semibold">
                                                                Drop your Shapefile archive (.zip) here, or <span className="text-blue-600 hover:underline">browse files</span>
                                                            </p>
                                                            <p className="text-[11px] text-slate-400 mt-1">
                                                                Archive must contain the required core ESRI component files:
                                                            </p>
                                                            <div className="flex items-center justify-center gap-1.5 mt-2.5">
                                                                {['.shp', '.shx', '.dbf', '.prj', '.cpg'].map((ext) => (
                                                                    <span key={ext} className="text-[10px] font-mono bg-white border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded shadow-2xs">
                                                                        {ext}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Submit */}
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
                                                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                                                    <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                                                    </svg>
                                                    <span>
                                                        Operation replaces table records in PostgreSQL schema <code className="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">public</code> and rebuilds spatial indexes.
                                                    </span>
                                                </div>
                                                <button
                                                    type="submit"
                                                    disabled={isUploadingShape || !selectedFile || !uploadLayer}
                                                    className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer gap-2 shrink-0"
                                                >
                                                    {isUploadingShape ? (
                                                        <>
                                                            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                                            <span>Ingesting Shapefile...</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                                            </svg>
                                                            <span>Import Layer Table</span>
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </form>
                                    </div>

                                    {/* Specifications Table */}
                                    <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
                                        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                                            <div>
                                                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Database Layer Specifications</h3>
                                                <p className="text-[11px] text-slate-500 mt-0.5">Physical PostGIS table schema mapping and coordinate projection standards</p>
                                            </div>
                                            <span className="text-[11px] font-mono text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                                                Schema: public
                                            </span>
                                        </div>
                                        <div className="divide-y divide-slate-100 text-xs">
                                            {Object.values(LAYER_METADATA).map((meta) => (
                                                <div key={meta.id} className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                                                    <div>
                                                        <span className="font-bold text-slate-900">{meta.title}</span>
                                                        <p className="text-slate-500 text-[11px] mt-0.5">{meta.desc}</p>
                                                    </div>
                                                    <div className="flex items-center gap-3 font-mono text-[11px] shrink-0 sm:self-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => copyToClipboard(meta.table, meta.id)}
                                                            className="text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                                                            title="Copy table name"
                                                        >
                                                            <span>{copiedKey === meta.id ? "Copied!" : meta.table}</span>
                                                            <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                                                            </svg>
                                                        </button>
                                                        <span className="text-slate-300">·</span>
                                                        <span className="text-slate-500 font-sans">{meta.geometry}</span>
                                                        <span className="text-slate-300">·</span>
                                                        <span className="text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded text-[10.5px]">
                                                            {meta.crs.split(" ")[0]}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── TAB 2: RASTER OVERLAYS ── */}
                            {activeTab === "raster" && (
                                <div className="space-y-6 animate-in fade-in duration-200">
                                    <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
                                        <div className="p-5 sm:p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                            <div className="flex items-start gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 shrink-0 shadow-2xs mt-0.5">
                                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25V6z" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <h2 className="text-sm font-bold text-slate-900">CLUP Raster Tile Deployment</h2>
                                                    <p className="text-xs text-slate-500 mt-0.5">
                                                        Deploy pre-rendered XYZ map tile pyramid directories for multi-scale CLUP zoning overlays.
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="text-[11px] font-mono text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 shrink-0">
                                                XYZ Pyramids · PNG Alpha
                                            </span>
                                        </div>

                                        <form onSubmit={handleTileUploadSubmit} className="p-5 sm:p-6 space-y-5">
                                            {/* Tile Root Specs Box */}
                                            <div className="bg-slate-50/80 p-4 sm:p-5 rounded-xl border border-slate-200/90 shadow-2xs">
                                                <div className="flex items-center justify-between pb-2.5 border-b border-slate-200/80 text-[11px]">
                                                    <span className="font-semibold text-slate-700">Public Tile Destination</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => copyToClipboard("/public/tiles/clup_tiles/{z}/{x}/{y}.png", "tile_path")}
                                                        className="text-slate-700 hover:text-slate-900 bg-white border border-slate-200 px-2.5 py-1 rounded-md shadow-2xs transition-colors cursor-pointer font-medium text-[11px] flex items-center gap-1.5"
                                                    >
                                                        <span>{copiedKey === "tile_path" ? "Copied!" : "Copy Path"}</span>
                                                        <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                                                        </svg>
                                                    </button>
                                                </div>
                                                <div className="pt-3 pb-1 font-mono text-xs text-slate-900 font-semibold select-all">
                                                    /public/tiles/clup_tiles/&#123;z&#125;/&#123;x&#125;/&#123;y&#125;.png
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 mt-3 border-t border-slate-200/80 text-[11px] text-slate-600">
                                                    <div>
                                                        Zoom Range: <strong className="text-slate-800">12–18</strong>
                                                    </div>
                                                    <div>
                                                        Projection: <strong className="text-slate-800">EPSG:3857</strong>
                                                    </div>
                                                    <div>
                                                        Cache Mode: <strong className="text-slate-800">Atomic Swap</strong>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Tile Dropzone */}
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <label className="block text-xs font-semibold text-slate-800">
                                                        Tile Archive Package (.zip)
                                                    </label>
                                                    <span className="text-[11px] text-slate-400">Max size: 200 MB</span>
                                                </div>

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
                                                        if (file) {
                                                            const error = validateZipFile(file, 200 * 1024 * 1024, "tile");
                                                            if (error) {
                                                                setStatusMessage({ type: "error", text: error });
                                                                return;
                                                            }
                                                            setSelectedTileFile(file);
                                                            setStatusMessage(null);
                                                        }
                                                    }}
                                                    role="button"
                                                    tabIndex="0"
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter" || e.key === " ") {
                                                            e.preventDefault();
                                                            tileInputRef.current?.click();
                                                        }
                                                    }}
                                                    className={`border-2 border-dashed rounded-xl p-7 text-center cursor-pointer transition-all duration-150 ${isDraggingTile
                                                            ? "border-blue-500 bg-blue-50/70 ring-2 ring-blue-500/20"
                                                            : selectedTileFile
                                                                ? "border-slate-300 bg-slate-50/40"
                                                                : "border-slate-200 hover:border-slate-300 bg-slate-50/40 hover:bg-slate-50"
                                                        }`}
                                                >
                                                    {selectedTileFile ? (
                                                        <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 shadow-2xs max-w-lg mx-auto text-left">
                                                            <div className="flex items-center gap-3.5 min-w-0">
                                                                <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs font-mono shrink-0">
                                                                    ZIP
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-bold text-slate-900 truncate">{selectedTileFile.name}</p>
                                                                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                                                                        {formatBytes(selectedTileFile.size)} · XYZ Pyramid Bundle
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedTileFile(null);
                                                                    if (tileInputRef.current) tileInputRef.current.value = null;
                                                                }}
                                                                className="text-xs text-rose-600 hover:text-rose-700 font-medium px-2.5 py-1 rounded-md hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-colors cursor-pointer shrink-0 ml-3"
                                                            >
                                                                Remove
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="max-w-md mx-auto">
                                                            <div className="mx-auto w-11 h-11 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 mb-3 shadow-2xs">
                                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                                                                </svg>
                                                            </div>
                                                            <p className="text-xs text-slate-800 font-semibold">
                                                                Drop your tile archive (.zip) here, or <span className="text-blue-600 hover:underline">browse files</span>
                                                            </p>
                                                            <p className="text-[11px] text-slate-400 mt-1">
                                                                Must contain zoom level folders (<code className="font-mono text-slate-600">12/</code> through <code className="font-mono text-slate-600">18/</code>) directly at archive root
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Submit */}
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
                                                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                                                    <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                                                    </svg>
                                                    <span>
                                                        Deployment replaces active tile files in <code className="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">public/tiles/clup_tiles</code> with new pyramids.
                                                    </span>
                                                </div>
                                                <button
                                                    type="submit"
                                                    disabled={isUploadingTile || !selectedTileFile}
                                                    className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer gap-2 shrink-0"
                                                >
                                                    {isUploadingTile ? (
                                                        <>
                                                            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                                            <span>Deploying Tiles...</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                                            </svg>
                                                            <span>Deploy Raster Tiles</span>
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            )}

                            {/* ── TAB 3: SYSTEM INFORMATION ── */}
                            {activeTab === "diagnostics" && (
                                <div className="space-y-6 animate-in fade-in duration-200">
                                    {/* Stats Strip */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                                        {[
                                            { label: "Spatial Engine", value: "PostGIS 3.x" },
                                            { label: "Standard CRS", value: "EPSG:4326" },
                                            { label: "Core Tables", value: "3 Spatial Layers" },
                                            { label: "Raster Cache", value: "XYZ Pyramids" },
                                        ].map((stat) => (
                                            <div key={stat.label} className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs">
                                                <span className="text-[11px] text-slate-500 font-medium block">{stat.label}</span>
                                                <p className="text-sm font-bold text-slate-900 font-mono mt-1.5">{stat.value}</p>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                                        {/* Card 1: Municipal Profile */}
                                        <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
                                            <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                                                <h2 className="text-sm font-bold text-slate-900 tracking-tight">Municipal Administration Scope</h2>
                                                <p className="text-xs text-slate-500 mt-0.5">
                                                    Territorial jurisdiction and institutional planning authority.
                                                </p>
                                            </div>
                                            <div className="divide-y divide-slate-100 text-xs">
                                                {[
                                                    { label: "Municipality", value: "Rosario, Batangas" },
                                                    { label: "Administrative Region", value: "Region IV-A (CALABARZON)" },
                                                    { label: "Administrative Coverage", value: "48 Political Barangays" },
                                                    { label: "Planning Department", value: "Municipal Planning & Development Office (MPDO)" },
                                                    { label: "Cartographic CRS", value: "EPSG:4326 (WGS 84 Geographic)" },
                                                ].map((item) => (
                                                    <div key={item.label} className="p-3.5 sm:px-5 flex items-center justify-between gap-2 hover:bg-slate-50/50 transition-colors">
                                                        <span className="text-slate-500 font-medium">{item.label}</span>
                                                        <span className="text-slate-900 font-medium text-right">{item.value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Card 2: PostGIS & Storage Specs */}
                                        <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
                                            <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                                                <h2 className="text-sm font-bold text-slate-900 tracking-tight">Spatial Database & Storage</h2>
                                                <p className="text-xs text-slate-500 mt-0.5">
                                                    PostgreSQL database extensions, ingestion limits, and local directories.
                                                </p>
                                            </div>
                                            <div className="divide-y divide-slate-100 text-xs">
                                                {[
                                                    { label: "Database Engine", value: "PostgreSQL with PostGIS" },
                                                    { label: "Database Schema", value: "public" },
                                                    { label: "Shapefile Ingestion Utility", value: "shp2pgsql CLI Tool" },
                                                    { label: "Vector Max Package Size", value: "50 MB" },
                                                    { label: "Raster Max Package Size", value: "200 MB" },
                                                    { label: "Ingestion Temp Storage", value: "storage/app/temp_shapefiles", copyable: true },
                                                    { label: "Public Web Tile Directory", value: "public/tiles/clup_tiles", copyable: true },
                                                ].map((item) => (
                                                    <div key={item.label} className="p-3.5 sm:px-5 flex items-center justify-between gap-2 hover:bg-slate-50/50 transition-colors">
                                                        <span className="text-slate-500 font-medium">{item.label}</span>
                                                        {item.copyable ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => copyToClipboard(item.value, item.label)}
                                                                className="text-slate-800 font-mono text-[11px] bg-slate-50 hover:bg-slate-100 px-2 py-0.5 rounded border border-slate-200 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                                                                title="Click to copy path"
                                                            >
                                                                <span>{copiedKey === item.label ? "Copied!" : item.value}</span>
                                                                <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                                                                </svg>
                                                            </button>
                                                        ) : (
                                                            <span className="text-slate-900 font-mono text-[11px] font-medium">{item.value}</span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </main>
                </div>
            </div>

            {/* ── GIS DOCUMENTATION MODAL ── */}
            {guideModalOpen && (
                <div
                    className="fixed inset-0 z-[9999] bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
                    onClick={() => setGuideModalOpen(false)}
                    role="presentation"
                >
                    <div
                        className="bg-white rounded-2xl w-full max-w-lg shadow-xl border border-slate-200 overflow-hidden flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                    >
                        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
                            <div>
                                <h3 className="text-sm font-bold text-slate-900 tracking-tight">GIS Data Documentation</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Ingestion specifications and formatting standards</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setGuideModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Modal Tabs */}
                        <div className="flex space-x-2 border-b border-slate-100 px-5 pt-3 pb-2 text-xs">
                            {[
                                { id: "shapefiles", label: "Shapefiles" },
                                { id: "tiles", label: "Raster Tiles" },
                                { id: "crs", label: "CRS Projection" },
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setGuideTab(tab.id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${guideTab === tab.id
                                            ? "bg-slate-100 text-slate-900 font-semibold"
                                            : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                                        }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        <div className="p-5 text-xs text-slate-600 space-y-3 min-h-[160px] overflow-y-auto max-h-[60vh]">
                            {guideTab === "shapefiles" && (
                                <div className="space-y-2.5">
                                    <p className="font-semibold text-slate-800">Archive Compression Requirements</p>
                                    <p className="text-xs leading-relaxed text-slate-500">
                                        All shapefile archives must be bundled in a single root <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-800">.zip</code> file without any nested subfolders.
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        The archive must contain all four mandatory files sharing identical base filenames:
                                    </p>
                                    <ul className="list-disc list-inside text-xs text-slate-500 space-y-1 font-mono">
                                        <li>.shp (Geometry vectors)</li>
                                        <li>.shx (Spatial index)</li>
                                        <li>.dbf (Attribute table)</li>
                                        <li>.prj (Projection definition)</li>
                                    </ul>
                                </div>
                            )}

                            {guideTab === "tiles" && (
                                <div className="space-y-2.5">
                                    <p className="font-semibold text-slate-800">Raster Tile Structure (XYZ)</p>
                                    <p className="text-xs leading-relaxed text-slate-500">
                                        Tiles generated via QGIS or GDAL2Tiles must have zoom level folders (12 to 18) placed directly at the root of the ZIP archive.
                                    </p>
                                    <div className="bg-slate-50 p-3 rounded-lg font-mono text-xs text-slate-700 border border-slate-200/80">
                                        tiles.zip/<br />
                                        ├── 12/3421/1984.png<br />
                                        ├── 13/...<br />
                                        └── 18/...
                                    </div>
                                </div>
                            )}

                            {guideTab === "crs" && (
                                <div className="space-y-2.5">
                                    <p className="font-semibold text-slate-800">Coordinate Reference System</p>
                                    <p className="text-xs leading-relaxed text-slate-500">
                                        All spatial tables in iMAPS are standardized in <b>EPSG:4326 (WGS 84 Geographic Coordinates)</b>.
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        The ingestion process automatically converts and indexes datasets to WGS 84 using <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-800">shp2pgsql -s 4326</code>.
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setGuideModalOpen(false)}
                                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}