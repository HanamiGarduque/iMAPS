import React, { useState, useEffect, useMemo, useRef } from "react";
import { Head, router, Link } from "@inertiajs/react";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { confirmSignOut } from "@/utils/signOut";
import "leaflet/dist/leaflet.css";

// —— Status Configuration ——
const STATUS_CONFIG = {
    Received: {
        dot: "bg-emerald-500",
        markerColor: "#10b981",
        label: "Received",
        badge: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
    },
    "Technical Review": {
        dot: "bg-amber-500",
        markerColor: "#f59e0b",
        label: "Technical Review",
        badge: "bg-amber-50 text-amber-700 border-amber-200/80",
    },
    "Under Sangguniang Bayan": {
        dot: "bg-purple-500",
        markerColor: "#a855f7",
        label: "SB Review",
        badge: "bg-purple-50 text-purple-700 border-purple-200/80",
    },
    "For Release": {
        dot: "bg-sky-500",
        markerColor: "#0ea5e9",
        label: "For Release",
        badge: "bg-sky-50 text-sky-700 border-sky-200/80",
    },
    Released: {
        dot: "bg-blue-600",
        markerColor: "#2563eb",
        label: "Released",
        badge: "bg-blue-50 text-blue-700 border-blue-200/80",
    },
    Denied: {
        dot: "bg-rose-500",
        markerColor: "#f43f5e",
        label: "Denied",
        badge: "bg-rose-50 text-rose-700 border-rose-200/80",
    },
};

const TYPE_BADGES = {
    "Locational Clearance": "bg-blue-50 text-blue-700 border-blue-200/80",
    "Zoning Certificate": "bg-emerald-50 text-emerald-700 border-emerald-200/80",
    "Development Permit": "bg-amber-50 text-amber-700 border-amber-200/80",
    "Preliminary Approval and Locational Clearance (PALC)": "bg-purple-50 text-purple-700 border-purple-200/80",
    "Petition for Rezoning": "bg-rose-50 text-rose-700 border-rose-200/80",
    "Petition for Reclassification": "bg-pink-50 text-pink-700 border-pink-200/80",
};

const AVATAR_PALETTES = [
    "bg-blue-100 text-blue-700 border-blue-200",
    "bg-blue-100 text-blue-700 border-blue-200",
    "bg-emerald-100 text-emerald-700 border-emerald-200",
    "bg-amber-100 text-amber-700 border-amber-200",
    "bg-purple-100 text-purple-700 border-purple-200",
    "bg-rose-100 text-rose-700 border-rose-200",
    "bg-teal-100 text-teal-700 border-teal-200",
];

function getInitials(name) {
    if (!name) return "AP";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getAvatarPalette(name) {
    if (!name) return AVATAR_PALETTES[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

const LAND_USE_BADGES = {
    Residential: "bg-emerald-50 text-emerald-800 border-emerald-300 font-bold",
    Commercial: "bg-amber-50 text-amber-800 border-amber-300 font-bold",
    Industrial: "bg-rose-50 text-rose-800 border-rose-300 font-bold",
    "Agri-Industrial": "bg-purple-50 text-purple-800 border-purple-300 font-bold",
    Institutional: "bg-sky-50 text-sky-800 border-sky-300 font-bold",
    Recreational: "bg-lime-50 text-lime-800 border-lime-300 font-bold",
};

const STATUSES = ["Received", "Technical Review", "Under Sangguniang Bayan", "For Release", "Released", "Denied"];
const APP_TYPES = ["Locational Clearance", "Zoning Certificate", "Development Permit", "Preliminary Approval and Locational Clearance (PALC)", "Petition for Rezoning", "Petition for Reclassification"];
const LAND_USE_CLASSES = ["Residential", "Commercial", "Industrial", "Agri-Industrial", "Institutional", "Recreational"];
// LOOP 9D: presentation ONLY, keyed by the server's state tokens. This map
// chooses colors and nothing else: the state, the label, the message and the
// failure-category label are all authored by InspectionDeliveryStatus on the
// server. The browser holds no delivery vocabulary and no business predicate.
const DELIVERY_STATE_STYLES = {
    no_delivery_record: "bg-slate-100 text-slate-600 border-slate-300",
    not_yet_delivered:  "bg-slate-100 text-slate-600 border-slate-300",
    pending_delivery: "bg-blue-50 text-blue-700 border-blue-300",
    delivered: "bg-emerald-50 text-emerald-700 border-emerald-300",
    delivery_failed: "bg-red-50 text-red-700 border-red-300",
};

const ROSARIO_BARANGAYS = [
    "Alupay", "Antipolo", "Bagong Pook", "Balibago", "Bayawang", "Baybayin", "Bulihan", "Cahigam", 
    "Calantas", "Colongan", "Itlugan", "Leviste", "Lumbangan", "Maalas-as", "Mabato", "Mabunga", 
    "Macalamcam A", "Macalamcam B", "Malaya", "Maligaya", "Marilag", "Masaya", "Matamis", "Mavalor", 
    "Mayuro", "Namuco", "Namunga", "Natu", "Nasi", "Palacpac", "Pinagsibaan", "Poblacion A", 
    "Poblacion B", "Poblacion C", "Poblacion D", "Poblacion E", "Putingkahoy", "Quilib", "Salao", 
    "San Carlos", "San Ignacio", "San Isidro", "San Jose", "San Roque", "Santa Cruz", "Timbugan", 
    "Tiquiwan", "Tulos"
];

// Approximate coordinates in Rosario, Batangas for GIS mapping
const BARANGAY_COORDS = {
    "San Carlos": [13.8612, 121.2185],
    "Poblacion A": [13.8460, 121.2040],
    "Poblacion B": [13.8470, 121.2050],
    "Poblacion C": [13.8485, 121.2065],
    "Poblacion D": [13.8490, 121.2080],
    "Poblacion E": [13.8500, 121.2095],
    "Namunga": [13.8390, 121.2150],
    "Quilib": [13.8680, 121.1940],
    "Pinagsibaan": [13.8820, 121.2310],
    "Cahigam": [13.8240, 121.2410],
    "Bagong Pook": [13.8350, 121.2290],
    "San Roque": [13.8560, 121.1980],
    "Calantas": [13.8750, 121.1820],
    "Antipolo": [13.8850, 121.2150],
    "Timbugan": [13.8310, 121.1920],
    "Namuco": [13.8580, 121.2270],
    "Default": [13.7850, 121.2500],
};

const SORT_OPTIONS = [
    { value: "newest", label: "Newest filing" },
    { value: "oldest", label: "Oldest filing" },
    { value: "fee_desc", label: "Highest fee" },
    { value: "fee_asc", label: "Lowest fee" },
    { value: "applicant_asc", label: "Applicant A–Z" },
    { value: "applicant_desc", label: "Applicant Z–A" },
    { value: "ref_asc", label: "Reference A–Z" },
];

const DATE_PRESETS = [
    { label: "All Time", value: "all" },
    { label: "Today", value: "today" },
    { label: "This Week", value: "this_week" },
    { label: "This Month", value: "this_month" },
    { label: "Custom Range", value: "custom" },
];

// —— 10 Realistic Applications ——

const getDocColor = (type) => {
    if (type === "Locational Clearance") return "#3B82F6"; // blue
    if (type === "Zoning Certificate") return "#10B981"; // emerald
    if (type === "Development Permit") return "#F59E0B"; // amber
    if (type === "Preliminary Approval and Locational Clearance (PALC)") return "#8B5CF6"; // purple
    if (type === "Petition for Rezoning") return "#EF4444"; // red
    if (type === "Petition for Reclassification") return "#F472B6"; // pink
    return "#CBD5E1"; // slate
};

const getFoldColor = (type) => {
    if (type === "Locational Clearance") return "#2563EB";
    if (type === "Zoning Certificate") return "#059669";
    if (type === "Development Permit") return "#D97706";
    if (type === "Preliminary Approval and Locational Clearance (PALC)") return "#7C3AED";
    if (type === "Petition for Rezoning") return "#DC2626";
    if (type === "Petition for Reclassification") return "#DB2777";
    return "#94A3B8";
};

const STANDARD_PROGRESS_STEPS = [
    { key: "Received", label: "Received" },
    { key: "Technical Review", label: "Technical review" },
    { key: "For Release", label: "Issued / ready for release" },
];

const SB_PROGRESS_STEPS = [
    { key: "Received", label: "Received" },
    { key: "Technical Review", label: "Technical review" },
    { key: "Under Sangguniang Bayan", label: "Sangguniang Bayan" },
    { key: "For Release", label: "Issued / ready for release" },
];

const PROGRESS_STEPS = SB_PROGRESS_STEPS;

function getProgressSteps(appOrStatus) {
    const isObject = typeof appOrStatus === "object" && appOrStatus !== null;
    const status = isObject ? appOrStatus.status : appOrStatus;
    const hasSb = isObject
        ? Boolean(
            appOrStatus.has_sb_routing ||
            appOrStatus.hasSbRouting ||
            String(appOrStatus.application_stream || "").toLowerCase() === "amendment" ||
            appOrStatus.status === "Under Sangguniang Bayan" ||
            appOrStatus.sb_ordinance_number?.trim() ||
            appOrStatus.route_to_sb
          )
        : status === "Under Sangguniang Bayan";

    const steps = hasSb ? SB_PROGRESS_STEPS : STANDARD_PROGRESS_STEPS;

    if (status === "Denied") {
        return steps.map((step) => ({ ...step, state: "denied" }));
    }
    const currentIndex = status === "Released"
        ? steps.length
        : steps.findIndex((step) => step.key === status);
    return steps.map((step, idx) => ({
        ...step,
        state: idx < currentIndex ? "done" : idx === currentIndex ? "current" : "pending",
    }));
}

function StatusBadge({ status }) {
    const s = status || "Received";
    const cfg = STATUS_CONFIG[s] || { dot: "bg-slate-400", label: s, badge: "bg-slate-50 text-slate-600 border-slate-200" };
    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11.5px] font-medium whitespace-nowrap ${s === "Denied" ? "bg-red-50 text-red-700 border-red-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s === "Denied" ? "bg-red-500" : "bg-blue-600"} shrink-0`} />
            {cfg.label}
        </span>
    );
}

// Table status: label on top, a segmented progress track below.
// Filled segments are iMAPS blue; SB-routed applications get 4 steps,
// others 3, but the track width is fixed so every row lines up.
// iMAPS blue throughout; red is kept only for Denied.
const STAGE_TONES = {
    Released: { bar: "bg-blue-600", text: "text-blue-700" },
    Denied: { bar: "bg-red-300", text: "text-red-700" },
};
const DEFAULT_TONE = { bar: "bg-blue-600", text: "text-slate-700" };

function StageMeter({ item }) {
    const status = item.status || "Received";
    const steps = getProgressSteps(item);
    const denied = status === "Denied";
    const reached = Math.min(steps.filter((s) => s.state === "done" || s.state === "current").length, steps.length);
    const label = STATUS_CONFIG[status]?.label || status;
    const tone = STAGE_TONES[status] || DEFAULT_TONE;
    return (
        <span className="flex flex-col gap-1.5 min-w-0 max-w-[132px]" title={denied ? "Denied" : `Step ${reached} of ${steps.length}`}>
            <span className={`truncate text-[12.5px] font-medium leading-none ${tone.text}`}>
                {label}
                {!denied && <span className="sr-only">, step {reached} of {steps.length}</span>}
            </span>
            <span className="flex gap-[3px]" aria-hidden="true">
                {steps.map((s) => (
                    <span
                        key={s.key}
                        className={`h-1 flex-1 rounded-full ${
                            denied ? tone.bar
                                : s.state === "done" ? tone.bar
                                : s.state === "current" ? "bg-blue-300"
                                : "bg-slate-200"
                        }`}
                    />
                ))}
            </span>
        </span>
    );
}

// Sortable table header: faint ⇅ when idle, blue arrow when active.
function SortHeader({ label, dir, onClick, align = "left" }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`group inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] cursor-pointer transition-colors ${
                align === "right" ? "flex-row-reverse" : ""
            } ${dir ? "text-slate-900" : "text-slate-500 hover:text-slate-800"}`}
        >
            {label}
            <svg className={`w-3 h-3 ${dir ? "text-blue-600" : "text-slate-300 group-hover:text-slate-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                {dir === "asc" ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19.5v-15m0 0l-6 6m6-6l6 6" />
                ) : dir === "desc" ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0 0l6-6m-6 6l-6-6" />
                ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
                )}
            </svg>
        </button>
    );
}

function timeAgo(d) {
    const date = new Date(d);
    if (!d || isNaN(date.getTime())) return "";
    const days = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 30) return `${days} days ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months > 1 ? "s" : ""} ago`;
    const years = Math.floor(days / 365);
    return `${years} year${years > 1 ? "s" : ""} ago`;
}

function splitTypes(type) {
    return String(type || "").split(",").map((t) => t.trim()).filter(Boolean);
}

// —— Leaflet Custom Marker Icon Generator ——
const createCustomMarker = (status, refNo) => {
    const color = STATUS_CONFIG[status]?.markerColor || "#3b82f6";
    return L.divIcon({
        className: "custom-map-pin",
        html: `
            <div style="background-color: ${color}; color: white; padding: 3px 6px; border-radius: 8px; font-size: 10px; font-weight: bold; border: 2px solid white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2); white-space: nowrap; display: flex; align-items: center; gap: 4px;">
                <span style="width: 5px; height: 5px; border-radius: 50%; background: white;"></span>
                <span>${refNo}</span>
            </div>
        `,
        iconSize: [80, 26],
        iconAnchor: [40, 13],
    });
};

function MapViewRecenter({ bounds }) {
    const map = useMap();
    useEffect(() => {
        if (bounds && bounds.length > 0) {
            map.fitBounds(bounds, { padding: [40, 40] });
        }
    }, [bounds, map]);
    return null;
}

// —— Accessible, Keyboard-Friendly Dropdown Select Component ——
function DropdownSelect({
    value,
    onChange,
    options = [],
    searchPlaceholder = "Type to search...",
    allLabel = "All",
    prefix = "",
    withSearch = false,
    isActive = undefined,
    variant = "default",
    label = "",
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const dropdownRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (isOpen && withSearch && inputRef.current) {
            inputRef.current.focus();
        }
        if (!isOpen) {
            setSearchQuery("");
            setHighlightedIndex(0);
        }
    }, [isOpen, withSearch]);

    const getOptionValue = (opt) => (opt && typeof opt === "object" ? opt.value : opt);
    const getOptionLabel = (opt) => (opt && typeof opt === "object" ? opt.label : opt);

    const filteredOptions = useMemo(() => {
        if (!Array.isArray(options)) return [];
        if (!withSearch || !searchQuery.trim()) return options;
        const q = searchQuery.toLowerCase();
        return options.filter((opt) => {
            const label = String(getOptionLabel(opt) || "");
            return label.toLowerCase().includes(q);
        });
    }, [options, searchQuery, withSearch]);

    const currentSelectedLabel = useMemo(() => {
        if (!value || value === "newest") {
            const defaultFound = options.find((opt) => getOptionValue(opt) === value);
            if (defaultFound && value === "newest") return getOptionLabel(defaultFound);
            return allLabel;
        }
        if (Array.isArray(options)) {
            const found = options.find((opt) => getOptionValue(opt) === value);
            if (found) return getOptionLabel(found);
        }
        return prefix ? `${prefix} ${value}` : value;
    }, [value, options, allLabel, prefix]);

    const handleKeyDown = (e) => {
        if (!isOpen) {
            if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
                e.preventDefault();
                setIsOpen(true);
            }
            return;
        }

        if (e.key === "Escape") {
            e.preventDefault();
            setIsOpen(false);
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightedIndex((prev) => Math.min(prev + 1, filteredOptions.length));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightedIndex((prev) => Math.max(prev - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (highlightedIndex === 0) {
                onChange("");
            } else if (filteredOptions[highlightedIndex - 1]) {
                onChange(getOptionValue(filteredOptions[highlightedIndex - 1]));
            }
            setIsOpen(false);
        }
    };

    const isCurrentlyActive = isActive !== undefined ? isActive : Boolean(value);

    return (
        <div className={`relative ${variant === "default" ? "w-full" : ""}`} ref={dropdownRef} onKeyDown={handleKeyDown}>
            {variant === "pill" ? (
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    aria-haspopup="listbox"
                    aria-expanded={isOpen}
                    className={`h-9 px-3 rounded-lg border text-[13px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                        isCurrentlyActive
                            ? "border-blue-200 bg-blue-50 text-blue-800"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                    }`}
                >
                    {isCurrentlyActive ? (
                        <span className="max-w-[160px] truncate">{label}: {currentSelectedLabel}</span>
                    ) : (
                        <>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            <span>{label}</span>
                        </>
                    )}
                </button>
            ) : variant === "ghost" ? (
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    aria-haspopup="listbox"
                    aria-expanded={isOpen}
                    className="h-9 px-2.5 rounded-lg text-[13px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
                    </svg>
                    <span>{currentSelectedLabel}</span>
                </button>
            ) : (
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full text-xs font-medium px-3 py-1.5 rounded-lg border transition-all flex items-center justify-between gap-2 shadow-2xs cursor-pointer ${
                    isOpen
                        ? "border-blue-600 ring-1 ring-blue-600/20 bg-white text-slate-900"
                        : isCurrentlyActive
                        ? "border-blue-400 bg-blue-50/60 text-blue-900 font-semibold hover:border-blue-500"
                        : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:border-slate-300"
                }`}
            >
                <span className="truncate">{currentSelectedLabel}</span>
                <svg
                    className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-150 ${isOpen ? "rotate-180 text-blue-600" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
            </button>
            )}

            {isOpen && (
                <div className={`absolute top-full mt-1 z-50 bg-white rounded-xl shadow-lg border border-slate-200/90 p-1.5 min-w-[210px] max-w-sm animate-in fade-in zoom-in-95 duration-100 ${variant === "ghost" ? "right-0" : variant === "pill" ? "left-0" : "left-0 right-0"}`}>
                    {withSearch && (
                        <div className="relative mb-1.5">
                            <svg
                                className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                            </svg>
                            <input
                                ref={inputRef}
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={searchPlaceholder}
                                className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-800 placeholder:text-slate-400 font-medium"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                                >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    )}

                    <div className="max-h-52 overflow-y-auto space-y-0.5">
                        <button
                            type="button"
                            onClick={() => {
                                onChange("");
                                setIsOpen(false);
                            }}
                            className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg flex items-center justify-between transition-colors ${
                                !value ? "bg-blue-50 text-blue-700 font-bold" : "text-slate-700 hover:bg-slate-50 font-medium"
                            } ${highlightedIndex === 0 ? "ring-1 ring-blue-400" : ""}`}
                        >
                            <span>{allLabel}</span>
                            {!value && (
                                <svg className="w-3.5 h-3.5 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                            )}
                        </button>

                        {filteredOptions.length === 0 ? (
                            <div className="py-3 text-center text-xs text-slate-400 font-medium">
                                No matching options
                            </div>
                        ) : (
                            filteredOptions.map((opt, idx) => {
                                const optVal = getOptionValue(opt);
                                const optLabel = getOptionLabel(opt);
                                const isSelected = value === optVal;
                                const isHighlighted = highlightedIndex === idx + 1;

                                return (
                                    <button
                                        key={String(optVal)}
                                        type="button"
                                        onClick={() => {
                                            onChange(optVal);
                                            setIsOpen(false);
                                        }}
                                        className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg flex items-center justify-between transition-colors ${
                                            isSelected ? "bg-blue-50 text-blue-700 font-bold" : "text-slate-700 hover:bg-slate-50 font-medium"
                                        } ${isHighlighted ? "ring-1 ring-blue-400 bg-slate-50" : ""}`}
                                    >
                                        <span className="truncate">{prefix ? `${prefix} ${optLabel}` : optLabel}</span>
                                        {isSelected && (
                                            <svg className="w-3.5 h-3.5 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                            </svg>
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function Index({ applications, filters = {}, auth = {}, status_counts = {}, inspectors = [], drafts_count = 0, applicant_counts = {}, delivery_monitoring = {} }) {
    const [clock, setClock] = useState("");

    // URL parameter synchronization
    const urlParams = useMemo(() => {
        if (typeof window === "undefined") return new URLSearchParams();
        return new URLSearchParams(window.location.search);
    }, []);

    const [searchInput, setSearchInput] = useState(urlParams.get("search") || filters?.search || "");
    const [debouncedSearch, setDebouncedSearch] = useState(urlParams.get("search") || filters?.search || "");
    const [selectedStatus, setSelectedStatus] = useState(urlParams.get("status") || filters?.status || "");
    const [selectedCategory, setSelectedCategory] = useState(urlParams.get("category") || filters?.application_type || "");
    const [selectedLandUse, setSelectedLandUse] = useState(urlParams.get("land_use") || filters?.land_use_class || "");
    const [selectedBarangay, setSelectedBarangay] = useState(urlParams.get("barangay") || filters?.barangay || "");

    // LOOP 9D: Admin aggregate delivery monitoring state.
    //
    // `enabled` is a SERVER fact, not a client role guess. The server sends the
    // block only to Admin and only ever honours `delivery_status` for Admin, so
    // honouring that flag keeps the control and the server in agreement instead
    // of the browser offering a filter the server would ignore.
    const deliveryMonitoringEnabled = delivery_monitoring?.enabled === true;
    const [selectedDelivery, setSelectedDelivery] = useState(
        urlParams.get("delivery_status") || delivery_monitoring?.selected || "all"
    );

    const [selectedSort, setSelectedSort] = useState(urlParams.get("sort") || filters?.sort || "newest");

    // Infinite scroll: the server only ever sends ONE page of 25 rows
    // (`->paginate(25)` in ApplicationController@index). Scrolling to the
    // bottom fetches the next server page and appends it here, so the table
    // can actually reach the totals shown in the status tabs instead of
    // being capped at the first page forever.
    const [fullDataset, setFullDataset] = useState(() => applications?.data || []);
    const [serverPage, setServerPage] = useState(applications?.current_page || 1);
    const [serverLastPage, setServerLastPage] = useState(applications?.last_page || 1);
    const [isFetchingMore, setIsFetchingMore] = useState(false);
    // Set right before a load-more request so the effect below appends the
    // response instead of treating it as a fresh first page.
    const isAppendingRef = useRef(false);
    const loadMoreRef = useRef(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [copiedRef, setCopiedRef] = useState(null);
    const [viewMode, setViewMode] = useState("list"); // 'list' | 'folder'
    const [selectedFolder, setSelectedFolder] = useState(null);
    const [selectedApplicant, setSelectedApplicant] = useState(null);
    const [peekItem, setPeekItem] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);
    const [moreOpen, setMoreOpen] = useState(false);

    // —— FILTER STATES ——
    const [dateRangePreset, setDateRangePreset] = useState(urlParams.get("date_preset") || "all");
    const [dateFrom, setDateFrom] = useState(urlParams.get("date_from") || filters?.date_from || "");
    const [dateTo, setDateTo] = useState(urlParams.get("date_to") || filters?.date_to || "");
    const [dateFilterOpen, setDateFilterOpen] = useState(false);

    // Keyboard Navigation Active Row
    const [focusedRowIndex, setFocusedRowIndex] = useState(-1);

    const dateFilterRef = useRef(null);
    const searchInputRef = useRef(null);

    const userName = auth?.user?.name || "Planning Officer";
    const userRole = auth?.user?.role || "Planning Officer";

    // 150ms Debounced Search handler
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchInput);
        }, 150);
        return () => clearTimeout(handler);
    }, [searchInput]);

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

    // Outside clicks for popovers
    useEffect(() => {
        const handleOutside = (e) => {
            if (dateFilterRef.current && !dateFilterRef.current.contains(e.target)) {
                setDateFilterOpen(false);
            }
        };
        document.addEventListener("mousedown", handleOutside);
        return () => document.removeEventListener("mousedown", handleOutside);
    }, []);

    // URL query sync
    useEffect(() => {
        if (typeof window === "undefined") return;
        const params = new URLSearchParams();
        if (debouncedSearch) params.set("search", debouncedSearch);
        if (selectedStatus) params.set("status", selectedStatus);
        if (selectedCategory) params.set("category", selectedCategory);
        if (selectedLandUse) params.set("land_use", selectedLandUse);
        if (selectedBarangay) params.set("barangay", selectedBarangay);
        if (selectedSort && selectedSort !== "newest") params.set("sort", selectedSort);
        if (dateFrom) params.set("date_from", dateFrom);
        if (dateTo) params.set("date_to", dateTo);
        if (dateRangePreset !== "all") params.set("date_preset", dateRangePreset);

        // LOOP 9D: the delivery filter is SERVER-side. It is pushed into the URL
        // and applied by ApplicationController::applyRegistryFilters(); the
        // browser never filters delivery state itself, because deciding which
        // round an application is judged by is a business fact.
        if (deliveryMonitoringEnabled && selectedDelivery && selectedDelivery !== "all") {
            params.set("delivery_status", selectedDelivery);
        } else {
            params.delete("delivery_status");
        }

        const queryStr = params.toString();
        const newUrl = queryStr ? `${window.location.pathname}?${queryStr}` : window.location.pathname;
        window.history.replaceState({}, "", newUrl);
    }, [debouncedSearch, selectedStatus, selectedCategory, selectedLandUse, selectedBarangay, selectedSort, dateFrom, dateTo, dateRangePreset, deliveryMonitoringEnabled, selectedDelivery]);



    const clearFilters = () => {
        setSearchInput("");
        setDebouncedSearch("");
        setSelectedStatus("");
        setSelectedCategory("");
        setSelectedLandUse("");
        setSelectedBarangay("");
        setSelectedSort("newest");
        setDateRangePreset("all");
        setDateFrom("");
        setDateTo("");
        // LOOP 9D
        if (deliveryMonitoringEnabled) setSelectedDelivery("all");
    };

    const handleDatePreset = (preset) => {
        setDateRangePreset(preset);
        const now = new Date();
        if (preset === "all") {
            setDateFrom("");
            setDateTo("");
        } else if (preset === "today") {
            const todayStr = now.toISOString().split("T")[0];
            setDateFrom(todayStr);
            setDateTo(todayStr);
        } else if (preset === "this_week") {
            const firstDay = new Date(now.setDate(now.getDate() - now.getDay()));
            setDateFrom(firstDay.toISOString().split("T")[0]);
            setDateTo(new Date().toISOString().split("T")[0]);
        } else if (preset === "this_month") {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            setDateFrom(firstDay.toISOString().split("T")[0]);
            setDateTo(new Date().toISOString().split("T")[0]);
        }
    };

    const formatDate = (d) => {
        if (!d) return "—";
        try {
            const date = new Date(d);
            return isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
        } catch {
            return "—";
        }
    };

    const formatFee = (fee) => {
        if (!fee || fee === "0" || fee === 0) return "—";
        const num = Number(String(fee).replace(/[^0-9.-]+/g, ""));
        return isNaN(num) || num === 0 ? "—" : "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const isCorporateEntity = (name) => {
        if (!name) return false;
        const q = name.toLowerCase();
        return q.includes("corp") || q.includes("inc") || q.includes("realty") || q.includes("systems") || q.includes("hub") || q.includes("dev") || q.includes("bank") || q.includes("holdings");
    };

    const hasActiveFilters = Boolean(
        debouncedSearch || selectedStatus || selectedCategory || selectedLandUse || selectedBarangay || 
        selectedSort !== "newest" || dateFrom || dateTo || dateRangePreset !== "all"
    );

    const handleLogout = confirmSignOut;

    const handleCopyRef = (e, refNo) => {
        e.stopPropagation();
        if (navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(refNo).catch(() => {});
        }
        setCopiedRef(refNo);
        setTimeout(() => setCopiedRef(null), 1800);
    };

    // Header click sort handler
    const handleHeaderSort = (field) => {
        if (field === "ref") {
            setSelectedSort((prev) => (prev === "ref_asc" ? "newest" : "ref_asc"));
        } else if (field === "applicant") {
            setSelectedSort((prev) => (prev === "applicant_asc" ? "applicant_desc" : "applicant_asc"));
        } else if (field === "date") {
            setSelectedSort((prev) => (prev === "newest" ? "oldest" : "newest"));
        } else if (field === "fee") {
            setSelectedSort((prev) => (prev === "fee_desc" ? "fee_asc" : "fee_desc"));
        }
    };

    // Dynamic Status Count Helper
    // PRE-EXISTING DATA-INTEGRITY DEFECT, FIXED DURING THE LOOP 9 INTEGRATION.
    //
    // This dataset used to fall back to `SAMPLE_APPLICATIONS` — ten INVENTED
    // records with fabricated applicant names, TCT numbers and phone numbers —
    // whenever the server returned no applications. An empty registry therefore
    // displayed invented companies as if they were real filings, and the status
    // counts below were computed from that fiction.
    //
    // The server payload is now the only source of truth. Zero applications
    // renders zero rows and the honest empty state. This defect was present
    // identically on the merge base, on origin/master and on the Loop 9 source;
    // it is NOT a Loop 9 merge regression.
    //
    // `applications` changes for two different reasons: the server sent a
    // fresh first page (filters or navigation changed) or we just fetched an
    // additional page ourselves via loadNextPage(). Only the first case
    // should replace the accumulated rows; the second case appends.
    useEffect(() => {
        if (isAppendingRef.current) {
            isAppendingRef.current = false;
            setFullDataset((prev) => {
                const seen = new Set(prev.map((r) => r.id));
                const incoming = (applications?.data || []).filter((r) => !seen.has(r.id));
                return [...prev, ...incoming];
            });
        } else {
            setFullDataset(applications?.data || []);
        }
        setServerPage(applications?.current_page || 1);
        setServerLastPage(applications?.last_page || 1);
    }, [applications]);

    const loadNextPage = () => {
        if (isFetchingMore || serverPage >= serverLastPage) return;
        setIsFetchingMore(true);
        isAppendingRef.current = true;
        const next = new URLSearchParams(window.location.search);
        next.set("page", String(serverPage + 1));
        router.visit(`${window.location.pathname}?${next.toString()}`, {
            only: ["applications"],
            preserveState: true,
            preserveScroll: true,
            replace: true,
            onFinish: () => setIsFetchingMore(false),
        });
    };

    const getStatusCount = (s) => {
        if (status_counts && Object.keys(status_counts).length > 0) {
            if (s === "") {
                return Object.values(status_counts).reduce((a, b) => Number(a) + Number(b), 0);
            }
            if (s === "Released") {
                return Number(status_counts["Released"] || 0) + Number(status_counts["For Release"] || 0);
            }
            return Number(status_counts[s] || 0);
        }
        if (s === "") return fullDataset.length;
        if (s === "Released") {
            return fullDataset.filter((a) => a?.status === "Released" || a?.status === "For Release").length;
        }
        return fullDataset.filter((a) => a?.status === s).length;
    };

    // Filter & Sort Dataset
    const filteredList = useMemo(() => {
        let list = [...fullDataset];

        if (selectedStatus) {
            if (selectedStatus === "Released") {
                list = list.filter((item) => item?.status === "Released" || item?.status === "For Release");
            } else {
                list = list.filter((item) => item?.status === selectedStatus);
            }
        }
        if (selectedCategory) {
            list = list.filter((item) => item?.application_type === selectedCategory);
        }
        if (selectedLandUse) {
            list = list.filter((item) => String(item?.target_land_use_class || item?.land_use_class || "").toLowerCase() === selectedLandUse.toLowerCase());
        }
        if (selectedBarangay) {
            list = list.filter((item) => String(item?.barangay || "").toLowerCase() === selectedBarangay.toLowerCase());
        }
        if (dateFrom) {
            list = list.filter((item) => {
                const itemDate = new Date(item.created_at).toISOString().split("T")[0];
                return itemDate >= dateFrom;
            });
        }
        if (dateTo) {
            list = list.filter((item) => {
                const itemDate = new Date(item.created_at).toISOString().split("T")[0];
                return itemDate <= dateTo;
            });
        }
        if (debouncedSearch) {
            const q = debouncedSearch.toLowerCase();
            list = list.filter((item) => {
                const matchRef = String(item?.reference_number || "").toLowerCase().includes(q);
                const matchName = String(item?.applicant_name || "").toLowerCase().includes(q);
                const matchBrgy = String(item?.barangay || "").toLowerCase().includes(q);
                const matchPurpose = String(item?.purpose || "").toLowerCase().includes(q);
                const matchTct = String(item?.tct_number || "").toLowerCase().includes(q);
                return matchRef || matchName || matchBrgy || matchPurpose || matchTct;
            });
        }

        list.sort((a, b) => {
            if (selectedSort === "newest") return new Date(b?.created_at || 0) - new Date(a?.created_at || 0);
            if (selectedSort === "oldest") return new Date(a?.created_at || 0) - new Date(b?.created_at || 0);
            if (selectedSort === "fee_desc") return parseFloat(b?.assessment_fee || 0) - parseFloat(a?.assessment_fee || 0);
            if (selectedSort === "fee_asc") return parseFloat(a?.assessment_fee || 0) - parseFloat(b?.assessment_fee || 0);
            if (selectedSort === "applicant_asc") return String(a?.applicant_name || "").localeCompare(String(b?.applicant_name || ""));
            if (selectedSort === "applicant_desc") return String(b?.applicant_name || "").localeCompare(String(a?.applicant_name || ""));
            if (selectedSort === "ref_asc") return String(a?.reference_number || "").localeCompare(String(b?.reference_number || ""));
            return 0;
        });

        return list;
    }, [fullDataset, selectedStatus, selectedCategory, selectedLandUse, debouncedSearch, selectedBarangay, selectedSort, dateFrom, dateTo]);

    // Every loaded-and-filtered row is rendered; "more" now means the server
    // has additional pages we haven't fetched yet, not rows we're hiding.
    const paginatedRecords = filteredList;
    const hasMore = serverPage < serverLastPage;

    // Fetch the next server page when the bottom of the list scrolls into view.
    useEffect(() => {
        const el = loadMoreRef.current;
        if (!el || !hasMore) return;
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) loadNextPage(); },
            { rootMargin: "200px" }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [hasMore, isFetchingMore, serverPage, viewMode]);

    // Group records by barangay for the Folder view
    const folderGroups = useMemo(() => {
        const groups = {};

        filteredList.forEach(app => {
            const name = app.barangay?.trim() || 'Unknown Barangay';
            if (!groups[name]) groups[name] = [];
            groups[name].push(app);
        });
        
        // Sort keys alphabetically
        return Object.keys(groups).sort().reduce((acc, key) => {
            acc[key] = groups[key];
            return acc;
        }, {});
    }, [filteredList]);

    // Group records by applicant name for the inner Applicant folder view
    const applicantGroups = useMemo(() => {
        if (!selectedFolder) return {};
        const appsInBarangay = folderGroups[selectedFolder] || [];
        const groups = {};
        appsInBarangay.forEach(app => {
            const name = (app.corporation_name || app.applicant_name)?.trim() || 'Unknown Applicant';
            if (!groups[name]) groups[name] = [];
            groups[name].push(app);
        });
        
        // Sort keys alphabetically
        return Object.keys(groups).sort().reduce((acc, key) => {
            acc[key] = groups[key];
            return acc;
        }, {});
    }, [selectedFolder, folderGroups]);


    const rowKey = (item) => item?.id ?? item?.reference_number;
    const toggleRow = (key) => setSelectedIds((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

    useEffect(() => setMoreOpen(false), [peekItem]);

    // KPI & Workflow Status Counts
    const totalCount = Math.max(1, getStatusCount(""));
    const receivedCount = getStatusCount("Received");
    const reviewCount = getStatusCount("Technical Review");
    const sbCount = getStatusCount("Under Sangguniang Bayan");
    const forReleaseCount = getStatusCount("For Release");
    const releasedCount = getStatusCount("Released");
    const deniedCount = getStatusCount("Denied");

    const receivedPct = Math.round((receivedCount / totalCount) * 100);
    const reviewPct = Math.round((reviewCount / totalCount) * 100);
    const sbPct = Math.round((sbCount / totalCount) * 100);
    const forReleasePct = Math.round((forReleaseCount / totalCount) * 100);
    const releasedPct = Math.round((releasedCount / totalCount) * 100);

    // —— Keyboard Navigation (/, ↑ / ↓, j / k, Enter, Space, Esc) ——
    useEffect(() => {
        const handleKeyDown = (e) => {
            const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);

            if (e.key === "Escape") {
                if (peekItem) {
                    setPeekItem(null);
                    return;
                }
                if (dateFilterOpen) {
                    setDateFilterOpen(false);
                    return;
                }
                if (isInput) {
                    document.activeElement?.blur();
                    return;
                }
                if (selectedIds.length > 0) {
                    setSelectedIds([]);
                    return;
                }
            }

            if (!isInput) {
                if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    searchInputRef.current?.focus();
                    return;
                }

                // Ctrl/⌘ + A selects every application matching the current filters.
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && viewMode === "list" && filteredList.length > 0) {
                    e.preventDefault();
                    setSelectedIds(filteredList.map(rowKey));
                    return;
                }

                if (viewMode === "list" && paginatedRecords.length > 0) {
                    if (e.key === "ArrowDown" || e.key === "j") {
                        e.preventDefault();
                        setFocusedRowIndex((prev) => Math.min(prev + 1, paginatedRecords.length - 1));
                    } else if (e.key === "ArrowUp" || e.key === "k") {
                        e.preventDefault();
                        setFocusedRowIndex((prev) => Math.max(prev - 1, 0));
                    } else if (e.key === "Enter" && focusedRowIndex >= 0 && paginatedRecords[focusedRowIndex]) {
                        e.preventDefault();
                        const item = paginatedRecords[focusedRowIndex];
                        if (item?.id) router.visit(`/applications/${item.id}`);
                    } else if (e.key === " " && focusedRowIndex >= 0 && paginatedRecords[focusedRowIndex]) {
                        e.preventDefault();
                        setPeekItem(paginatedRecords[focusedRowIndex]);
                    }
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [viewMode, paginatedRecords, focusedRowIndex, peekItem, dateFilterOpen, selectedIds, filteredList]);

    // Map bounds calculation
    const mapBounds = useMemo(() => {
        return filteredList.map((app) => BARANGAY_COORDS[app.barangay] || BARANGAY_COORDS["Default"]);
    }, [filteredList]);

    return (
        <>
            <Head title="Registry | iMAPS" />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
                
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

            <div id="dashboard-root" className="bg-slate-50 font-sans text-slate-800 h-screen flex flex-col overflow-hidden">
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
                        activePage="applications" 
                    />

                    {sidebarOpen && (
                        <div
                            onClick={() => setSidebarOpen(false)}
                            className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px] z-[750] transition-opacity duration-300"
                        />
                    )}

                    <main className="flex-1 w-full h-full flex flex-col overflow-hidden">
                        <div className="p-4 sm:p-6 flex-1 flex flex-col h-full overflow-hidden max-w-[1580px] mx-auto w-full gap-5">

                            {/* —— PAGE HEADER —— */}

                            {/* —— MASTER WORKSPACE ROW (TABLE CARD + QUICK PREVIEW PANEL) —— */}
                            <div className="flex-1 flex gap-4 min-h-0 no-print">

                            {/* —— UNIFIED MASTER WORKSPACE CARD —— */}
                            <div className="flex-1 min-w-0 bg-white rounded-xl border border-slate-200 flex flex-col min-h-0 overflow-hidden">

                                {/* —— FOLDER TABS (status filter) —— */}
                                <div className="bg-slate-100/80 border-b border-slate-200 shrink-0">
                                <div className="px-5 pt-3 flex items-center gap-3 min-w-0">
                                    <div className="flex items-baseline gap-2.5 min-w-0">
                                        <h1 className="text-[16px] font-bold text-slate-900 tracking-tight">Registry</h1>
                                        <p className="text-[12px] text-slate-500 truncate">All zoning and land-use filings</p>
                                    </div>
                                {userRole === "Planning Officer" && (
                                    <div className="ml-auto flex items-center gap-2 shrink-0">
                                        <Link
                                            href="/applications/drafts"
                                            aria-label={drafts_count > 0 ? `Drafts, ${drafts_count} unfinished` : "Drafts"}
                                            className="group inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border border-slate-300 bg-white shadow-sm shadow-slate-900/5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 hover:text-slate-900 transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                                        >
                                            <svg className="w-4 h-4 text-slate-500 group-hover:text-slate-700 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                            </svg>
                                            Drafts
                                            {drafts_count > 0 && (
                                                <span className="min-w-[20px] h-5 px-1.5 rounded-md bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100 text-[11px] font-semibold flex items-center justify-center tabular-nums" aria-hidden="true">
                                                    {drafts_count}
                                                </span>
                                            )}
                                        </Link>
                                        <Link
                                            href="/applications/encode"
                                            className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border border-blue-600 bg-blue-600 shadow-sm shadow-blue-900/10 hover:bg-blue-700 hover:border-blue-700 active:bg-blue-800 text-white text-[13px] font-semibold transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.25" aria-hidden="true">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                            </svg>
                                            New application
                                        </Link>
                                    </div>
                                )}
                                </div>
                                <div className="flex items-end gap-3 px-4 pt-2.5 overflow-x-auto">
                                <div className="flex items-end gap-1" role="group" aria-label="Filter by status">
                                    {[
                                        { label: "All", status: "", count: getStatusCount(""), d: "M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm0 5.25h.007v.008H3.75V12zm0 5.25h.007v.008H3.75v-.008z" },
                                        { label: "Received", status: "Received", count: receivedCount, d: "M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M2.25 13.5V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.5M2.25 13.5l2.4-7.2A2.25 2.25 0 016.79 4.5h10.42a2.25 2.25 0 012.14 1.8l2.4 7.2" },
                                        { label: "Technical review", status: "Technical Review", count: reviewCount, d: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" },
                                        { label: "Sangguniang Bayan", status: "Under Sangguniang Bayan", count: sbCount, d: "M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18" },
                                        { label: "Issued / ready", status: "Released", count: releasedCount, d: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
                                    ].map((tab) => {
                                        const isActive = tab.status === "" ? !selectedStatus : selectedStatus === tab.status;
                                        return (
                                            <button
                                                key={tab.label}
                                                type="button"
                                                aria-pressed={isActive}
                                                onClick={() => setSelectedStatus(tab.status)}
                                                className={`relative -mb-px flex items-center gap-2 px-4 py-2.5 rounded-t-xl border text-[12.5px] font-semibold whitespace-nowrap transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                                    isActive
                                                        ? "bg-white border-slate-200 border-b-white text-blue-700"
                                                        : "bg-slate-50 border-slate-200/70 text-slate-500 hover:text-slate-800 hover:bg-white/70"
                                                }`}
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d={tab.d} />
                                                </svg>
                                                {tab.label}
                                                <span className={`text-[10.5px] font-bold tabular-nums px-1.5 py-px rounded-full ${isActive ? "bg-blue-700 text-white" : "bg-slate-200 text-slate-600"}`}>
                                                    {tab.count}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                                </div>
                                </div>

                                {/* —— FILTER TOOLBAR —— */}
                                <div className="px-4 py-3 flex flex-wrap items-center gap-2 shrink-0">
                                    <div className="relative w-full sm:w-72 shrink-0">
                                        <svg
                                            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            aria-hidden="true"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                        </svg>
                                        <input
                                            ref={searchInputRef}
                                            type="text"
                                            value={searchInput}
                                            onChange={(e) => setSearchInput(e.target.value)}
                                            placeholder="Search applicant, reference, barangay…"
                                            aria-label="Search applications"
                                            className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50/60 pl-9 pr-8 text-[13px] text-slate-800 transition-colors focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 placeholder:text-slate-400"
                                        />
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                                            {searchInput ? (
                                                <button
                                                    type="button"
                                                    onClick={() => { setSearchInput(""); setDebouncedSearch(""); }}
                                                    aria-label="Clear search"
                                                    className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            ) : (
                                                <kbd className="text-[10px] font-mono text-slate-400 bg-white border border-slate-200 px-1.5 rounded">/</kbd>
                                            )}
                                        </div>
                                    </div>

                                    <DropdownSelect
                                        variant="pill"
                                        label="Category"
                                        value={selectedCategory}
                                        onChange={(val) => setSelectedCategory(val)}
                                        options={APP_TYPES}
                                        allLabel="All categories"
                                    />

                                    <DropdownSelect
                                        variant="pill"
                                        label="Barangay"
                                        value={selectedBarangay}
                                        onChange={(val) => setSelectedBarangay(val)}
                                        options={ROSARIO_BARANGAYS}
                                        allLabel="All barangays"
                                        searchPlaceholder="Search 48 barangays..."
                                        withSearch={true}
                                    />

                                    {/* Date Range Popover Button */}
                                    <div className="relative" ref={dateFilterRef}>
                                        <button
                                            type="button"
                                            onClick={() => setDateFilterOpen(!dateFilterOpen)}
                                            aria-expanded={dateFilterOpen}
                                            className={`h-9 px-3 rounded-lg border text-[13px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                                                dateFrom || dateTo
                                                    ? "border-blue-200 bg-blue-50 text-blue-800"
                                                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                                            }`}
                                        >
                                            <svg className="w-4 h-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                                            </svg>
                                            {dateFrom || dateTo ? `${formatDate(dateFrom)} – ${formatDate(dateTo)}` : "Filing date"}
                                        </button>

                                        {dateFilterOpen && (
                                            <div className="absolute left-0 mt-1 z-50 bg-white rounded-xl shadow-lg border border-slate-200/90 p-3 min-w-[260px] animate-in fade-in zoom-in-95">
                                                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Filing Date Presets</p>
                                                <div className="grid grid-cols-2 gap-1 mb-3">
                                                    {DATE_PRESETS.map((p) => (
                                                        <button
                                                            key={p.value}
                                                            type="button"
                                                            onClick={() => handleDatePreset(p.value)}
                                                            className={`text-xs px-2 py-1.5 rounded-md text-left font-medium transition-all ${
                                                                dateRangePreset === p.value
                                                                    ? "bg-blue-600 text-white font-semibold"
                                                                    : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                                                            }`}
                                                        >
                                                            {p.label}
                                                        </button>
                                                    ))}
                                                </div>

                                                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Custom Date Range</p>
                                                <div className="space-y-2">
                                                    <div>
                                                        <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Date From</label>
                                                        <input
                                                            type="date"
                                                            value={dateFrom}
                                                            onChange={(e) => { setDateFrom(e.target.value); setDateRangePreset("custom"); }}
                                                            className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-md outline-none focus:bg-white focus:border-blue-500"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Date To</label>
                                                        <input
                                                            type="date"
                                                            value={dateTo}
                                                            onChange={(e) => { setDateTo(e.target.value); setDateRangePreset("custom"); }}
                                                            className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-md outline-none focus:bg-white focus:border-blue-500"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="mt-3 pt-2 border-t border-slate-100 flex justify-between">
                                                    <button
                                                        type="button"
                                                        onClick={() => { setDateFrom(""); setDateTo(""); setDateRangePreset("all"); setDateFilterOpen(false); }}
                                                        className="text-xs text-rose-600 hover:underline font-semibold cursor-pointer"
                                                    >
                                                        Reset
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDateFilterOpen(false)}
                                                        className="text-xs bg-slate-900 text-white px-3 py-1 rounded-md font-semibold cursor-pointer"
                                                    >
                                                        Apply
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {hasActiveFilters && (
                                        <button
                                            type="button"
                                            onClick={clearFilters}
                                            className="h-9 px-2 text-[13px] font-medium text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                                        >
                                            Reset
                                        </button>
                                    )}

                                    {/* Sort + View switcher */}
                                    <div className="flex items-center gap-2 ml-auto">
                                        {/* LOOP 9D: Admin aggregate delivery monitoring filter.
                                            Rendered only when the SERVER enabled the feature, and
                                            applied server-side, so the browser never decides which
                                            round an application is judged by. */}
                                        {deliveryMonitoringEnabled && (
                                            <select
                                                value={selectedDelivery}
                                                onChange={(e) => {
                                                    setSelectedDelivery(e.target.value);
                                                    const next = new URLSearchParams(window.location.search);
                                                    if (e.target.value && e.target.value !== "all") {
                                                        next.set("delivery_status", e.target.value);
                                                    } else {
                                                        next.delete("delivery_status");
                                                    }
                                                    const qs = next.toString();
                                                    router.visit(qs ? `${window.location.pathname}?${qs}` : window.location.pathname, {
                                                        preserveScroll: true,
                                                    });
                                                }}
                                                title="Filter by FieldSync delivery state (Admin monitoring)"
                                                aria-label="Filter by FieldSync delivery state"
                                                className="h-9 text-[13px] font-medium pl-3 pr-8 rounded-lg border border-slate-200 bg-white text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 cursor-pointer"
                                            >
                                                {(delivery_monitoring?.states || []).map((s) => (
                                                    <option key={s.value} value={s.value}>
                                                        {s.label}
                                                    </option>
                                                ))}
                                            </select>
                                        )}

                                        <DropdownSelect
                                            variant="ghost"
                                            value={selectedSort === "newest" ? "" : selectedSort}
                                            onChange={(val) => setSelectedSort(val || "newest")}
                                            options={SORT_OPTIONS.slice(1)}
                                            allLabel="Newest filing"
                                        />
                                        <div className="border border-slate-200 p-0.5 rounded-lg flex items-center" role="group" aria-label="View mode">
                                            {[
                                                { mode: "list", label: "List view", d: "M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" },
                                                { mode: "folder", label: "Folder view", d: "M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" },
                                            ].map((v) => (
                                                <button
                                                    key={v.mode}
                                                    type="button"
                                                    onClick={() => setViewMode(v.mode)}
                                                    aria-label={v.label}
                                                    aria-pressed={viewMode === v.mode}
                                                    title={v.label}
                                                    className={`w-8 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
                                                        viewMode === v.mode ? "bg-slate-100 text-slate-900" : "text-slate-400 hover:text-slate-700"
                                                    }`}
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d={v.d} />
                                                    </svg>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                            {/* —— DATA VIEW (LIST / FOLDERS) —— */}
                            {viewMode === "list" ? (
                                <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
                                    <div className="flex-1 overflow-auto custom-scrollbar">
                                        <table className="tabular-nums w-full text-left border-separate border-spacing-0 min-w-[760px] text-[13px] table-fixed">
                                            <thead className="sticky top-0 z-10 bg-slate-100">
                                                <tr className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 [&>th]:border-y [&>th]:border-slate-200 [&>th]:py-2.5 [&>th]:px-3 [&>th]:whitespace-nowrap [&>th]:font-semibold">
                                                    <th className="w-11 !pl-4 !pr-2">
                                                        <span className="sr-only">Select (Ctrl+A selects all, Esc clears)</span>
                                                    </th>
                                                    <th className="w-[140px]" aria-sort={selectedSort === "ref_asc" ? "ascending" : "none"}>
                                                        <SortHeader label="Reference no." dir={selectedSort === "ref_asc" ? "asc" : null} onClick={() => handleHeaderSort("ref")} />
                                                    </th>
                                                    <th className="w-[24%]" aria-sort={selectedSort === "applicant_asc" ? "ascending" : selectedSort === "applicant_desc" ? "descending" : "none"}>
                                                        <SortHeader label="Applicant" dir={selectedSort === "applicant_asc" ? "asc" : selectedSort === "applicant_desc" ? "desc" : null} onClick={() => handleHeaderSort("applicant")} />
                                                    </th>
                                                    <th>Application type</th>
                                                    <th className="w-[140px]">Barangay</th>
                                                    <th className="w-[130px]" aria-sort={selectedSort === "newest" ? "descending" : selectedSort === "oldest" ? "ascending" : "none"}>
                                                        <SortHeader label="Date filed" dir={selectedSort === "newest" ? "desc" : selectedSort === "oldest" ? "asc" : null} onClick={() => handleHeaderSort("date")} />
                                                    </th>
                                                    <th className="w-[180px] !pr-4">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedRecords.map((item, idx) => {
                                                    const refCode = item.reference_number || `APP-${item.id}`;
                                                    const key = rowKey(item);
                                                    const types = splitTypes(item.application_type);
                                                    const delivery = deliveryMonitoringEnabled ? item.delivery_monitoring : null;
                                                    const isSelected = Boolean(peekItem && rowKey(peekItem) === key);
                                                    const isFocused = focusedRowIndex === idx;
                                                    const isChecked = selectedIds.includes(key);

                                                    return (
                                                        <tr
                                                            key={key ?? idx}
                                                            onClick={() => { setPeekItem(item); setFocusedRowIndex(idx); }}
                                                            aria-selected={isSelected}
                                                            className={`cursor-pointer transition-colors align-middle [&>td]:border-b [&>td]:border-slate-100 [&>td]:py-2 [&>td]:px-3 ${
                                                                isSelected || isChecked ? "bg-blue-50/60" : isFocused ? "bg-slate-50" : "bg-white hover:bg-slate-50/80"
                                                            }`}
                                                        >
                                                            <td
                                                                className={`!pl-4 !pr-2 ${isSelected || isChecked ? "shadow-[inset_3px_0_0_#2563eb]" : ""}`}
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedIds.includes(key)}
                                                                    onChange={() => toggleRow(key)}
                                                                    aria-label={`Select ${item.applicant_name || refCode}`}
                                                                    className="w-4 h-4 rounded border-slate-300 text-blue-700 focus:ring-blue-500 cursor-pointer"
                                                                />
                                                            </td>

                                                            <td className="whitespace-nowrap">
                                                                <span className="text-[12px] font-medium text-slate-500 tracking-wide">{refCode}</span>
                                                            </td>

                                                            <td>
                                                                <p className="font-medium text-slate-900 truncate" title={item.applicant_name || undefined}>
                                                                    {item.applicant_name || "Unknown Applicant"}
                                                                </p>
                                                            </td>

                                                            <td>
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-slate-700 truncate" title={[types.join(", "), item.remarks?.trim() && `Remark: ${item.remarks.trim()}`].filter(Boolean).join("\n")}>{types[0] || "—"}</span>
                                                                    {types.length > 1 && (
                                                                        <span className="shrink-0 text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 rounded" title={types.slice(1).join(", ")}>
                                                                            +{types.length - 1}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>

                                                            <td className="text-slate-700 truncate">
                                                                {item.barangay || <span className="text-slate-300">—</span>}
                                                            </td>

                                                            <td className="whitespace-nowrap">
                                                                <span className="text-slate-600" title={timeAgo(item.created_at)}>{formatDate(item.created_at)}</span>
                                                            </td>

                                                            <td className="!pr-4">
                                                                <StageMeter item={item} />
                                                                {/* Land use, inspection and delivery details live in the
                                                                    preview panel; only a delivery failure is surfaced here. */}
                                                                {delivery?.failure_label && (
                                                                    <p className="mt-1 text-[11px] font-medium text-red-700">{delivery.failure_label}</p>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>

                                        {filteredList.length === 0 && (
                                            <div className="flex flex-col items-center justify-center text-slate-400 py-16">
                                                <p className="font-bold text-[14px] text-slate-700">No applications match your filter</p>
                                                <p className="text-xs mt-1 text-slate-400">Try clearing active filters or adjusting your search term</p>
                                                <button
                                                    type="button"
                                                    onClick={clearFilters}
                                                    className="mt-3 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 cursor-pointer"
                                                >
                                                    Clear All Filters
                                                </button>
                                            </div>
                                        )}

                                        {/* End of list: auto-loads the next batch on scroll; the button
                                            is the keyboard / screen-reader path to the same action. */}
                                        {filteredList.length > 0 && (
                                            <div ref={loadMoreRef} className="py-4 flex items-center justify-center gap-3 text-[12px] text-slate-400" aria-live="polite">
                                                {hasMore ? (
                                                    <button
                                                        type="button"
                                                        onClick={loadNextPage}
                                                        disabled={isFetchingMore}
                                                        className="inline-flex items-center gap-2 h-8 px-3 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-wait"
                                                    >
                                                        <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 border-t-blue-600 animate-spin" aria-hidden="true" />
                                                        {isFetchingMore ? "Loading…" : `Load more · ${fullDataset.length} of ${applications?.total ?? fullDataset.length} loaded`}
                                                    </button>
                                                ) : (
                                                    <>
                                                        <span className="h-px w-10 bg-slate-200" aria-hidden="true" />
                                                        All {filteredList.length} {filteredList.length === 1 ? "application" : "applications"} shown
                                                        {selectedIds.length > 0 && <span className="text-blue-700 font-medium">· {selectedIds.length} selected</span>}
                                                        <span className="h-px w-10 bg-slate-200" aria-hidden="true" />
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {selectedIds.length > 0 && (
                                        <div
                                            role="status"
                                            className="absolute left-1/2 -translate-x-1/2 bottom-16 z-20 flex items-center gap-3 pl-2 pr-4 py-2 rounded-full bg-slate-900 text-white shadow-xl shadow-slate-900/30"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => setSelectedIds([])}
                                                aria-label="Clear selection"
                                                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                            <span className="min-w-[24px] h-6 px-2 rounded-full bg-white/15 text-[12px] font-bold tabular-nums flex items-center justify-center">
                                                {selectedIds.length}
                                            </span>
                                            <span className="text-[13px] font-medium whitespace-nowrap">
                                                {selectedIds.length === 1 ? "application selected" : "applications selected"}
                                            </span>
                                            <span className="hidden sm:inline text-[11.5px] text-slate-400 whitespace-nowrap">
                                                <kbd className="font-sans px-1 rounded bg-white/10 text-slate-300">Ctrl A</kbd> all · <kbd className="font-sans px-1 rounded bg-white/10 text-slate-300">Esc</kbd> clear
                                            </span>
                                        </div>
                                    )}

                                </div>
                            ) : (
                                /* —— FOLDER ARCHIVE VIEW —— */
                                <div className="flex-1 overflow-y-auto p-6 relative">
                                    {selectedFolder && selectedApplicant ? (
                                        <>
                                            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                                                <button 
                                                    type="button" 
                                                    onClick={() => setSelectedApplicant(null)}
                                                    className="flex items-center justify-center w-8 h-8 bg-white border border-slate-200/90 rounded-lg hover:bg-slate-50 text-slate-600 hover:text-blue-700 shadow-2xs transition-all cursor-pointer"
                                                    title="Back to applicants"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                                                </button>
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                                                        <span 
                                                            className="hover:text-blue-600 cursor-pointer transition-colors"
                                                            onClick={() => { setSelectedFolder(null); setSelectedApplicant(null); }}
                                                        >
                                                            Barangays
                                                        </span>
                                                        <span className="text-slate-300">/</span>
                                                        <span 
                                                            className="hover:text-blue-600 cursor-pointer transition-colors"
                                                            onClick={() => setSelectedApplicant(null)}
                                                        >
                                                            {selectedFolder}
                                                        </span>
                                                        <span className="text-slate-300">/</span>
                                                        <span className="text-slate-700 font-semibold">{selectedApplicant}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <h3 className="text-base font-bold text-slate-900 tracking-tight">{selectedApplicant}</h3>
                                                        <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200/60 font-mono text-[11px] font-bold">
                                                            {(applicantGroups[selectedApplicant] || []).length} Application{(applicantGroups[selectedApplicant] || []).length !== 1 ? 's' : ''}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            {applicantGroups[selectedApplicant]?.length > 0 ? (
                                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-6 gap-y-8 text-center">
                                                    {(applicantGroups[selectedApplicant] || []).map((item, idx) => (
                                                        <div
                                                            key={idx}
                                                            className="group flex flex-col items-center p-3 rounded-2xl transition-all cursor-pointer hover:bg-white hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-1 border border-transparent hover:border-slate-200/60"
                                                            onClick={() => router.visit(item.id ? `/applications/${item.id}` : '#')}
                                                        >
                                                            <div className="relative mb-3 transition-transform duration-300 text-slate-300 group-hover:text-blue-500">
                                                                <svg width="72" height="72" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-md text-blue-500 group-hover:drop-shadow-lg transition-all duration-300">
                                                                    <path d="M22 14C22 10.6863 24.6863 8 28 8H60L82 30V86C82 89.3137 79.3137 92 76 92H28C24.6863 92 22 89.3137 22 86V14Z" fill="url(#doc-base)"/>
                                                                    <path d="M60 8V24C60 27.3137 62.6863 30 66 30H82L60 8Z" fill={getFoldColor(item.application_type)}/>
                                                                    <rect x="34" y="44" width="32" height="5" rx="2.5" fill="#CBD5E1"/>
                                                                    <rect x="34" y="58" width="20" height="5" rx="2.5" fill="#CBD5E1"/>
                                                                    <rect x="34" y="72" width="26" height="5" rx="2.5" fill="#CBD5E1"/>
                                                                    <rect x="34" y="24" width="12" height="12" rx="4" fill={getDocColor(item.application_type)}/>
                                                                    <defs>
                                                                        <linearGradient id="doc-base" x1="52" y1="8" x2="52" y2="92" gradientUnits="userSpaceOnUse">
                                                                            <stop stopColor="#ffffff"/>
                                                                            <stop offset="1" stopColor="#F1F5F9"/>
                                                                        </linearGradient>
                                                                        <linearGradient id="doc-fold" x1="71" y1="8" x2="71" y2="30" gradientUnits="userSpaceOnUse">
                                                                            <stop stopColor="#E0E7FF"/>
                                                                            <stop offset="1" stopColor="#93C5FD"/>
                                                                        </linearGradient>
                                                                    </defs>
                                                                </svg>
                                                            </div>
                                                            <span className="text-[12px] font-bold text-slate-700 leading-snug line-clamp-1 group-hover:text-blue-700 transition-colors">
                                                                {item.reference_number || `APP-${item.id}`}
                                                            </span>
                                                            <span className="text-[10px] text-slate-400 font-medium mt-1">
                                                                {item.created_at ? new Date(item.created_at).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'}) : "—"}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                                                    <svg className="w-10 h-10 mb-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                                    </svg>
                                                    <p className="font-semibold text-sm">No applications found</p>
                                                </div>
                                            )}
                                        </>
                                    ) : selectedFolder ? (
                                        <>
                                            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                                                <button 
                                                    type="button" 
                                                    onClick={() => { setSelectedFolder(null); setSelectedApplicant(null); }}
                                                    className="flex items-center justify-center w-8 h-8 bg-white border border-slate-200/90 rounded-lg hover:bg-slate-50 text-slate-600 hover:text-blue-700 shadow-2xs transition-all cursor-pointer"
                                                    title="Back to all barangays"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                                                </button>
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                                                        <span 
                                                            className="hover:text-blue-600 cursor-pointer transition-colors"
                                                            onClick={() => { setSelectedFolder(null); setSelectedApplicant(null); }}
                                                        >
                                                            Barangays
                                                        </span>
                                                        <span className="text-slate-300">/</span>
                                                        <span className="text-slate-700 font-semibold">{selectedFolder}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <h3 className="text-base font-bold text-slate-900 tracking-tight">{selectedFolder}</h3>
                                                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/60 font-mono text-[11px] font-bold">
                                                            {Object.keys(applicantGroups).length} Applicant{Object.keys(applicantGroups).length !== 1 ? 's' : ''}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            {Object.keys(applicantGroups).length > 0 ? (
                                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-6 gap-y-8 text-center">
                                                    {Object.entries(applicantGroups).map(([appName, apps]) => (
                                                        <div
                                                            key={appName}
                                                            className="group cursor-pointer flex flex-col items-center p-2 rounded-xl hover:bg-blue-50/50 transition-colors"
                                                            onClick={() => setSelectedApplicant(appName)}
                                                            title={`View ${apps.length} application(s) for ${appName}`}
                                                        >
                                                            <div className="relative mb-3 transition-transform duration-200 group-hover:scale-105 group-hover:-translate-y-1">
                                                                <svg width="76" height="76" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-sm">
                                                                    <path d="M10 28C10 24.6863 12.6863 22 16 22H36.1716C37.7628 22 39.2889 22.6321 40.4142 23.7574L46.5858 29.9289C47.7111 31.0543 49.2372 31.6863 50.8284 31.6863H84C87.3137 31.6863 90 34.3726 90 37.6863V76C90 79.3137 87.3137 82 84 82H16C12.6863 82 10 79.3137 10 76V28Z" fill="url(#folder-back)"/>
                                                                    <path d="M26 14C26 12.8954 26.8954 12 28 12H58L72 26V48C72 49.1046 71.1046 50 70 50H28C26.8954 50 26 49.1046 26 48V14Z" fill={getDocColor(apps[0]?.application_type)} />
                                                                    <path d="M72 26H60C58.8954 26 58 25.1046 58 24V12L72 26Z" fill={getFoldColor(apps[0]?.application_type)} />
                                                                    <rect x="34" y="22" width="18" height="3" rx="1.5" fill="#CBD5E1" />
                                                                    <rect x="34" y="28" width="24" height="3" rx="1.5" fill="#CBD5E1" />
                                                                    <rect x="34" y="34" width="20" height="3" rx="1.5" fill="#CBD5E1" />
                                                                    <path d="M10 40C10 36.6863 12.6863 34 16 34H84C87.3137 34 90 36.6863 90 40V76C90 79.3137 87.3137 82 84 82H16C12.6863 82 10 79.3137 10 76V40Z" fill="url(#folder-front)"/>
                                                                    <defs>
                                                                        <linearGradient id="folder-back" x1="50" y1="22" x2="50" y2="82" gradientUnits="userSpaceOnUse">
                                                                            <stop stopColor="#F59E0B" />
                                                                            <stop offset="1" stopColor="#D97706" />
                                                                        </linearGradient>
                                                                        <linearGradient id="folder-front" x1="50" y1="34" x2="50" y2="82" gradientUnits="userSpaceOnUse">
                                                                            <stop stopColor="#FCD34D" />
                                                                            <stop offset="1" stopColor="#F59E0B" />
                                                                        </linearGradient>
                                                                    </defs>
                                                                </svg>
                                                                <span className="absolute -bottom-1 -right-1 bg-white text-slate-800 text-[10px] font-black px-1.5 py-0.5 min-w-[20px] rounded-full shadow-sm border border-slate-200">
                                                                    {apps.length}
                                                                </span>
                                                            </div>
                                                            <span className="text-[11px] font-bold text-slate-700 leading-snug line-clamp-2 px-1 group-hover:text-blue-700">
                                                                {appName}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                                                    <svg className="w-10 h-10 mb-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                                    </svg>
                                                    <p className="font-semibold text-sm">No applications in this barangay</p>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-200/60">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                                                        </svg>
                                                    </div>
                                                    <h3 className="text-sm font-bold text-slate-800 tracking-tight">Barangay Archive Folders</h3>
                                                </div>
                                                <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200/60 font-mono text-xs font-bold">
                                                    {Object.keys(folderGroups).length} Barangays
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-6 gap-y-8 text-center">
                                                {Object.entries(folderGroups).map(([groupName, apps]) => (
                                                    <div
                                                        key={groupName}
                                                        className="group cursor-pointer flex flex-col items-center p-2 rounded-xl hover:bg-blue-50/50 transition-colors"
                                                        onClick={() => setSelectedFolder(groupName)}
                                                        title={`View ${apps.length} application(s) for ${groupName}`}
                                                    >
                                                        <div className="relative mb-3 transition-transform duration-200 group-hover:scale-105 group-hover:-translate-y-1">
                                                            <svg
                                                                width="76"
                                                                height="76"
                                                                viewBox="0 0 100 100"
                                                                fill="none"
                                                                xmlns="http://www.w3.org/2000/svg"
                                                                className="drop-shadow-sm"
                                                            >
                                                                <path d="M10 28C10 24.6863 12.6863 22 16 22H36.1716C37.7628 22 39.2889 22.6321 40.4142 23.7574L46.5858 29.9289C47.7111 31.0543 49.2372 31.6863 50.8284 31.6863H84C87.3137 31.6863 90 34.3726 90 37.6863V76C90 79.3137 87.3137 82 84 82H16C12.6863 82 10 79.3137 10 76V28Z" fill="url(#folder-back)"/>
                                                                <path d="M26 14C26 12.8954 26.8954 12 28 12H58L72 26V48C72 49.1046 71.1046 50 70 50H28C26.8954 50 26 49.1046 26 48V14Z" fill="white" />
                                                                <path d="M72 26H60C58.8954 26 58 25.1046 58 24V12L72 26Z" fill="#E2E8F0" />
                                                                <rect x="34" y="22" width="18" height="3" rx="1.5" fill="#CBD5E1" />
                                                                <rect x="34" y="28" width="24" height="3" rx="1.5" fill="#CBD5E1" />
                                                                <rect x="34" y="34" width="20" height="3" rx="1.5" fill="#CBD5E1" />
                                                                <path d="M10 40C10 36.6863 12.6863 34 16 34H84C87.3137 34 90 36.6863 90 40V76C90 79.3137 87.3137 82 84 82H16C12.6863 82 10 79.3137 10 76V40Z" fill="url(#folder-front)"/>
                                                                <defs>
                                                                    <linearGradient id="folder-back" x1="50" y1="22" x2="50" y2="82" gradientUnits="userSpaceOnUse">
                                                                        <stop stopColor="#F59E0B" />
                                                                        <stop offset="1" stopColor="#D97706" />
                                                                    </linearGradient>
                                                                    <linearGradient id="folder-front" x1="50" y1="34" x2="50" y2="82" gradientUnits="userSpaceOnUse">
                                                                        <stop stopColor="#FCD34D" />
                                                                        <stop offset="1" stopColor="#F59E0B" />
                                                                    </linearGradient>
                                                                </defs>
                                                            </svg>
                                                            <span className="absolute -bottom-1 -right-1 bg-white text-slate-800 text-[10px] font-black px-1.5 py-0.5 min-w-[20px] rounded-full shadow-sm border border-slate-200">
                                                                {apps.length}
                                                            </span>
                                                        </div>
                                                        <span className="text-[11px] font-bold text-slate-700 leading-snug line-clamp-2 px-1 group-hover:text-blue-700">
                                                            {groupName}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                            {Object.keys(folderGroups).length === 0 && (
                                                <div className="flex flex-col items-center justify-center h-full text-slate-400 p-10">
                                                    <svg className="w-12 h-12 mb-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                                    </svg>
                                                    <p className="font-semibold text-sm">No records found</p>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* —— QUICK PREVIEW PANEL —— */}
                        {viewMode === "list" && peekItem && (
                            <aside id="quick-preview" aria-label="Quick preview" className="hidden lg:flex w-[288px] shrink-0 bg-white rounded-xl border border-slate-200 flex-col min-h-0 overflow-hidden">
                                <div className="flex-1 overflow-y-auto custom-scrollbar">
                                    {/* Identity */}
                                    <div className="px-4 pt-3 pb-3.5 border-b border-slate-100">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-mono text-[11px] text-slate-500">
                                                    {peekItem.reference_number || `APP-${peekItem.id}`}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleCopyRef(e, peekItem.reference_number || `APP-${peekItem.id}`)}
                                                    aria-label="Copy reference number"
                                                    className="text-slate-400 hover:text-blue-600 p-0.5 cursor-pointer"
                                                >
                                                    {copiedRef === (peekItem.reference_number || `APP-${peekItem.id}`) ? (
                                                        <span className="text-[10px] text-emerald-600 font-semibold">Copied</span>
                                                    ) : (
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v2.25A2.25 2.25 0 0113.5 21.75h-9a2.25 2.25 0 01-2.25-2.25v-9a2.25 2.25 0 012.25-2.25h2.25m3 0v-2.25A2.25 2.25 0 0110.5 3.75h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-2.25" />
                                                        </svg>
                                                    )}
                                                </button>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setPeekItem(null)}
                                                aria-label="Close preview"
                                                className="-mr-2 w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                        <h3 className="text-[15px] font-bold text-slate-900 leading-snug mt-0.5">
                                            {peekItem.applicant_name || "Unknown Applicant"}
                                        </h3>
                                        <p className="text-[12px] text-slate-500 mt-0.5">
                                            {splitTypes(peekItem.application_type)[0] || "—"}
                                            {peekItem.barangay ? ` · Brgy. ${peekItem.barangay}` : ""}
                                        </p>
                                    </div>

                                    {/* Progress */}
                                    <div className="px-4 py-3 border-b border-slate-100">
                                        <div className="flex items-center justify-between mb-2.5">
                                            <h4 className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wide">Progress</h4>
                                            <StatusBadge status={peekItem.status} />
                                        </div>
                                        <ol>
                                            {getProgressSteps(peekItem).map((step, idx, arr) => {
                                                const isLast = idx === arr.length - 1;
                                                const sub = step.state === "current"
                                                    ? "Current stage"
                                                    : step.state === "pending"
                                                    ? "Pending"
                                                    : step.state === "denied"
                                                    ? "Not reached"
                                                    : step.key === "Received"
                                                    ? `Filed ${formatDate(peekItem.created_at)}`
                                                    : "Completed";
                                                return (
                                                    <li key={step.key} className="flex gap-2.5" aria-current={step.state === "current" ? "step" : undefined}>
                                                        <div className="flex flex-col items-center">
                                                            {step.state === "done" ? (
                                                                <span className="w-3.5 h-3.5 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                                                                    <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5" aria-hidden="true">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                                    </svg>
                                                                </span>
                                                            ) : step.state === "current" ? (
                                                                <span className="w-3.5 h-3.5 rounded-full border-[3px] border-blue-600 bg-white shrink-0" />
                                                            ) : (
                                                                <span className={`w-3.5 h-3.5 rounded-full border-2 bg-white shrink-0 ${step.state === "denied" ? "border-rose-200" : "border-slate-200"}`} />
                                                            )}
                                                            {!isLast && <span className={`w-px flex-1 min-h-[10px] ${step.state === "done" ? "bg-blue-600" : "bg-slate-200"}`} />}
                                                        </div>
                                                        <div className={isLast ? "" : "pb-2"}>
                                                            <p className={`text-[12px] leading-[14px] ${step.state === "current" ? "font-semibold text-slate-900" : step.state === "done" ? "text-slate-800" : "text-slate-400"}`}>
                                                                {step.label}
                                                            </p>
                                                            <p className="text-[10.5px] text-slate-400">{sub}</p>
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ol>
                                        {peekItem.status === "Denied" && (
                                            <p className="mt-3 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200/80 rounded-lg px-2.5 py-1.5">
                                                Application denied
                                            </p>
                                        )}
                                    </div>

                                    {/* Details */}
                                    <dl className="px-4 py-3 grid grid-cols-[76px_1fr] gap-x-2 gap-y-1.5 text-[12px]">
                                        <dt className="text-slate-500">Application</dt>
                                        <dd className="text-slate-900">{splitTypes(peekItem.application_type).join(", ") || "—"}</dd>
                                        <dt className="text-slate-500">Land use</dt>
                                        <dd className="text-slate-900">{peekItem.target_land_use_class || peekItem.land_use_class || "—"}</dd>
                                        <dt className="text-slate-500">Fee</dt>
                                        <dd className="font-mono text-slate-900">{formatFee(peekItem.assessment_fee)}</dd>
                                        <dt className="text-slate-500">Filed</dt>
                                        <dd className="text-slate-900 whitespace-nowrap">{formatDate(peekItem.created_at)} <span className="text-slate-400">· {timeAgo(peekItem.created_at)}</span></dd>
                                        <dt className="text-slate-500">Remarks</dt>
                                        <dd className="text-slate-900 break-words">{peekItem.remarks?.trim() || "—"}</dd>
                                    </dl>

                                    {/* Field inspection & LOOP 9D delivery — every string is server-authored */}
                                    {(peekItem.inspection_summary || (deliveryMonitoringEnabled && peekItem.delivery_monitoring)) && (
                                        <div className="px-4 py-3 border-t border-slate-100 space-y-2">
                                            <h4 className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wide">Field inspection</h4>
                                            {peekItem.inspection_summary && (
                                                <p className="text-[12px] text-slate-800">{peekItem.inspection_summary}</p>
                                            )}
                                            {deliveryMonitoringEnabled && peekItem.delivery_monitoring && (() => {
                                                const d = peekItem.delivery_monitoring;
                                                return (
                                                    <div className="space-y-1.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[11px] font-medium px-1.5 py-px rounded border ${DELIVERY_STATE_STYLES[d.state] || DELIVERY_STATE_STYLES.no_delivery_record}`}>
                                                                {d.label}
                                                            </span>
                                                            {d.is_superseded === true && (
                                                                <span className="text-[11px] text-slate-400" title="A newer inspection round exists for this parcel.">Superseded</span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-slate-500 leading-snug">{d.message}</p>
                                                        <dl className="grid grid-cols-[76px_1fr] gap-x-2 gap-y-1 text-[11px]">
                                                            {d.inspector && (<><dt className="text-slate-500">Inspector</dt><dd className="text-slate-800">{d.inspector.name}</dd></>)}
                                                            <dt className="text-slate-500">Attempts</dt><dd className="text-slate-800 tabular-nums">{d.attempt_count}</dd>
                                                            {d.last_attempt_at && (<><dt className="text-slate-500">Last attempt</dt><dd className="text-slate-800">{formatDate(d.last_attempt_at)}</dd></>)}
                                                            {d.delivered_at && (<><dt className="text-slate-500">Delivered</dt><dd className="text-slate-800">{formatDate(d.delivered_at)}</dd></>)}
                                                            {d.failure_label && (<><dt className="text-slate-500">Category</dt><dd className="font-medium text-red-700">{d.failure_label}</dd></>)}
                                                        </dl>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}
                                </div>

                                <div className="p-3 border-t border-slate-100 flex items-center gap-2 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => { if (peekItem.id) router.visit(`/applications/${peekItem.id}`); }}
                                        disabled={!peekItem.id}
                                        className="flex-1 h-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[12.5px] font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                                    >
                                        Open full record
                                    </button>
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => setMoreOpen((o) => !o)}
                                            aria-label="More actions"
                                            aria-haspopup="menu"
                                            aria-expanded={moreOpen}
                                            className="w-8 h-8 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center justify-center transition-colors cursor-pointer"
                                        >
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
                                            </svg>
                                        </button>
                                        {moreOpen && (
                                            <div role="menu" className="absolute bottom-full right-0 mb-1 w-48 bg-white rounded-xl shadow-lg border border-slate-200/90 p-1 z-50">
                                                <button
                                                    type="button"
                                                    role="menuitem"
                                                    onClick={(e) => { handleCopyRef(e, peekItem.reference_number || `APP-${peekItem.id}`); setMoreOpen(false); }}
                                                    className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
                                                >
                                                    Copy reference number
                                                </button>
                                                {peekItem.id && (
                                                    <a
                                                        role="menuitem"
                                                        href={`/applications/${peekItem.id}`}
                                                        target="_blank"
                                                        rel="noopener"
                                                        onClick={() => setMoreOpen(false)}
                                                        className="block px-2.5 py-1.5 text-xs rounded-lg text-slate-700 hover:bg-slate-50"
                                                    >
                                                        Open in new tab
                                                    </a>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </aside>
                        )}
                    </div>
                        </div>

                    {/* —— END OF MAIN CONTENT —— */}
                </main>
            </div>
        </div>
        </>
    );
}
