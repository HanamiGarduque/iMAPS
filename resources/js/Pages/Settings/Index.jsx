import React, { useState, useEffect, useRef } from "react";
import { Head, router } from "@inertiajs/react";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import { confirmSignOut } from "@/utils/signOut";

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

// Section ids in state ↔ friendly names in the URL (?section=vector|raster|system).
const SECTION_PARAMS = { spatial: "vector", raster: "raster", diagnostics: "system" };

// Reads the file names inside a .zip from its central directory, without extracting
// it or adding a library. Throws on archives it can't read (e.g. ZIP64), in which case
// the caller skips the check and leaves validation to the server.
async function listZipEntries(file) {
    const tailSize = Math.min(file.size, 65557);
    const tail = new DataView(await file.slice(file.size - tailSize).arrayBuffer());
    let eocd = -1;
    for (let i = tail.byteLength - 22; i >= 0; i--) {
        if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("Not a readable zip archive");
    const count = tail.getUint16(eocd + 10, true);
    const cdSize = tail.getUint32(eocd + 12, true);
    const cdOffset = tail.getUint32(eocd + 16, true);
    if (count === 0xffff || cdOffset === 0xffffffff) throw new Error("ZIP64 archive");
    const cd = new DataView(await file.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
    const decoder = new TextDecoder();
    const names = [];
    for (let p = 0, n = 0; n < count && p + 46 <= cd.byteLength; n++) {
        if (cd.getUint32(p, true) !== 0x02014b50) break;
        const nameLen = cd.getUint16(p + 28, true);
        const extraLen = cd.getUint16(p + 30, true);
        const commentLen = cd.getUint16(p + 32, true);
        names.push(decoder.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen)).replace(/\\/g, "/"));
        p += 46 + nameLen + extraLen + commentLen;
    }
    return names;
}

const hasUnsafePath = (names) => names.some((n) => n.includes("../") || n.startsWith("/"));

// Mirrors SettingsController::uploadShapefile: first .shp, plus same-named .shx/.dbf/.prj/.cpg.
function checkShapefileEntries(names) {
    if (hasUnsafePath(names)) return { ok: false, message: "The archive contains an unsafe file path." };
    const shp = names.find((n) => n.endsWith(".shp"));
    if (!shp) return { ok: false, message: "No .shp file found in the archive." };
    const base = shp.slice(0, -4);
    const missing = ["shx", "dbf", "prj", "cpg"].filter((ext) => !names.includes(`${base}.${ext}`)).map((ext) => `.${ext}`);
    return missing.length
        ? { ok: false, message: `Missing ${missing.join(", ")} next to ${shp.split("/").pop()}.` }
        : { ok: true, message: "All required Shapefile parts found." };
}

// Mirrors SettingsController::uploadRasterTiles.
function checkTileEntries(names) {
    if (hasUnsafePath(names)) return { ok: false, message: "The archive contains an unsafe file path." };
    const tiles = names.filter((n) => /\.(png|jpe?g|webp)$/i.test(n)).length;
    return tiles
        ? { ok: true, message: `${tiles.toLocaleString()} map tiles found.` }
        : { ok: false, message: "No PNG, JPG or WebP map tiles found in the archive." };
}

const formatWhen = (iso) =>
    new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) +
    " · " +
    new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });

const timeNow = () => new Date().toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });

const historyLine = (entry) =>
    entry?.updated_at
        ? `Updated ${formatWhen(entry.updated_at)}${entry.updated_by ? ` · ${entry.updated_by}` : ""}`
        : "No upload recorded yet";

const CHECK_STYLES = {
    checking: "text-slate-500",
    ok: "text-blue-700",
    error: "text-red-600",
    unknown: "text-slate-500",
};

// The chosen .zip, with the result of the in-browser contents check underneath.
const SelectedFileRow = ({ file, size, check, onRemove, disabled }) => (
    <div className={`rounded-lg border bg-white ${check?.status === "error" ? "border-red-200" : "border-slate-200"}`}>
        <div className="flex items-center justify-between gap-3 p-3">
            <div className="flex items-center gap-3 min-w-0">
                <span className="grid place-items-center w-9 h-9 rounded-lg bg-blue-50 text-blue-700 text-[10px] font-bold font-mono shrink-0">ZIP</span>
                <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">{file.name}</p>
                    <p className="text-[11px] text-slate-500">{size}</p>
                </div>
            </div>
            <button
                type="button"
                onClick={onRemove}
                disabled={disabled}
                className="text-xs font-semibold text-slate-500 hover:text-red-600 px-2 py-1 rounded-md hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
            >
                Remove
            </button>
        </div>
        {check && (
            <p role="status" className={`flex items-center gap-1.5 px-3 py-2 border-t border-slate-100 text-[11px] font-medium ${CHECK_STYLES[check.status]}`}>
                {check.status === "checking" && <span className="w-3 h-3 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />}
                {check.status === "ok" && (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                )}
                {check.status === "error" && (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                )}
                {check.message}
            </p>
        )}
    </div>
);

// Shown only when the server kept a copy from before the last upload.
const RestoreNotice = ({ entry, onRestore, disabled }) =>
    entry?.has_backup ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-[11.5px] text-slate-600">
            <span className="flex items-center gap-2">
                <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                </svg>
                <span>
                    Previous version saved{entry.backup_at ? <> from <b className="font-semibold text-slate-800">{formatWhen(entry.backup_at)}</b></> : ""}.
                </span>
            </span>
            <button
                type="button"
                onClick={onRestore}
                disabled={disabled}
                className="self-start sm:self-auto px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
            >
                Restore
            </button>
        </div>
    ) : null;

// Sticky footer: note + submit; turns into a progress bar while this section is uploading.
const ActionBar = ({ note, working, lockedElsewhere, progress, canSubmit, idleLabel, workingLabel }) => (
    <div className="sticky bottom-0 border-t border-slate-100 bg-slate-50/90 backdrop-blur">
        {working && (
            <div className="h-1 bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? undefined} aria-label="Upload progress">
                <div className={`h-full bg-blue-600 transition-all duration-300 ${progress == null ? "w-full animate-pulse" : ""}`} style={progress != null ? { width: `${progress}%` } : undefined} />
            </div>
        )}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 px-6 py-3.5">
            <p className="text-[11px] text-slate-500" aria-live="polite">
                {working
                    ? progress != null && progress < 100
                        ? `Uploading… ${progress}%`
                        : "Upload complete. Processing on the server — this can take a minute."
                    : lockedElsewhere
                        ? "Another upload is in progress. Please wait for it to finish."
                        : note}
            </p>
            <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
                {working && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {working ? workingLabel : idleLabel}
            </button>
        </div>
    </div>
);

export default function Settings({ auth = {}, layerHistory = {} }) {
    const [clock, setClock] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [activeTab, setActiveTab] = useState(() => {
        const param = new URLSearchParams(window.location.search).get("section");
        return Object.keys(SECTION_PARAMS).find((id) => SECTION_PARAMS[id] === param) || "spatial";
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

    // ── Zip pre-checks, upload progress, restore ──
    const [shapeCheck, setShapeCheck] = useState(null); // null | { status: 'checking'|'ok'|'error'|'unknown', message }
    const [tileCheck, setTileCheck] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(null); // 0–100 while sending, null otherwise
    const [isRestoring, setIsRestoring] = useState(false);
    // Only one upload or restore at a time.
    const busy = isUploadingShape || isUploadingTile || isRestoring;

    // Keep the open section in the address so it can be linked or bookmarked.
    // Inertia keeps its page data in history.state, so that state is passed through unchanged.
    useEffect(() => {
        const url = new URL(window.location.href);
        url.searchParams.set("section", SECTION_PARAMS[activeTab]);
        window.history.replaceState(window.history.state, "", url);
    }, [activeTab]);

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
    const handleLogout = confirmSignOut;

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

    // Size/type check, then read the archive's file list and report what's missing before uploading.
    const selectZip = async (file, { maxBytes, label, check, setFile, setCheck }) => {
        const error = validateZipFile(file, maxBytes, label);
        if (error) {
            Swal.fire({
                icon: "error",
                title: "Cannot upload this file",
                text: error,
                customClass: { popup: "rounded-2xl", confirmButton: "bg-blue-600 text-white px-4 py-2 rounded-lg text-xs" },
            });
            return false;
        }
        setFile(file);
        setStatusMessage(null);
        setCheck({ status: "checking", message: "Checking archive contents…" });
        try {
            const result = check(await listZipEntries(file));
            setCheck({ status: result.ok ? "ok" : "error", message: result.message });
        } catch {
            setCheck({ status: "unknown", message: "Contents couldn't be checked here; they'll be checked on upload." });
        }
        return true;
    };

    const selectShapeFile = (file) =>
        selectZip(file, { maxBytes: 50 * 1024 * 1024, label: "shapefile", check: checkShapefileEntries, setFile: setSelectedFile, setCheck: setShapeCheck });

    const selectTileFile = (file) =>
        selectZip(file, { maxBytes: 200 * 1024 * 1024, label: "tile", check: checkTileEntries, setFile: setSelectedTileFile, setCheck: setTileCheck });

    const clearShapeFile = () => {
        setSelectedFile(null);
        setShapeCheck(null);
        if (fileInputRef.current) fileInputRef.current.value = null;
    };

    const clearTileFile = () => {
        setSelectedTileFile(null);
        setTileCheck(null);
        if (tileInputRef.current) tileInputRef.current.value = null;
    };

    const handleShapefileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!(await selectShapeFile(file)) && e.target) e.target.value = null;
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
        if (file && !busy) selectShapeFile(file);
    };

    // Shared request options: progress bar while the file is sent, unlock when done.
    const uploadOptions = (setUploading) => ({
        forceFormData: true,
        preserveScroll: true,
        onStart: () => setUploading(true),
        onProgress: (event) => setUploadProgress(event?.percentage ?? null),
        onFinish: () => {
            setUploading(false);
            setUploadProgress(null);
        },
    });

    // Undo the last upload: puts back the version that was saved just before it.
    const handleRestore = ({ url, data = {}, name, backupAt }) => {
        if (busy) return;
        Swal.fire({
            title: `Restore previous ${name}?`,
            html: `
                <div class="text-left text-xs text-slate-600 space-y-2 mt-2">
                    <p>The current ${name} will be replaced by the version saved${backupAt ? ` from <b>${formatWhen(backupAt)}</b>` : ""} before the last upload.</p>
                    <p class="text-slate-400">This can only be done once per upload.</p>
                </div>
            `,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Restore",
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
            if (!res.isConfirmed) return;
            router.post(url, data, {
                preserveScroll: true,
                onStart: () => setIsRestoring(true),
                onFinish: () => setIsRestoring(false),
                onSuccess: () => setStatusMessage({ type: "success", text: `Previous ${name} restored · ${timeNow()}` }),
                onError: (errors) => setStatusMessage({ type: "error", text: errors.restore || "The previous version could not be restored." }),
            });
        });
    };

    const handleUploadSubmit = (e) => {
        e.preventDefault();
        if (busy) return;
        if (!uploadLayer || !selectedFile) {
            setStatusMessage({ type: "error", text: "Please select a target layer and choose a valid ZIP bundle." });
            return;
        }
        if (shapeCheck?.status === "error" || shapeCheck?.status === "checking") return;

        const layerInfo = LAYER_METADATA[uploadLayer] || { title: uploadLayer };

        Swal.fire({
            title: `Replace ${layerInfo.title}?`,
            html: `
                <div class="text-left text-xs text-slate-600 space-y-2 mt-2">
                    <p>This will replace the <b>${layerInfo.title}</b> layer with the contents of <b>${selectedFile.name}</b>.</p>
                    <p class="text-slate-400">The current version is kept, so you can restore it if something looks wrong.</p>
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
                const formData = new FormData();
                formData.append("layer_type", uploadLayer);
                formData.append("shapefile_zip", selectedFile);

                router.post("/settings/upload-shapefile", formData, {
                    ...uploadOptions(setIsUploadingShape),
                    onSuccess: () => {
                        clearShapeFile();
                        setStatusMessage({ type: "success", text: `${layerInfo.title} updated · ${timeNow()}` });
                        Swal.fire({
                            icon: "success",
                            title: "Layer Updated",
                            text: `Successfully imported shapefile into ${layerInfo.table || uploadLayer}.`,
                            customClass: { popup: "rounded-2xl", confirmButton: "bg-blue-600 text-white px-4 py-2 rounded-lg text-xs" },
                        });
                    },
                    onError: (errors) => {
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
    const handleTileFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!(await selectTileFile(file)) && e.target) e.target.value = null;
    };

    const handleTileUploadSubmit = (e) => {
        e.preventDefault();
        if (busy) return;
        if (!selectedTileFile) {
            setStatusMessage({ type: "error", text: "Please choose a valid raster tile ZIP archive." });
            return;
        }
        if (tileCheck?.status === "error" || tileCheck?.status === "checking") return;

        Swal.fire({
            title: "Deploy Raster Overlay?",
            html: `
                <div class="text-left text-xs text-slate-600 space-y-2 mt-2">
                    <p>This will replace the CLUP map tiles with the contents of <b>${selectedTileFile.name}</b>.</p>
                    <p class="text-slate-400">The current tiles are kept, so you can restore them if something looks wrong.</p>
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
                const formData = new FormData();
                formData.append("tiles_zip", selectedTileFile);

                router.post("/settings/upload-tiles", formData, {
                    ...uploadOptions(setIsUploadingTile),
                    onSuccess: () => {
                        clearTileFile();
                        setStatusMessage({ type: "success", text: `CLUP map tiles updated · ${timeNow()}` });
                        Swal.fire({
                            icon: "success",
                            title: "Tiles Deployed",
                            text: "CLUP raster map tiles successfully updated in the public directory.",
                            customClass: { popup: "rounded-2xl", confirmButton: "bg-blue-600 text-white px-4 py-2 rounded-lg text-xs" },
                        });
                    },
                    onError: (errors) => {
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
            <Head title="Settings | iMAPS" />

            <style>{`
                
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

                    <main className="flex-1 w-full h-full flex flex-col overflow-hidden bg-white">
                        <div className="flex-1 flex flex-col h-full min-h-0 w-full">

                            {/* ── NOTIFICATION ALERT ── */}
                            {statusMessage && (
                                <div
                                    role="status"
                                    className={`flex items-center justify-between gap-3 mx-6 mt-4 rounded-xl border px-4 py-3 text-xs font-medium transition-all shrink-0 ${statusMessage.type === "success"
                                            ? "border-blue-200 bg-blue-50 text-blue-800"
                                            : "border-rose-200 bg-rose-50 text-rose-800"
                                        }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full ${statusMessage.type === "success" ? "bg-blue-500" : "bg-rose-500"}`} />
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

                            {/* Settings layout: section menu on the left, one section shown at a time on the right. */}
                            <div className="bg-white overflow-hidden flex-1 min-h-0 grid md:grid-cols-[240px_1fr]">

                                {/* ── SECTION MENU ── */}
                                <nav aria-label="Settings sections" className="border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50/60 px-3 py-5 flex md:flex-col gap-5 overflow-x-auto">
                                    <h1 className="hidden md:block px-2.5 text-lg font-bold text-slate-900 tracking-tight">Settings</h1>
                                    {[
                                        {
                                            group: "Map data",
                                            items: [
                                                { id: "spatial", label: "Vector layers", icon: "M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3" },
                                                { id: "raster", label: "Raster overlays", icon: "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" },
                                            ],
                                        },
                                        {
                                            group: "System",
                                            items: [
                                                { id: "diagnostics", label: "System information", icon: "M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" },
                                            ],
                                        },
                                    ].map((g) => (
                                        <div key={g.group} className="shrink-0">
                                            <p className="px-2.5 mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-400">{g.group}</p>
                                            <div className="flex md:flex-col gap-0.5">
                                                {g.items.map((item) => {
                                                    const on = activeTab === item.id;
                                                    return (
                                                        <button
                                                            key={item.id}
                                                            type="button"
                                                            onClick={() => setActiveTab(item.id)}
                                                            aria-current={on ? "page" : undefined}
                                                            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-left whitespace-nowrap transition-colors cursor-pointer ${on ? "bg-white text-blue-700 font-semibold shadow-xs ring-1 ring-slate-200/80" : "text-slate-600 hover:bg-white/70 hover:text-slate-900"}`}
                                                        >
                                                            <svg className={`w-4 h-4 shrink-0 ${on ? "text-blue-600" : "text-slate-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                                                            </svg>
                                                            {item.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </nav>

                                {/* ── SECTION CONTENT (scrolls inside the panel) ── */}
                                <div className="min-h-0 overflow-y-auto">

                                {/* ── VECTOR LAYERS ── */}
                                {activeTab === "spatial" && (
                                    <form onSubmit={handleUploadSubmit} className="flex flex-col min-h-full">
                                        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
                                            <h2 className="text-base font-bold text-slate-900">Vector layers</h2>
                                            <p className="mt-0.5 text-xs text-slate-500">Replace a map layer by uploading a new Shapefile (.zip).</p>
                                        </div>

                                        <div className="px-6 py-5 space-y-6 flex-1">
                                            {/* Step 1 */}
                                            <fieldset>
                                                <legend className="flex items-center gap-2 mb-3 text-xs font-semibold text-slate-800">
                                                    <span className="grid place-items-center w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold">1</span>
                                                    Choose the layer to replace
                                                </legend>
                                                <div className="grid sm:grid-cols-2 gap-2">
                                                    {Object.values(LAYER_METADATA).map((meta) => {
                                                        const on = uploadLayer === meta.id;
                                                        return (
                                                            <label
                                                                key={meta.id}
                                                                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors focus-within:ring-4 focus-within:ring-blue-600/10 ${on ? "border-blue-600 bg-blue-50/50" : "border-slate-200 hover:border-slate-300 bg-white"}`}
                                                            >
                                                                <input
                                                                    type="radio"
                                                                    name="upload_layer"
                                                                    value={meta.id}
                                                                    checked={on}
                                                                    onChange={() => setUploadLayer(meta.id)}
                                                                    className="sr-only"
                                                                />
                                                                <span className={`mt-0.5 grid place-items-center w-4 h-4 rounded-full border shrink-0 ${on ? "border-blue-600 bg-blue-600" : "border-slate-300"}`} aria-hidden="true">
                                                                    {on && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                                                                </span>
                                                                <span className="min-w-0">
                                                                    <span className={`block text-xs font-semibold ${on ? "text-blue-700" : "text-slate-900"}`}>{meta.title}</span>
                                                                    <span className={`block mt-0.5 text-[11px] truncate ${layerHistory[meta.id]?.updated_at ? "text-slate-500" : "text-slate-400 italic"}`}>
                                                                        {historyLine(layerHistory[meta.id])}
                                                                    </span>
                                                                </span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                                <div className="mt-3 empty:hidden">
                                                    <RestoreNotice
                                                        entry={layerHistory[uploadLayer]}
                                                        disabled={busy}
                                                        onRestore={() => handleRestore({
                                                            url: "/settings/restore-layer",
                                                            data: { layer_type: uploadLayer },
                                                            name: `${LAYER_METADATA[uploadLayer]?.title} layer`,
                                                            backupAt: layerHistory[uploadLayer]?.backup_at,
                                                        })}
                                                    />
                                                </div>
                                            </fieldset>

                                            {/* Step 2 */}
                                            <div>
                                                <p className="flex items-center gap-2 mb-3 text-xs font-semibold text-slate-800">
                                                    <span className="grid place-items-center w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold">2</span>
                                                    Upload the Shapefile
                                                    <span className="ml-auto text-[11px] font-normal text-slate-400">.zip · max 50 MB</span>
                                                </p>
                                                <input type="file" accept=".zip" ref={fileInputRef} onChange={handleShapefileChange} className="hidden" />
                                                {selectedFile ? (
                                                    <SelectedFileRow
                                                        file={selectedFile}
                                                        size={formatBytes(selectedFile.size)}
                                                        check={shapeCheck}
                                                        onRemove={clearShapeFile}
                                                        disabled={busy}
                                                    />
                                                ) : (
                                                    <div
                                                        onClick={() => !busy && fileInputRef.current?.click()}
                                                        onDragOver={handleShapeDragOver}
                                                        onDragLeave={handleShapeDragLeave}
                                                        onDrop={handleShapeDrop}
                                                        role="button"
                                                        tabIndex={busy ? -1 : 0}
                                                        aria-disabled={busy}
                                                        onKeyDown={(e) => { if (!busy && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); fileInputRef.current?.click(); } }}
                                                        className={`flex items-center gap-3 p-4 rounded-lg border-2 border-dashed transition-colors ${busy ? "opacity-50 cursor-not-allowed border-slate-200" : isDraggingShape ? "cursor-pointer border-blue-500 bg-blue-50/60" : "cursor-pointer border-slate-200 hover:border-blue-300 hover:bg-blue-50/30"}`}
                                                    >
                                                        <span className="grid place-items-center w-9 h-9 rounded-lg bg-slate-100 text-slate-500 shrink-0">
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                                            </svg>
                                                        </span>
                                                        <div>
                                                            <p className="text-xs text-slate-700">
                                                                <span className="font-semibold text-blue-600">Choose a file</span> or drag it here
                                                            </p>
                                                            <p className="mt-0.5 text-[11px] text-slate-400">Must include .shp, .shx, .dbf, .prj and .cpg</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <ActionBar
                                            note="The current version is kept so you can restore it."
                                            working={isUploadingShape}
                                            lockedElsewhere={busy && !isUploadingShape}
                                            progress={uploadProgress}
                                            canSubmit={!busy && !!selectedFile && !!uploadLayer && shapeCheck?.status !== "error" && shapeCheck?.status !== "checking"}
                                            idleLabel="Import layer"
                                            workingLabel="Importing…"
                                        />
                                    </form>
                                )}

                                {/* ── RASTER OVERLAYS ── */}
                                {activeTab === "raster" && (
                                    <form onSubmit={handleTileUploadSubmit} className="flex flex-col min-h-full">
                                        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
                                            <h2 className="text-base font-bold text-slate-900">Raster overlays</h2>
                                            <p className="mt-0.5 text-xs text-slate-500">Update the CLUP zoning map tiles by uploading a tile archive (.zip).</p>
                                        </div>

                                        <div className="px-6 py-5 space-y-6 flex-1">
                                            <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px rounded-lg overflow-hidden border border-slate-200 bg-slate-200 text-xs">
                                                {[
                                                    { k: "Last updated", v: layerHistory.clup_tiles?.updated_at ? formatWhen(layerHistory.clup_tiles.updated_at) : "Not recorded yet", sans: true, sub: layerHistory.clup_tiles?.updated_by },
                                                    { k: "Destination", v: "public/tiles/clup_tiles", copy: "/public/tiles/clup_tiles/{z}/{x}/{y}.png" },
                                                    { k: "Zoom levels", v: "12 – 18" },
                                                    { k: "Projection", v: "EPSG:3857" },
                                                ].map((row) => (
                                                    <div key={row.k} className="bg-white px-3.5 py-2.5 min-w-0">
                                                        <dt className="text-[11px] text-slate-500">{row.k}{row.sub ? ` · ${row.sub}` : ""}</dt>
                                                        <dd className={`mt-0.5 flex items-center gap-1.5 text-slate-900 truncate ${row.sans ? "text-xs font-medium" : "font-mono text-[11.5px]"}`}>
                                                            {row.v}
                                                            {row.copy && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => copyToClipboard(row.copy, "tile_path")}
                                                                    className="font-sans text-[10.5px] font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
                                                                >
                                                                    {copiedKey === "tile_path" ? "Copied" : "Copy"}
                                                                </button>
                                                            )}
                                                        </dd>
                                                    </div>
                                                ))}
                                            </dl>

                                            <RestoreNotice
                                                entry={layerHistory.clup_tiles}
                                                disabled={busy}
                                                onRestore={() => handleRestore({
                                                    url: "/settings/restore-tiles",
                                                    name: "map tiles",
                                                    backupAt: layerHistory.clup_tiles?.backup_at,
                                                })}
                                            />

                                            <div>
                                                <p className="flex items-center gap-2 mb-3 text-xs font-semibold text-slate-800">
                                                    Upload tile archive
                                                    <span className="ml-auto text-[11px] font-normal text-slate-400">.zip · max 200 MB</span>
                                                </p>
                                                <input type="file" accept=".zip" ref={tileInputRef} onChange={handleTileFileChange} className="hidden" />
                                                {selectedTileFile ? (
                                                    <SelectedFileRow
                                                        file={selectedTileFile}
                                                        size={formatBytes(selectedTileFile.size)}
                                                        check={tileCheck}
                                                        onRemove={clearTileFile}
                                                        disabled={busy}
                                                    />
                                                ) : (
                                                    <div
                                                        onClick={() => !busy && tileInputRef.current?.click()}
                                                        onDragOver={(e) => { e.preventDefault(); setIsDraggingTile(true); }}
                                                        onDragLeave={(e) => { e.preventDefault(); setIsDraggingTile(false); }}
                                                        onDrop={(e) => {
                                                            e.preventDefault();
                                                            setIsDraggingTile(false);
                                                            const file = e.dataTransfer.files?.[0];
                                                            if (file && !busy) selectTileFile(file);
                                                        }}
                                                        role="button"
                                                        tabIndex={busy ? -1 : 0}
                                                        aria-disabled={busy}
                                                        onKeyDown={(e) => { if (!busy && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); tileInputRef.current?.click(); } }}
                                                        className={`flex items-center gap-3 p-4 rounded-lg border-2 border-dashed transition-colors ${busy ? "opacity-50 cursor-not-allowed border-slate-200" : isDraggingTile ? "cursor-pointer border-blue-500 bg-blue-50/60" : "cursor-pointer border-slate-200 hover:border-blue-300 hover:bg-blue-50/30"}`}
                                                    >
                                                        <span className="grid place-items-center w-9 h-9 rounded-lg bg-slate-100 text-slate-500 shrink-0">
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                                            </svg>
                                                        </span>
                                                        <div>
                                                            <p className="text-xs text-slate-700">
                                                                <span className="font-semibold text-blue-600">Choose a file</span> or drag it here
                                                            </p>
                                                            <p className="mt-0.5 text-[11px] text-slate-400">Zoom folders 12/ to 18/ must be at the top of the archive</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <ActionBar
                                            note="The current tiles are kept so you can restore them."
                                            working={isUploadingTile}
                                            lockedElsewhere={busy && !isUploadingTile}
                                            progress={uploadProgress}
                                            canSubmit={!busy && !!selectedTileFile && tileCheck?.status !== "error" && tileCheck?.status !== "checking"}
                                            idleLabel="Deploy tiles"
                                            workingLabel="Deploying…"
                                        />
                                    </form>
                                )}

                                {/* ── SYSTEM INFORMATION ── */}
                                {activeTab === "diagnostics" && (
                                    <div>
                                        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
                                            <h2 className="text-base font-bold text-slate-900">System information</h2>
                                            <p className="mt-0.5 text-xs text-slate-500">Read-only details about this iMAPS installation.</p>
                                        </div>
                                        <div className="px-6 py-5 space-y-6">
                                            {[
                                                {
                                                    title: "Municipality",
                                                    rows: [
                                                        { k: "Municipality", v: "Rosario, Batangas" },
                                                        { k: "Region", v: "Region IV-A (CALABARZON)" },
                                                        { k: "Barangays", v: "48" },
                                                        { k: "Planning office", v: "MPDO" },
                                                    ],
                                                },
                                                {
                                                    title: "Database & storage",
                                                    rows: [
                                                        { k: "Database", v: "PostgreSQL + PostGIS", mono: true },
                                                        { k: "Coordinate system", v: "EPSG:4326 (WGS 84)", mono: true },
                                                        { k: "Vector upload limit", v: "50 MB" },
                                                        { k: "Raster upload limit", v: "200 MB" },
                                                        { k: "Temporary uploads", v: "storage/app/temp_shapefiles", mono: true, copy: true },
                                                        { k: "Tile folder", v: "public/tiles/clup_tiles", mono: true, copy: true },
                                                    ],
                                                },
                                            ].map((group) => (
                                                <section key={group.title}>
                                                    <h3 className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-400">{group.title}</h3>
                                                    <dl className="rounded-lg border border-slate-200 divide-y divide-slate-100 text-xs">
                                                        {group.rows.map((row) => (
                                                            <div key={row.k} className="flex items-center justify-between gap-4 px-4 py-2.5">
                                                                <dt className="text-slate-500">{row.k}</dt>
                                                                <dd className={`flex items-center gap-2 text-right text-slate-900 ${row.mono ? "font-mono text-[11.5px]" : "font-medium"}`}>
                                                                    {row.v}
                                                                    {row.copy && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => copyToClipboard(row.v, row.k)}
                                                                            className="font-sans text-[10.5px] font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
                                                                        >
                                                                            {copiedKey === row.k ? "Copied" : "Copy"}
                                                                        </button>
                                                                    )}
                                                                </dd>
                                                            </div>
                                                        ))}
                                                    </dl>
                                                </section>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                </div>
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        </>
    );
}