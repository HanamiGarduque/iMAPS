// resources/js/Pages/Site Inspections/Show.jsx
import React, { useState, useEffect } from "react";
import { Link, Head, router, usePage } from "@inertiajs/react";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import Modal from "@/Components/Modal";
import { resolveBackTarget, readRegistryQuery } from "@/Components/folderOrigin";
import PhotoLightbox from "@/Components/PhotoLightbox";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import MapSkeleton from "@/Components/Maps/MapSkeleton";
import RetryDeliveryButton from "@/Components/RetryDeliveryButton";
import { confirmSignOut } from "@/utils/signOut";

// ── Status Badge Configuration ──
const STATUS_LABELS = {
    assigned:      "Assigned",
    in_progress:   "In Progress",
    completed:     "Completed",
};

const formatStatus = (status) => {
    const key = (status || "").toLowerCase().replace(/-/g, "_");
    return STATUS_LABELS[key] || status || "Unknown";
};

const STATUS_CONFIG = {
    assigned:       { bg: "bg-amber-50 text-amber-700 border-amber-200/70", dot: "bg-amber-500" },
    in_progress:    { bg: "bg-blue-50 text-blue-700 border-blue-200/70", dot: "bg-blue-500" },
    completed:      { bg: "bg-emerald-50 text-emerald-700 border-emerald-200/70", dot: "bg-emerald-500" },
};

function StatusBadge({ status }) {
    const key = (status || "").toLowerCase().replace(/-/g, "_");
    const cfg = STATUS_CONFIG[key] || { bg: "bg-slate-100 text-slate-700 border-slate-200", dot: "bg-slate-400" };
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.bg}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} shrink-0`} />
            {formatStatus(status)}
        </span>
    );
}

// ── GeoJSON Sanitizer Utility ──
const hasValidCoords = (coords) => {
    if (!coords) return false;
    if (Array.isArray(coords)) {
        if (coords.length === 2 && typeof coords[0] === "number") {
            return !isNaN(coords[0]) && !isNaN(coords[1]);
        }
        return coords.length > 0 && coords.every(hasValidCoords);
    }
    return false;
};

const sanitizeGeoJSON = (geojson) => {
    if (!geojson || !geojson.features) return geojson;
    const validFeatures = geojson.features.filter((feature) => {
        try {
            if (!feature.geometry || !hasValidCoords(feature.geometry.coordinates)) {
                return false;
            }
            const layer = L.geoJSON(feature);
            const bounds = layer.getBounds();
            const sw = bounds?.getSouthWest();
            const ne = bounds?.getNorthEast();

            return sw && ne && !isNaN(sw.lat) && !isNaN(sw.lng) && !isNaN(ne.lat) && !isNaN(ne.lng);
        } catch (e) {
            return false;
        }
    });
    return { ...geojson, features: validFeatures };
};

// ── Custom Map Bounds Controller ──
function MapController({ brgyData, activeParcelFeature }) {
    const map = useMap();

    useEffect(() => {
        try {
            if (activeParcelFeature) {
                const layer = L.geoJSON(activeParcelFeature);
                const bounds = layer.getBounds();
                if (bounds.isValid()) {
                    // Top-left padding keeps the lot clear of the parcel card.
                    map.flyToBounds(bounds, { paddingTopLeft: [24, 84], paddingBottomRight: [24, 24], maxZoom: 18, duration: 1.2 });
                    map.once("moveend", () => {
                        map.dragging.disable();
                        map.touchZoom.disable();
                        map.doubleClickZoom.disable();
                        map.scrollWheelZoom.disable();
                        map.boxZoom.disable();
                        map.keyboard.disable();
                        if (map.tap) map.tap.disable();
                    });
                }
            } else if (brgyData) {
                const layer = L.geoJSON(brgyData);
                const bounds = layer.getBounds();
                if (bounds.isValid()) {
                    map.fitBounds(bounds, { padding: [30, 30] });
                }
            }
        } catch (error) {}
    }, [brgyData, activeParcelFeature, map]);

    return null;
}

// ── Sync outcome tone ──
/**
 * Pick the banner tone for a scoped-sync outcome message.
 *
 * The controller reports every completed run through the SUCCESS flash key,
 * because the ACTION succeeded. That is not the same as the DATA changing:
 * "no completed FieldSync result available" and "already up to date" both mean
 * nothing was imported, and showing those in a green success banner would
 * claim a change that did not happen.
 *
 * Classified on the message the server sent, so this stays in step with
 * describeSyncOutcome() instead of restating the outcome vocabulary here.
 */
function outcomeTone(message) {
    const m = String(message || "").toLowerCase();
    if (m.includes("could not") || m.includes("failed")) return "error";
    if (
        m.includes("nothing was changed") ||
        m.includes("no local change") ||
        m.includes("no change was confirmed") ||
        m.includes("could not be interpreted")
    ) {
        return "info";
    }
    return "ok";
}


// ── Inline icon set (outline, 24px grid) ──
const ICON_PATHS = {
    calendar: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
    flag: "M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5",
    user: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z",
    pin: "M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z",
    doc: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
    review: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    send: "M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5",
    history: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
    support: "M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z",
    overview: "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z",
    photo: "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z",
    map: "M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z",
    briefcase: "M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z",
    gps: "M12 21a9 9 0 100-18 9 9 0 000 18zm0-5.25a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5zM12 3v2.25M12 18.75V21M3 12h2.25M18.75 12H21",
    sync: "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99",
    download: "M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4",
    info: "M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z",
    alert: "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z",
    check: "M4.5 12.75l6 6 9-13.5",
    x: "M6 18L18 6M6 6l12 12",
    chevronDown: "M19.5 8.25l-7.5 7.5-7.5-7.5",
    chevronRight: "M8.25 4.5l7.5 7.5-7.5 7.5",
    chevronLeft: "M15.75 19.5L8.25 12l7.5-7.5",
    external: "M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25",
};

function Icon({ name, className = "w-4 h-4", strokeWidth = 1.8 }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={strokeWidth} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS[name]} />
        </svg>
    );
}

// ── Spec-sheet row: label left, value right, dashed rule between rows ──
function InfoRow({ label, value, mono = false }) {
    return (
        <div className="flex items-baseline justify-between gap-6 py-2 border-b border-slate-100 min-w-0">
            <dt className="text-[12px] text-slate-500 shrink-0">{label}</dt>
            <dd className={`text-[13px] font-semibold text-slate-900 text-right break-words min-w-0 ${mono ? "font-mono text-[12px]" : ""}`}>{value || "—"}</dd>
        </div>
    );
}

// ── Inspection report ──
// FieldSync sends some answers as "Label: value. Label: value." Split those
// into labelled lines; anything else is shown exactly as written.
function splitLabelled(text) {
    const parts = String(text).split(/\.\s+(?=[A-Z][^:.]{0,40}:\s)/).map((p) => p.replace(/\.$/, "").trim());
    if (parts.length < 2) return null;
    const pairs = parts.map((p) => p.match(/^([A-Z][^:.]{0,40}):\s+(.+)$/s));
    return pairs.every(Boolean) ? pairs.map(([, label, value]) => [label, value]) : null;
}

function ReportValue({ value, alert }) {
    const pairs = splitLabelled(value);
    if (pairs) {
        return (
            <dl className="space-y-1">
                {pairs.map(([label, v]) => (
                    <div key={label} className="flex flex-wrap gap-x-2">
                        <dt className="text-slate-500">{label}:</dt>
                        <dd className="font-medium text-slate-900">{v}</dd>
                    </div>
                ))}
            </dl>
        );
    }
    return <p className={`whitespace-pre-line ${alert ? "text-rose-900" : "text-slate-800"}`}>{value}</p>;
}

// ── Panel with a small caps heading ──
function Panel({ title, icon = null, aside = null, className = "", children }) {
    return (
        <section className={`bg-white rounded-lg border border-slate-200 ${className}`}>
            {title && (
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-100">
                    <h3 className="flex items-center gap-2 text-[13px] font-bold text-slate-900">
                        {icon && (
                            <span className="grid place-items-center w-5 h-5 rounded-md bg-blue-50 text-blue-600">
                                <Icon name={icon} className="w-3 h-3" strokeWidth={2.2} />
                            </span>
                        )}
                        {title}
                    </h3>
                    {aside}
                </div>
            )}
            {children}
        </section>
    );
}

// ── Progress node shared by the vertical and horizontal trackers ──
// Each state reads at a glance: a filled check is done, an open ring is not
// reached, a ringed dot is the step in hand, a cross is a failed delivery.
function StepNode({ state, complete = false }) {
    if (state === "done") {
        return (
            <span className={`relative z-10 w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-white ${complete ? "bg-emerald-600" : "bg-blue-600"}`} aria-hidden="true">
                <Icon name="check" className="w-2.5 h-2.5" strokeWidth={3.5} />
            </span>
        );
    }
    if (state === "error") {
        return (
            <span className="relative z-10 w-4 h-4 rounded-full flex items-center justify-center shrink-0 bg-rose-600 text-white" aria-hidden="true">
                <Icon name="x" className="w-2.5 h-2.5" strokeWidth={3.5} />
            </span>
        );
    }
    return (
        <span
            className={`relative z-10 w-4 h-4 rounded-full flex items-center justify-center shrink-0 bg-white ring-inset ${state === "current" ? "ring-[1.5px] ring-blue-600" : "ring-1 ring-slate-300"}`}
            aria-hidden="true"
        >
            {state === "current" && <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
        </span>
    );
}

const TILE_TONES = {
    slate: { chip: "bg-slate-100 text-slate-500" },
    blue: { chip: "bg-blue-50 text-blue-600" },
    emerald: { chip: "bg-emerald-50 text-emerald-600" },
    amber: { chip: "bg-amber-50 text-amber-600" },
    rose: { chip: "bg-rose-50 text-rose-600" },
};

// ── Main Page Component ──
export default function Show({ auth, inspection, applicationSupport = null }) {
    const ins = inspection || {};
    const app = ins.zoning_application || {};
    const inspector = ins.inspector || {};
    const parcel = ins.parcel || {};

    const userName = auth?.user?.name || "Planning Officer";
    const userRole = auth?.user?.role || "Planning Officer";

    // PHASE 2B2B: round identity comes from the server, which resolves it as one
    // PARCEL's visit sequence via InspectionRoundNumbering. This page computes
    // NOTHING about the round. `round_number` is null for a historical row whose
    // parcel was never recorded: no round is displayed, and the record says so.
    const roundNumber = ins.round_number ?? null;
    const roundLabel = ins.round_kind || "Inspection";
    const roundNote = ins.round_note || null;
    const isHistoricalRound = roundNumber === null && roundLabel === "Historical Inspection";

    // PHASE 2B2C: server-resolved Planning Officer review for THIS round.
    // Read, never derived here.
    const review = usePage().props?.poReview || null;

    // PHASE 2B2D: read-only operations context, all server-resolved.
    //   delivery     - canonical delivery condition + attempt evidence
    //   roundHistory - THIS parcel's canonical chain, navigable
    // The global diagnostics count the server may still send is deliberately
    // NOT read: it has no application-specific meaning on one lot's record.
    const { delivery = null, roundHistory = null, canRetry = false, resendClosed = false } = usePage().props || {};

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [clock, setClock] = useState("");

    // Where this round was opened from, taken from the query string rather than
    // inferred from browser history, so a refresh or a pasted link behaves the
    // same as a click. A folder origin returns to THAT applicant folder; no origin
    // falls back to the registry root and invents nothing.
    const registryQuery = readRegistryQuery(usePage().url || "");
    const backTarget = resolveBackTarget({
        search: usePage().url || "",
        registryPath: "/site-inspections",
        rootLabel: "All Inspections",
        // Opened from the list view: return to the list with its filters intact.
        origins: {
            list: {
                path: registryQuery ? `/site-inspections?${registryQuery}` : "/site-inspections",
                label: "All Inspections",
            },
        },
        // Restore the registry filters and page, minus the origin markers.
        registryQuery,
    });
    const [activeTab, setActiveTab] = useState("inspection");

    // Geospatial state. The map exists to locate THIS parcel, so nothing is
    // loaded for a round with no parcel on record.
    const targetPin = parcel?.property_index_number?.trim() || "";
    const [brgyMapData, setBrgyMapData] = useState(null);
    const [parcelMapData, setParcelMapData] = useState(null);
    const [activeParcelFeature, setActiveParcelFeature] = useState(null);
    const [pinLookupMap, setPinLookupMap] = useState({});
    const rosarioCenter = [13.7850, 121.2500];

    useEffect(() => {
        if (!targetPin) return;

        fetch("/api/map/barangay_boundary")
            .then((res) => res.json())
            .then((data) => setBrgyMapData(sanitizeGeoJSON(data)))
            .catch(() => {});

        fetch("/api/map/land_parcels")
            .then((res) => {
                if (!res.ok) throw new Error("Unable to load land parcel layer");
                return res.json();
            })
            .then((data) => {
                const sanitized = sanitizeGeoJSON(data);
                setParcelMapData(sanitized);

                const lookupMap = {};
                (sanitized?.features || []).forEach((feature) => {
                    const pin = feature?.properties?.property_index_number?.trim();
                    if (!pin) return;
                    lookupMap[pin] = feature;
                });
                setPinLookupMap(lookupMap);
            })
            .catch(() => {});
    }, [targetPin]);

    useEffect(() => {
        if (targetPin && pinLookupMap[targetPin]) {
            setActiveParcelFeature(pinLookupMap[targetPin]);
        } else {
            setActiveParcelFeature(null);
        }
    }, [pinLookupMap, targetPin]);

    const mapLoading = Boolean(targetPin) && (!parcelMapData || !brgyMapData);
    const parcelNotOnMap = Boolean(targetPin) && Boolean(parcelMapData) && !activeParcelFeature;

    const [inspectionPhotos, setInspectionPhotos] = useState([]);
    const [loadingPhotos, setLoadingPhotos] = useState(false);
    const [syncing, setSyncing] = useState(false);

    // Scoped sync confirmation + outcome feedback. The confirmation is the
    // shared in-app Modal, not window.confirm(): the native dialog cannot show
    // the note about what this action does and does not do.
    const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);

    // Outcome banner state. `info` is the neutral tone: NO_REMOTE_RESULT and
    // NO_CHANGE mean "nothing was changed", which is not a success.
    const [syncOutcome, setSyncOutcome] = useState(null);

    // Full-size viewer state, plus per-thumbnail load failures so a dead image
    // reports itself instead of rendering as a browser broken-image icon.
    const [lightboxIndex, setLightboxIndex] = useState(null);
    const [brokenPhotos, setBrokenPhotos] = useState({});
    const markPhotoBroken = (idx) => setBrokenPhotos((prev) => ({ ...prev, [idx]: true }));

    useEffect(() => {
        if (!ins.id) return;
        setLoadingPhotos(true);
        fetch(`/api/inspections/${ins.id}/supabase-data`)
            .then((res) => {
                if (!res.ok) throw new Error("Failed to fetch");
                return res.json();
            })
            .then((data) => {
                if (data && data.field_job_photos) {
                    setInspectionPhotos(data.field_job_photos);
                } else {
                    setInspectionPhotos([]);
                }
                setBrokenPhotos({});
            })
            .catch((err) => {
                console.error("Failed to fetch inspection photos:", err);
                setInspectionPhotos([]);
            })
            .finally(() => setLoadingPhotos(false));
    }, [ins.id]);

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

    const handleLogout = confirmSignOut;

    /**
     * Issue the scoped sync and surface the outcome.
     *
     * Every completion path must leave the Admin with a visible answer. The
     * outcome is read from the flash the controller already sets, so the server
     * stays the single source of truth for the wording. `onFinish` clears the
     * busy state on success AND on failure; `onError` covers a refusal or a
     * network failure, where no flash exists at all.
     */
    const runScopedSync = () => {
        setSyncConfirmOpen(false);
        setSyncing(true);
        setSyncOutcome(null);

        router.post(`/site-inspections/${ins.id}/sync-from-fieldsync`, {}, {
            preserveScroll: true,
            onSuccess: (page) => {
                const f = page?.props?.flash;
                const message = f?.error || f?.success;
                if (message) {
                    // The controller reports "nothing was changed" through the
                    // SUCCESS key, because the action completed correctly. The
                    // wording still has to read as neutral, not as a win.
                    setSyncOutcome({
                        tone: f?.error ? "error" : outcomeTone(message),
                        message,
                    });
                } else {
                    // Completed, but the server sent no outcome at all. That is
                    // not a success and must not be presented as one.
                    setSyncOutcome({
                        tone: "warn",
                        message:
                            "Sync ran but no outcome was reported. Nothing was changed.",
                    });
                }
            },
            onError: () => {
                setSyncOutcome({
                    tone: "error",
                    message:
                        "Sync from FieldSync could not be completed. Nothing was changed.",
                });
            },
            onFinish: () => setSyncing(false),
        });
    };

    const formatDate = (d) => {
        if (!d) return "—";
        return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
    };

    const brgyStyle = {
        color: "#2563eb",
        weight: 1.5,
        opacity: 0.6,
        fillOpacity: 0.03,
        fillColor: "#3b82f6",
    };

    const getParcelStyle = (feature) => {
        const isActive = activeParcelFeature && activeParcelFeature.properties?.property_index_number === feature.properties?.property_index_number;
        return {
            color: isActive ? "#dc2626" : "#94a3b8",
            weight: isActive ? 2.5 : 0.8,
            opacity: isActive ? 1 : 0.7,
            fillOpacity: isActive ? 0.35 : 0.04,
            fillColor: isActive ? "#ef4444" : "#64748b",
        };
    };

    // ── Lifecycle of this round, from recorded facts only ──
    // Each step reads one stored field or the canonical delivery state. A step
    // with no evidence is shown as not reached; nothing is inferred.
    // A done step shows when it happened (`when`), always as a full stamp
    // ("Oct 11 · 1:17 PM"; the year only when it isn't this year), so no row
    // depends on the one above it. `note` is a second, quieter line: the
    // scheduled visit, or what a step not yet reached is waiting on.
    const isDateOnly = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
    const stampOf = (d) => {
        if (!d) return null;
        const dt = new Date(d);
        if (Number.isNaN(dt.getTime())) return null;
        const day = dt.toLocaleDateString("en-PH", {
            month: "short",
            day: "numeric",
            ...(dt.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
        });
        return isDateOnly(d) ? day : `${day} · ${dt.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}`;
    };
    const isCompleted = (ins.status || "").toLowerCase() === "completed";
    const isDelivered = delivery?.state === "delivered";
    const deliveryStep = !delivery
        ? { label: "Send to FieldSync", state: "todo", note: "No delivery record" }
        : delivery.is_failure
          ? { label: "FieldSync delivery failed", state: "error", note: delivery.label }
          : isDelivered
            ? { label: "Delivered to FieldSync", state: "done", at: delivery.delivered_at }
            : delivery.state === "pending_delivery"
              ? { label: "Sending to FieldSync", state: "current", note: delivery.label }
              : { label: "Send to FieldSync", state: "todo", note: delivery.label };
    const reportDone = Boolean(ins.submitted_at);
    const roundDone = isCompleted || Boolean(ins.completed_at);
    const steps = [
        { key: "assigned", label: "Assigned", state: "done", at: ins.created_at, note: ins.scheduled_date ? `Visit set for ${formatDate(ins.scheduled_date)}` : null },
        { key: "delivery", ...deliveryStep },
        reportDone
            ? { key: "report", label: "Report submitted", state: "done", at: ins.submitted_at }
            : { key: "report", label: "Inspection report", state: isDelivered ? "current" : "todo", note: isDelivered ? "Waiting on the inspector" : "Not yet" },
        roundDone
            ? { key: "completed", label: "Completed", state: "done", at: ins.completed_at }
            : { key: "completed", label: "Completion", state: reportDone ? "current" : "todo", note: reportDone ? "Awaiting completion" : "Not yet" },
    ].map((step) => ({
        ...step,
        when: step.state === "done" ? (stampOf(step.at) || "Time not recorded") : null,
    }));
    // Every step recorded: the whole track settles into its finished colour.
    const allStepsDone = steps.every((s) => s.state === "done");
    const stepsDoneCount = steps.filter((s) => s.state === "done").length;
    const doneLine = allStepsDone ? "bg-emerald-600" : "bg-blue-600";

    const hasFindings = Boolean(
        ins.findings || ins.recommendation || ins.remarks || ins.inspection_result || ins.observations ||
        ins.discrepancies || ins.recommendations || ins.inspector_notes
    );

    // Report body, in reading order. The result is shown separately as the
    // headline. A field whose text repeats an earlier one is not shown twice.
    const seenReportText = new Set();
    const reportRows = [
        ["Findings", ins.findings, false],
        ["Observations", ins.observations, false],
        ["Discrepancies", ins.discrepancies, true],
        ["Recommendation", ins.recommendation, false],
        ["Recommendations", ins.recommendations, false],
        ["Remarks", ins.remarks, false],
        ["Inspector notes", ins.inspector_notes, false],
    ].filter(([, value]) => {
        const key = String(value || "").trim().toLowerCase();
        if (!key || seenReportText.has(key)) return false;
        seenReportText.add(key);
        return true;
    });

    // What happens to the result: the Planning Officer's decision on THIS
    // round, exactly as the server linked it. Nothing is inferred; with no
    // linked decision the page says so.
    const poStatus = review?.po_decision
        ? {
              label: review.po_decision,
              sub: [review.po_decision_reviewer && `By ${review.po_decision_reviewer}`, review.po_decision_date && formatDate(review.po_decision_date)].filter(Boolean).join(" · "),
              tone: "text-violet-800",
          }
        : review?.round_decision_anomaly
          ? { label: "Needs attention", sub: review.round_decision_anomaly.message, tone: "text-amber-700" }
          : reportDone
            ? { label: "Not yet decided", sub: null, tone: "text-slate-900" }
            : null;

    const TABS = [
        { key: "inspection", label: "Overview" },
        { key: "photos", label: "Photos", count: loadingPhotos ? null : inspectionPhotos.length },
        { key: "parcel", label: "Parcel" },
        { key: "application", label: "Application" },
    ];

    const inspectorInitials = String(inspector.name || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((part, i, all) => (i === 0 || i === all.length - 1 ? part[0] : ""))
        .join("")
        .toUpperCase();

    // The Admin sync explanation is disclosed on demand; the confirm dialog
    // repeats it before anything runs.
    const [adminInfoOpen, setAdminInfoOpen] = useState(false);

    const TAB_ICONS = { inspection: "overview", photos: "photo", parcel: "map", application: "briefcase" };

    const deliveryTone = !delivery
        ? "slate"
        : delivery.is_failure
          ? "rose"
          : delivery.state === "delivered"
            ? "emerald"
            : delivery.state === "pending_delivery"
              ? "amber"
              : "slate";

    // Status list: one row per operations section, in the fixed order
    // Delivery -> Round History -> Application Support. A row carries the
    // headline; its full text expands under it. A failed delivery starts open.
    // A clean delivery is already a step in Progress, so it gets no row here.
    const [openTile, setOpenTile] = useState(() => (delivery?.is_failure ? "delivery" : null));

    const tiles = [];
    if (delivery && !isDelivered) {
        // PHASE 2B2D, READ ONLY. Every word comes from the canonical
        // InspectionDeliveryStatus vocabulary. `no_delivery_record` stays
        // NEUTRAL. No retry, re-deliver or assignment control is mounted here.
        tiles.push({
            key: "delivery",
            icon: "send",
            label: "Delivery & FieldSync",
            value: delivery.label,
            tone: deliveryTone,
            body: (
                <>
                    <p>{delivery.message}</p>
                    <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-1.5 text-[12px]">
                        <div><dt className="text-slate-400">Attempts</dt><dd className="font-bold text-slate-900 tabular-nums">{delivery.attempt_count}</dd></div>
                        {delivery.last_attempt_at && (
                            <div><dt className="text-slate-400">Last attempt</dt><dd className="font-semibold text-slate-800">{delivery.last_attempt_at}</dd></div>
                        )}
                        {delivery.delivered_at && (
                            <div><dt className="text-slate-400">Delivered</dt><dd className="font-semibold text-slate-800">{delivery.delivered_at}</dd></div>
                        )}
                    </dl>
                    {delivery.is_failure && delivery.failure_category && (
                        <p className="mt-2 text-[12px] text-rose-700 leading-relaxed bg-rose-50 rounded-lg px-3 py-2">
                            <span className="font-semibold capitalize">{delivery.failure_category.replace(/_/g, " ")}</span>
                            {delivery.failure_message ? ` — ${delivery.failure_message}` : ""}
                        </p>
                    )}

                    {/* Only where the server said this viewer may resend. */}
                    {canRetry && (
                        <div className="mt-2 flex justify-end">
                            <RetryDeliveryButton inspectionId={inspection.id} />
                        </div>
                    )}
                    {resendClosed && (
                        <p className="mt-2 text-[11.5px] text-slate-500 leading-relaxed">
                            Resending is only possible until the day before the scheduled inspection date.
                        </p>
                    )}
                </>
            ),
        });
    }
    if (roundHistory) {
        // PHASE 2B2D. The canonical (application, parcel) chain, so a round's
        // siblings are always the SAME lot's visits.
        tiles.push({
            key: "rounds",
            icon: "history",
            label: "Round history",
            value: !roundHistory.available
                ? "Unavailable"
                : roundHistory.rounds.length === 0
                  ? "Only round for this parcel"
                  : `${roundHistory.rounds.length} rounds`,
            tone: roundHistory.available && roundHistory.rounds.length > 0 ? "blue" : "slate",
            body: !roundHistory.available ? (
                <p>Round history unavailable. {roundHistory.unavailable_reason}</p>
            ) : roundHistory.rounds.length === 0 ? null : (
                <ul className="-mx-2 space-y-0.5">
                    {roundHistory.rounds.map((r) => {
                        // A round assigned by another Planning Officer is listed
                        // for context but not linked: the server would refuse it.
                        const rowClass = `flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 transition-colors ${
                            r.is_current ? "bg-blue-50 ring-1 ring-blue-200" : r.viewable === false ? "" : "hover:bg-slate-50"
                        }`;
                        const content = (
                            <>
                                <span className="min-w-0">
                                    <span className={`block text-[12.5px] font-semibold ${r.is_current ? "text-blue-900" : "text-slate-900"}`}>
                                        {r.round_number != null ? `Round ${r.round_number}` : r.round_kind}
                                        <span className={`font-normal ${r.is_current ? "text-blue-700/70" : "text-slate-500"}`}>
                                            {" · "}
                                            {r.round_number != null ? r.round_kind : r.round_note}
                                        </span>
                                    </span>
                                    <span className={`block text-[11.5px] ${r.is_current ? "text-blue-700/70" : "text-slate-500"}`}>
                                        {r.display_status}
                                        {r.scheduled_date && ` · ${r.scheduled_date}`}
                                    </span>
                                </span>
                                <span className="flex flex-col items-end gap-0.5 shrink-0">
                                    {r.is_current && (
                                        <span className="text-[9.5px] font-bold uppercase tracking-wider text-blue-600">Current</span>
                                    )}
                                    <span className={`text-[10.5px] font-mono ${r.is_current ? "text-blue-700/60" : "text-slate-400"}`}>INS-{r.inspection_id}</span>
                                </span>
                            </>
                        );
                        return (
                            <li key={r.inspection_id}>
                                {r.viewable === false ? (
                                    <div className={rowClass} aria-current={r.is_current ? "true" : undefined}>
                                        {content}
                                    </div>
                                ) : (
                                    <Link
                                        href={`/site-inspections/${r.inspection_id}`}
                                        className={rowClass}
                                        aria-current={r.is_current ? "true" : undefined}
                                    >
                                        {content}
                                    </Link>
                                )}
                            </li>
                        );
                    })}
                </ul>
            ),
        });
    }
    tiles.push({
        key: "support",
        icon: "support",
        label: "Application support",
        value: !applicationSupport?.ok
            ? "Could not be loaded"
            : applicationSupport.total === 0
              ? "No reports"
              : `${applicationSupport.total} support ${applicationSupport.total === 1 ? "request" : "requests"}`,
        tone: !applicationSupport?.ok ? "amber" : applicationSupport.total > 0 ? "blue" : "slate",
        body: !applicationSupport?.ok ? (
            <p role="alert" className="text-amber-800">{applicationSupport?.message || "Application support could not be loaded."}</p>
        ) : applicationSupport.total === 0 ? null : (
            <>
                <dl className="grid grid-cols-2 gap-3 text-[12px]">
                    <div><dt className="text-slate-400">Latest category</dt><dd className="font-semibold text-slate-800">{applicationSupport.latest.support_category_label}</dd></div>
                    <div><dt className="text-slate-400">Reported by</dt><dd className="font-semibold text-slate-800">{applicationSupport.latest.inspector?.label || "Unresolved inspector"}</dd></div>
                    <div><dt className="text-slate-400">Status</dt><dd className="font-semibold text-slate-800">{({ submitted: "Submitted", in_review: "In review", resolved: "Resolved", wont_fix: "Won’t fix" })[applicationSupport.latest.status] || "Unknown"}</dd></div>
                    <div><dt className="text-slate-400">Current Planning Officer</dt><dd className="font-semibold text-slate-800">{applicationSupport.latest.context?.owner?.name || "Not assigned"}</dd></div>
                </dl>
                <Link href={applicationSupport.url} className="mt-3 inline-flex items-center h-8 px-3 rounded-lg bg-blue-600 text-white text-[12px] font-semibold hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
                    View Application Support
                </Link>
            </>
        ),
    });

    // Round context, worded for staff as a "visit" (1st visit, 2nd visit).
    // No fabricated number for a historical row: it is labelled and explained
    // instead.
    const visitOrdinal = (n) => {
        const s = ["th", "st", "nd", "rd"];
        const v = Number(n) % 100;
        return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
    };
    // "1st visit" already says it is the original inspection; only a
    // reinspection's kind adds anything.
    const roundText = roundNumber
        ? roundLabel === "Original Inspection"
            ? `${visitOrdinal(roundNumber)} visit`
            : `${visitOrdinal(roundNumber)} visit · ${roundLabel}`
        : isHistoricalRound
          ? `${roundLabel} · ${roundNote || "Parcel not recorded"}`
          : roundLabel;

    return (
        <>
            <Head title={`Inspection: ${ins.id || "Detail"} | iMAPS`} />
            <style>{`

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
                .leaflet-container { width: 100%; height: 100%; z-index: 0; }
            `}</style>

            <div id="dashboard-root" className="bg-slate-50 font-sans text-slate-800 h-screen flex flex-col overflow-hidden">
                {/* ── UNIFIED NAVBAR ── */}
                <Header
                    userName={userName}
                    userRole={userRole}
                    clock={clock}
                    onLogout={handleLogout}
                    sidebarOpen={sidebarOpen}
                    setSidebarOpen={setSidebarOpen}
                />

                <div className="flex-1 overflow-hidden relative flex flex-col min-w-0">
                    <Sidebar
                        userName={userName}
                        userRole={userRole}
                        sidebarOpen={sidebarOpen}
                        setSidebarOpen={setSidebarOpen}
                        onLogout={handleLogout}
                        activePage="site-inspections"
                    />

                    {sidebarOpen && (
                        <div
                            onClick={() => setSidebarOpen(false)}
                            className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px] z-[750] transition-opacity duration-300"
                        />
                    )}

                    {/* ── THE INSPECTION CASE FILE ──
                        Wide screens: sized to the viewport, nothing scrolls but the
                        columns whose content outgrows them. Narrow screens: one scroll. */}
                    <main id="inspection-record" className="flex-1 min-h-0 w-full overflow-y-auto lg:overflow-hidden relative">
                        <div className="max-w-[1580px] mx-auto w-full lg:h-full flex flex-col gap-3 p-4 lg:p-5 short:p-3 short:gap-2.5">

                            {/* ══ COVER: identity on the left, the parcel itself on the right ══ */}
                            <div className="shrink-0 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,46%)] gap-3 short:gap-2.5">
                                <section className="min-w-0 bg-white rounded-xl border border-slate-200 px-5 py-3.5 short:py-3 flex flex-col">
                                    {/* Breadcrumb. The back control returns to the list view
                                        or the applicant folder this round was opened from;
                                        with no origin it falls back to the registry root. */}
                                    <div className="flex items-center gap-2 min-w-0 text-[12px]">
                                        <Link
                                            href={backTarget.href}
                                            className="inline-flex items-center gap-1 h-7 pl-1.5 pr-2.5 -ml-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 font-medium transition-colors shrink-0"
                                            title={
                                                backTarget.folder
                                                    ? `Return to the ${backTarget.folder} folder`
                                                    : "Return to All Inspections"
                                            }
                                        >
                                            <Icon name="chevronLeft" className="w-3.5 h-3.5" strokeWidth={2.5} />
                                            <span className="max-w-[190px] truncate">{backTarget.label}</span>
                                        </Link>
                                        <span className="hidden md:inline text-slate-300" aria-hidden="true">/</span>
                                        {/* The application reference is shown in the
                                            details below (Reference Number); the INS id
                                            stays a quiet secondary key. */}
                                        <span className="hidden md:inline font-mono text-[11px] text-slate-400" title="Internal inspection record id">
                                            INS-{ins.id || "—"}
                                        </span>
                                    </div>

                                    <div className="mt-2.5 short:mt-2 min-w-0">
                                        <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-blue-600 truncate">
                                            {roundText}
                                        </p>
                                        <div className="mt-1 flex items-center gap-2.5 min-w-0">
                                            <h1 className="text-[24px] short:text-[20px] leading-tight font-bold tracking-tight text-slate-900 truncate">
                                                {app.applicant_name || "—"}
                                            </h1>
                                            <span className="shrink-0"><StatusBadge status={ins.status} /></span>
                                        </div>
                                        {app.application_type && (
                                            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[12.5px] text-slate-500">
                                                <span className="inline-flex items-center gap-1.5 min-w-0">
                                                    <Icon name="briefcase" className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                    <span className="truncate">{app.application_type}</span>
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* People and dates, as one ruled strip */}
                                    <dl className="mt-auto pt-3.5 short:pt-2.5">
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 border-t border-slate-100 pt-3 short:pt-2.5">
                                            <div className="pr-4 min-w-0">
                                                <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">Inspector</dt>
                                                <dd className="mt-1 flex items-center gap-2 min-w-0">
                                                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center shrink-0" aria-hidden="true">
                                                        {inspectorInitials || "?"}
                                                    </span>
                                                    <span className="text-[13px] font-semibold text-slate-900 truncate">{inspector.name || "Unassigned"}</span>
                                                </dd>
                                            </div>
                                            {[
                                                ["Scheduled", ins.scheduled_date ? formatDate(ins.scheduled_date) : null],
                                                ["Deadline", ins.deadline_date ? formatDate(ins.deadline_date) : null],
                                            ].map(([label, value]) => (
                                                <div key={label} className="pr-4 sm:pl-4 sm:border-l border-slate-100 min-w-0">
                                                    <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                                                    <dd className="mt-1 text-[13px] font-semibold text-slate-900 truncate leading-5">{value || "—"}</dd>
                                                </div>
                                            ))}
                                        </div>
                                    </dl>
                                </section>

                                {/* The map exists to locate THIS parcel */}
                                <section className="relative min-h-[240px] lg:min-h-0 rounded-xl border border-slate-200 bg-slate-100 overflow-hidden" aria-label="Parcel location">
                                    {targetPin ? (
                                        <>
                                            <div className="absolute inset-0">
                                                <MapContainer center={rosarioCenter} zoom={11} minZoom={11} maxBounds={[[13.65, 121.12], [13.92, 121.36]]} maxBoundsViscosity={1.0} zoomControl={false} scrollWheelZoom={false}>
                                                    <TileLayer
                                                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                                    />
                                                    {brgyMapData && <GeoJSON data={brgyMapData} style={brgyStyle} />}
                                                    {/* Neighbouring lots are only drawn once the map is
                                                        on THIS parcel; at municipal zoom every parcel at
                                                        once is unreadable. */}
                                                    {parcelMapData && activeParcelFeature && <GeoJSON key={activeParcelFeature.properties?.property_index_number || "parcels"} data={parcelMapData} style={getParcelStyle} />}
                                                    <MapController brgyData={brgyMapData} activeParcelFeature={activeParcelFeature} />
                                                </MapContainer>
                                            </div>
                                            <MapSkeleton visible={mapLoading} label="Locating parcel…" tone="#f2f3f5" />

                                            {/* Parcel card */}
                                            <div className="absolute top-3 left-3 z-[470] max-w-[calc(100%-24px)] rounded-lg bg-white/95 border border-slate-200 shadow-sm px-3 py-2">
                                                <p className="flex items-center gap-1.5 font-mono text-[11.5px] font-semibold text-slate-800 truncate">
                                                    <Icon name="pin" className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                                    PIN {parcel.property_index_number}
                                                </p>
                                                <dl className="mt-1.5 grid grid-cols-3 gap-4">
                                                    {[
                                                        ["Lot", parcel.lot_number],
                                                        ["Area", parcel.lot_area_sqm ? `${parcel.lot_area_sqm} sq.m` : null],
                                                        ["Barangay", parcel.barangay || app.barangay],
                                                    ].map(([label, value]) => (
                                                        <div key={label} className="min-w-0">
                                                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                                                            <dd className="text-[12px] font-semibold text-slate-900 whitespace-nowrap">{value || "—"}</dd>
                                                        </div>
                                                    ))}
                                                </dl>
                                            </div>

                                            {parcelNotOnMap && (
                                                <p className="absolute bottom-6 left-3 right-3 z-[470] bg-white px-3 py-2 rounded-lg border border-amber-200 text-[12px] text-amber-800 shadow-sm">
                                                    This parcel's boundary is not on the map layer yet.
                                                </p>
                                            )}
                                        </>
                                    ) : (
                                        <div className="absolute inset-0 bg-slate-50 flex flex-col items-center justify-center text-center px-8">
                                            <span className="w-11 h-11 rounded-xl bg-white border border-slate-200 text-slate-400 flex items-center justify-center">
                                                <Icon name="map" className="w-5 h-5" strokeWidth={1.6} />
                                            </span>
                                            <p className="mt-2.5 text-[13px] font-bold text-slate-900">No parcel on record</p>
                                            <p className="mt-0.5 max-w-xs text-[12px] text-slate-500 leading-relaxed">
                                                This inspection round was recorded without a parcel, so there is no lot to show on the map.
                                            </p>
                                        </div>
                                    )}
                                </section>
                            </div>

                            {/* ══ WORKSPACE: folder tabs over progress | record | case status ══ */}
                            <div className="lg:flex-1 lg:min-h-0 bg-white rounded-xl border border-slate-200 flex flex-col overflow-hidden">
                                <div className="bg-slate-100/80 border-b border-slate-200 shrink-0">
                                    <div className="flex items-end gap-1 px-4 pt-2.5 short:pt-2 overflow-x-auto" role="tablist" aria-label="Inspection record">
                                        {TABS.map((tab) => {
                                            const isActive = activeTab === tab.key;
                                            return (
                                                <button
                                                    key={tab.key}
                                                    type="button"
                                                    role="tab"
                                                    aria-selected={isActive}
                                                    onClick={() => setActiveTab(tab.key)}
                                                    className={`relative -mb-px flex items-center gap-2 px-4 py-2.5 short:py-2 rounded-t-xl border text-[12.5px] font-semibold whitespace-nowrap transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                                        isActive
                                                            ? "bg-white border-slate-200 border-b-white text-blue-700"
                                                            : "bg-slate-50 border-slate-200/70 hover:bg-white/70 text-slate-500 hover:text-slate-800"
                                                    }`}
                                                >
                                                    <Icon name={TAB_ICONS[tab.key]} className="w-4 h-4" />
                                                    {tab.label}
                                                    {tab.count != null && (
                                                        <span className={`text-[10.5px] font-bold tabular-nums px-1.5 py-px rounded-full ${isActive ? "bg-blue-700 text-white" : "bg-slate-200 text-slate-600"}`}>
                                                            {tab.count}
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[210px_minmax(0,1fr)_340px] 2xl:grid-cols-[220px_minmax(0,1fr)_380px]">

                                    {/* ── PROGRESS (wide screens): a vertical journey ──
                                        From recorded facts only; a step with no evidence is
                                        shown as not reached, nothing is inferred. */}
                                    <aside aria-label="Inspection progress" className="hidden xl:block min-h-0 overflow-y-auto border-r border-slate-200 p-4 short:p-3">
                                        <div className="flex items-baseline justify-between gap-2 mb-4 short:mb-3">
                                            <h2 className="text-[13px] font-bold text-slate-900">Progress</h2>
                                            {!allStepsDone && (
                                                <span className="text-[11px] font-semibold tabular-nums text-slate-400">
                                                    {stepsDoneCount} of {steps.length}
                                                </span>
                                            )}
                                        </div>
                                        <ol>
                                            {steps.map((step, idx) => (
                                                <li
                                                    key={step.key}
                                                    className="relative flex gap-3 pb-5 short:pb-3.5 last:pb-0"
                                                    aria-current={step.state === "current" ? "step" : undefined}
                                                >
                                                    {idx < steps.length - 1 && (
                                                        <span className={`absolute left-[7.5px] top-5 bottom-1 w-px ${step.state === "done" ? doneLine : "bg-slate-200"}`} aria-hidden="true" />
                                                    )}
                                                    <span className="mt-px shrink-0"><StepNode state={step.state} complete={allStepsDone} /></span>
                                                    <div className="min-w-0">
                                                        <p className={`text-[12.5px] font-semibold leading-[18px] ${step.state === "error" ? "text-rose-700" : step.state === "todo" ? "text-slate-400" : "text-slate-800"}`}>
                                                            {step.label}
                                                        </p>
                                                        {step.when && (
                                                            <p className="text-[11.5px] leading-snug mt-0.5 tabular-nums text-slate-500">{step.when}</p>
                                                        )}
                                                        {step.note && (
                                                            <p className={`text-[11.5px] leading-snug mt-0.5 ${step.state === "error" ? "text-rose-600" : "text-slate-400"}`}>{step.note}</p>
                                                        )}
                                                    </div>
                                                </li>
                                            ))}
                                        </ol>
                                    </aside>

                                    {/* ── PRIMARY RECORD ── */}
                                    <div className="min-w-0 lg:min-h-0 lg:overflow-y-auto p-4 short:p-3 space-y-3">
                                        {/* Progress (narrower screens): the same steps, across */}
                                        <ol className="xl:hidden grid grid-cols-4 rounded-lg border border-slate-200 px-4 py-3" aria-label="Inspection progress">
                                            {steps.map((step, idx) => (
                                                <li key={step.key} className="min-w-0" aria-current={step.state === "current" ? "step" : undefined}>
                                                    <div className="flex items-center">
                                                        <StepNode state={step.state} complete={allStepsDone} />
                                                        {idx < steps.length - 1 && (
                                                            <span className={`flex-1 h-px mx-2 ${step.state === "done" ? doneLine : "bg-slate-200"}`} aria-hidden="true" />
                                                        )}
                                                    </div>
                                                    <p className={`mt-1.5 pr-2 text-[12px] font-semibold leading-snug ${step.state === "error" ? "text-rose-700" : step.state === "todo" ? "text-slate-400" : "text-slate-800"}`}>
                                                        {step.label}
                                                    </p>
                                                    {(step.when || step.note) && (
                                                        <p className={`pr-2 text-[11px] leading-snug tabular-nums ${step.state === "error" ? "text-rose-600" : step.when ? "text-slate-500" : "text-slate-400"}`}>
                                                            {step.when || step.note}
                                                        </p>
                                                    )}
                                                </li>
                                            ))}
                                        </ol>

                                        {/* ── Overview Tab ── */}
                                        {activeTab === "inspection" && (
                                            <>
                                                {/* The inspector's report */}
                                                <Panel title="Inspection report" icon="doc">
                                                    {hasFindings ? (
                                                        <>
                                                            {/* Outcome: every verdict on this round, side by side and
                                                                each one labelled with who gave it. */}
                                                            {(ins.is_compliant != null || ins.inspection_result || poStatus) && (
                                                                <div className="px-4 py-3.5 border-b border-slate-100 bg-slate-50/60 grid gap-4 sm:grid-cols-3">
                                                                    {ins.is_compliant != null && (
                                                                        <div>
                                                                            <p className="text-[11.5px] font-medium text-slate-500">Site compliance</p>
                                                                            <p className={`mt-0.5 inline-flex items-center gap-1.5 text-[15px] font-bold ${ins.is_compliant ? "text-emerald-700" : "text-rose-700"}`}>
                                                                                <Icon name={ins.is_compliant ? "check" : "x"} className="w-4 h-4" strokeWidth={2.6} />
                                                                                {ins.is_compliant ? "Compliant" : "Not compliant"}
                                                                            </p>
                                                                        </div>
                                                                    )}
                                                                    {ins.inspection_result && (
                                                                        <div>
                                                                            <p className="text-[11.5px] font-medium text-slate-500">Inspector's result</p>
                                                                            <p className="mt-0.5 text-[15px] font-bold text-slate-900">{ins.inspection_result}</p>
                                                                        </div>
                                                                    )}
                                                                    {poStatus && (
                                                                        <div>
                                                                            <p className="text-[11.5px] font-medium text-slate-500">Planning Officer decision</p>
                                                                            <p className={`mt-0.5 text-[15px] font-bold ${poStatus.tone}`}>{poStatus.label}</p>
                                                                            {poStatus.sub && <p className="mt-0.5 text-[11.5px] text-slate-500 leading-snug">{poStatus.sub}</p>}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                            <dl className="divide-y divide-slate-100">
                                                                {reportRows.map(([label, value, alert]) => (
                                                                    <div key={label} className="px-4 py-3 grid gap-1 sm:grid-cols-[9.5rem_1fr] sm:gap-6">
                                                                        <dt className={`flex items-center gap-1.5 text-[12.5px] font-medium sm:pt-px ${alert ? "text-rose-700" : "text-slate-500"}`}>
                                                                            {alert && <Icon name="alert" className="w-3.5 h-3.5 shrink-0" strokeWidth={2.2} />}
                                                                            {label}
                                                                        </dt>
                                                                        <dd className={`min-w-0 text-[13px] leading-relaxed ${alert ? "rounded-md bg-rose-50 border border-rose-100 px-3 py-2" : ""}`}>
                                                                            <ReportValue value={value} alert={alert} />
                                                                        </dd>
                                                                    </div>
                                                                ))}
                                                            </dl>
                                                        </>
                                                    ) : (
                                                        <div className="px-4 py-8 short:py-4 flex flex-col items-center text-center">
                                                            <span className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 flex items-center justify-center" aria-hidden="true">
                                                                <Icon name="doc" className="w-5 h-5" />
                                                            </span>
                                                            <p className="mt-2.5 text-[13.5px] font-bold text-slate-900">No inspection report yet</p>
                                                            <p className="mt-0.5 max-w-md text-[12px] text-slate-500 leading-relaxed">
                                                                Findings, photos and GPS confirmation appear here once the inspector submits the report from FieldSync.
                                                            </p>
                                                        </div>
                                                    )}
                                                </Panel>

                                                {/* Instructions matter while the visit is open; a completed
                                                    round no longer shows them. */}
                                                {ins.assigned_notes && !roundDone && (
                                                    <Panel title="Instructions for the inspector" icon="user">
                                                        <p className="px-4 py-3 text-[13px] text-slate-700 leading-relaxed whitespace-pre-line">
                                                            {ins.assigned_notes}
                                                        </p>
                                                    </Panel>
                                                )}

                                                {/* GPS Confirmation */}
                                                {(ins.confirmed_latitude || ins.confirmed_longitude) && (
                                                    <Panel title="GPS confirmation" icon="gps">
                                                        <dl className="px-4 pb-2 grid sm:grid-cols-2 gap-x-8">
                                                            <InfoRow label="Latitude" value={ins.confirmed_latitude} mono />
                                                            <InfoRow label="Longitude" value={ins.confirmed_longitude} mono />
                                                            <InfoRow label="Accuracy" value={ins.gps_accuracy_m ? `${Number(ins.gps_accuracy_m).toFixed(1)} m` : null} mono />
                                                            <InfoRow label="Confirmed" value={ins.gps_confirmed_at ? formatDate(ins.gps_confirmed_at) : null} />
                                                        </dl>
                                                    </Panel>
                                                )}
                                            </>
                                        )}

                                        {/* ── Photos Tab ── */}
                                        {activeTab === "photos" && (
                                            <Panel title="Field photos" icon="photo">
                                                <div className="p-4">
                                                    {loadingPhotos ? (
                                                        <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                                                            <svg className="animate-spin w-5 h-5 mb-2.5 text-blue-600" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                            </svg>
                                                            <span className="text-xs font-medium">Loading photos…</span>
                                                        </div>
                                                    ) : inspectionPhotos && inspectionPhotos.length > 0 ? (
                                                        <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2.5">
                                                            {inspectionPhotos.map((photo, idx) => {
                                                                // The authorized contract is `signed_url`. The server
                                                                // deliberately does NOT emit a raw path or a stored
                                                                // public URL; the image is still fetched from a
                                                                // short-lived signed URL.
                                                                const thumbUrl = photo.signed_url;
                                                                const broken = brokenPhotos[idx];

                                                                return (
                                                                    <button
                                                                        key={photo.id || idx}
                                                                        type="button"
                                                                        onClick={() => setLightboxIndex(idx)}
                                                                        title={thumbUrl ? "Open full-size photo" : "This photo is unavailable"}
                                                                        aria-label={thumbUrl ? `Open photo ${idx + 1} full size` : `Photo ${idx + 1} unavailable`}
                                                                        className={`relative bg-slate-100 rounded-lg overflow-hidden group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 cursor-pointer aspect-square`}
                                                                    >
                                                                        {thumbUrl && !broken ? (
                                                                            <img
                                                                                src={thumbUrl}
                                                                                alt={`Inspection Photo ${idx + 1}`}
                                                                                onError={() => markPhotoBroken(idx)}
                                                                                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                                                            />
                                                                        ) : (
                                                                            // A failed image reports itself honestly; it is never
                                                                            // replaced with a stand-in photo.
                                                                            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-slate-400 p-2 text-center">
                                                                                <Icon name="alert" className="w-6 h-6" strokeWidth={1.5} />
                                                                                <span className="text-[10px] font-semibold leading-tight">
                                                                                    Photo unavailable
                                                                                </span>
                                                                            </span>
                                                                        )}

                                                                        {photo.captured_at && (
                                                                            <span className="absolute inset-x-0 bottom-0 px-3 py-2 text-[10.5px] text-white font-medium truncate text-left bg-gradient-to-t from-slate-950/75 to-transparent opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                                                                                {new Date(photo.captured_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                                                            </span>
                                                                        )}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <div className="py-8 short:py-5 flex flex-col items-center text-center">
                                                            <span className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 flex items-center justify-center">
                                                                <Icon name="photo" className="w-5 h-5" strokeWidth={1.6} />
                                                            </span>
                                                            <p className="mt-2.5 text-[13.5px] font-bold text-slate-900">No photos yet</p>
                                                            <p className="text-[12px] text-slate-500 mt-0.5">Photos taken by the inspector in FieldSync will appear here.</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </Panel>
                                        )}

                                        {/* ── Parcel Tab ── */}
                                        {activeTab === "parcel" && (
                                            <Panel title="Parcel record" icon="map">
                                                {parcel.id ? (
                                                    <dl className="px-4 pb-2 grid md:grid-cols-2 gap-x-8">
                                                        <InfoRow label="Parcel Code" value={parcel.parcel_code} />
                                                        <InfoRow label="Property Index Number" value={parcel.property_index_number} mono />
                                                        <InfoRow label="Lot Number" value={parcel.lot_number} />
                                                        <InfoRow label="Lot Area" value={parcel.lot_area_sqm ? `${parcel.lot_area_sqm} sq.m` : null} mono />
                                                        <InfoRow label="Owner" value={parcel.owner_name} />
                                                        <InfoRow label="Barangay" value={parcel.barangay} />
                                                        <InfoRow label="Location" value={parcel.location_address} />
                                                        <InfoRow label="Land Use" value={parcel.land_use_class} />
                                                        <InfoRow label="TCT Number" value={parcel.tct_number} mono />
                                                        <InfoRow label="Tax Dec Number" value={parcel.tax_dec_number} mono />
                                                        <InfoRow label="ARP Number" value={parcel.arp_number} mono />
                                                        <InfoRow label="Survey Number" value={parcel.survey_number} mono />
                                                    </dl>
                                                ) : (
                                                    <div className="py-8 short:py-5 flex flex-col items-center text-center">
                                                        <span className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 flex items-center justify-center">
                                                            <Icon name="map" className="w-5 h-5" strokeWidth={1.6} />
                                                        </span>
                                                        <p className="mt-2.5 text-[13.5px] font-bold text-slate-900">No parcel linked</p>
                                                        <p className="text-[12px] text-slate-500 mt-0.5">This inspection round was recorded without a parcel.</p>
                                                    </div>
                                                )}
                                            </Panel>
                                        )}

                                        {/* ── Application Tab ── */}
                                        {activeTab === "application" && (
                                            <Panel
                                                title="Application record"
                                                icon="briefcase"
                                                aside={ins.zoning_application_id && (
                                                    <Link
                                                        href={`/applications/${ins.zoning_application_id}`}
                                                        className="inline-flex items-center rounded-md text-[11.5px] font-semibold text-blue-600 hover:text-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                                    >
                                                        Open application record
                                                    </Link>
                                                )}
                                            >
                                                <dl className="px-4 pb-2 grid md:grid-cols-2 gap-x-8">
                                                    <InfoRow label="Reference Number" value={app.reference_number} mono />
                                                    <InfoRow label="Application Type" value={app.application_type} />
                                                    <InfoRow label="Status" value={app.status} />
                                                    <InfoRow label="Barangay" value={app.barangay} />
                                                    <InfoRow label="Applicant" value={app.applicant_name} />
                                                    <InfoRow label="Contact" value={app.contact_number ? `+63 ${app.contact_number}` : null} mono />
                                                    <InfoRow label="Form Number" value={app.form_number} />
                                                    <InfoRow label="Land Use Class" value={app.land_use_class} />
                                                    <InfoRow label="Representative" value={app.representative_name} />
                                                    <InfoRow label="Assessment Fee" value={app.assessment_fee ? `₱${parseFloat(app.assessment_fee).toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : null} mono />
                                                </dl>

                                                {app.purpose && (
                                                    <div className="mx-4 mb-4 rounded-lg bg-slate-50 border border-slate-100 px-4 py-3">
                                                        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">Purpose</p>
                                                        <p className="mt-1 text-[13px] text-slate-700 leading-relaxed">
                                                            {app.purpose}
                                                        </p>
                                                    </div>
                                                )}
                                            </Panel>
                                        )}
                                    </div>

                                    {/* ── SUPPLEMENTAL OPERATIONS CONTEXT ──
                                        Beside the record on wide screens, below it on narrow
                                        ones. A status board of tiles; the open tile's full text
                                        shows in the panel beneath. */}
                                    <aside aria-label="Operations" className="min-w-0 lg:min-h-0 lg:overflow-y-auto border-t lg:border-t-0 lg:border-l border-slate-200 bg-slate-50/70 p-3.5 pt-3 short:p-3 space-y-2.5">
                                        {/* Scoped sync OUTCOME, set from the flash the controller
                                            returns, so the server stays the single source of truth
                                            for the wording. */}
                                        {syncOutcome && (
                                            <div
                                                role="status"
                                                aria-live="polite"
                                                className={`rounded-lg px-3 py-2.5 text-[12.5px] font-medium border flex items-start gap-2 ${
                                                    syncOutcome.tone === "ok"
                                                        ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                                                        : syncOutcome.tone === "warn"
                                                          ? "bg-amber-50 text-amber-900 border-amber-200"
                                                          : syncOutcome.tone === "info"
                                                            ? "bg-white text-slate-700 border-slate-200"
                                                            : "bg-rose-50 text-rose-900 border-rose-200"
                                                }`}
                                            >
                                                <span className="flex-1">{syncOutcome.message}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setSyncOutcome(null)}
                                                    aria-label="Dismiss sync result"
                                                    className="opacity-60 hover:opacity-100 cursor-pointer"
                                                >
                                                    <Icon name="x" className="w-3.5 h-3.5" strokeWidth={2.5} />
                                                </button>
                                            </div>
                                        )}

                                        <h2 className="text-[13px] font-bold text-slate-900">Case status</h2>

                                        <ul className="rounded-lg bg-white border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                                            {tiles.map((tile) => {
                                                const isOpen = openTile === tile.key;
                                                const tone = TILE_TONES[tile.tone] || TILE_TONES.slate;
                                                const summary = (
                                                    <>
                                                        <span className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${tone.chip}`}>
                                                            <Icon name={tile.icon} className="w-3.5 h-3.5" strokeWidth={2.2} />
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block text-[11px] font-medium text-slate-500">{tile.label}</span>
                                                            <span className="block text-[13px] font-semibold leading-snug text-slate-900 truncate">{tile.value}</span>
                                                        </span>
                                                    </>
                                                );
                                                // A row with nothing beyond its headline is not expandable.
                                                if (!tile.body) {
                                                    return (
                                                        <li key={tile.key} className="flex items-center gap-3 px-3 py-2.5">
                                                            {summary}
                                                        </li>
                                                    );
                                                }
                                                return (
                                                    <li key={tile.key}>
                                                        <button
                                                            type="button"
                                                            onClick={() => setOpenTile(isOpen ? null : tile.key)}
                                                            aria-expanded={isOpen}
                                                            aria-controls={`case-status-${tile.key}`}
                                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50"
                                                        >
                                                            {summary}
                                                            <Icon
                                                                name="chevronDown"
                                                                className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                                                                strokeWidth={2.2}
                                                            />
                                                        </button>
                                                        {isOpen && (
                                                            <div
                                                                id={`case-status-${tile.key}`}
                                                                className="px-3 pb-3 pl-[3.25rem] text-[12.5px] text-slate-600 leading-normal"
                                                            >
                                                                {tile.body}
                                                            </div>
                                                        )}
                                                    </li>
                                                );
                                            })}
                                        </ul>

                                        {/* PHASE 2A - ADMIN SUPPORT / OPERATIONS AREA.
                                            A SUPPORT action, not a business decision: it imports a
                                            FieldSync result that already exists for THIS ONE
                                            inspection round. It cannot approve, decline, request a
                                            reinspection, assign an inspector, schedule or create a
                                            round, or edit findings. Admin only: the sync route is
                                            role:Admin, so a Planning Officer is never offered a
                                            control the server refuses. */}
                                        {userRole === "Admin" && (
                                            <div className="rounded-lg bg-white border border-slate-200 p-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-[12.5px] font-bold text-slate-900 truncate">Admin support actions</p>
                                                        <button
                                                            type="button"
                                                            onClick={() => setAdminInfoOpen((o) => !o)}
                                                            aria-expanded={adminInfoOpen}
                                                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
                                                        >
                                                            <Icon name="info" className="w-3.5 h-3.5" />
                                                            What this does
                                                        </button>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        disabled={syncing}
                                                        onClick={() => setSyncConfirmOpen(true)}
                                                        className="shrink-0 inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg bg-white border border-slate-200 text-slate-700 text-[12px] font-semibold hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                                                    >
                                                        <Icon name={syncing ? "sync" : "download"} className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} strokeWidth={2} />
                                                        <span>{syncing ? "Syncing…" : "Sync from FieldSync"}</span>
                                                    </button>
                                                </div>
                                                {adminInfoOpen && (
                                                    <p className="text-[12px] text-slate-500 mt-2 leading-relaxed">
                                                        Imports the latest <span className="font-semibold text-slate-800">completed</span> FieldSync
                                                        result for <span className="font-semibold text-slate-800">this inspection round only</span>{" "}
                                                        (INS-{ins.id || "-"}). It changes only this round, and only with
                                                        data FieldSync has already submitted. It does not approve,
                                                        decline, request a reinspection, reassign an inspector,
                                                        schedule a round, or edit findings.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </aside>
                                </div>
                            </div>
                        </div>
                    </main>
                </div>
            </div>

            {/* ── Scoped sync confirmation ──
                    The shared Modal component, deliberately NOT styled as
                    destructive: this imports data FieldSync has already
                    submitted; it is not an approval and cannot refuse anything. */}
                <Modal show={syncConfirmOpen} onClose={() => setSyncConfirmOpen(false)} maxWidth="md">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
                        <div className="p-5 border-b border-slate-100 bg-slate-50/80 flex justify-between items-start">
                            <h3 className="text-base font-bold text-slate-900">
                                Sync from FieldSync?
                            </h3>
                            <button
                                type="button"
                                onClick={() => setSyncConfirmOpen(false)}
                                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                                aria-label="Close"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-5 space-y-3">
                            <p className="text-xs font-semibold text-slate-800 leading-relaxed">
                                Import the latest completed FieldSync result for Inspection{" "}
                                {ins.id}?
                            </p>
                            {/* Plain helper text with an information icon: nothing
                                here is editable and nothing is sent. */}
                            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-500">
                                <svg
                                    className="w-3.5 h-3.5 mt-px shrink-0 text-slate-400"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                    />
                                </svg>
                                <span>
                                    Only this inspection round can be updated. This action
                                    imports data already submitted from FieldSync. It does not
                                    approve, decline, request reinspection, assign an
                                    inspector, or make a Planning Officer decision.
                                </span>
                            </p>
                        </div>

                        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2.5 bg-slate-50/80">
                            <button
                                type="button"
                                onClick={() => setSyncConfirmOpen(false)}
                                disabled={syncing}
                                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-all shadow-xs disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={runScopedSync}
                                disabled={syncing}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {syncing ? "Syncing…" : "Sync from FieldSync"}
                            </button>
                        </div>
                    </div>
                </Modal>

                {lightboxIndex !== null && (
                <PhotoLightbox
                    photos={inspectionPhotos.map((p, i) => ({
                        ...p,
                        inspectionId: ins.id,
                        alt: `Inspection Photo ${i + 1}`,
                    }))}
                    index={lightboxIndex}
                    onClose={() => setLightboxIndex(null)}
                    onIndexChange={setLightboxIndex}
                />
            )}
        </>
    );
}
