import React, { useState, useEffect, useMemo, useRef } from "react";
import { Head, router, Link } from "@inertiajs/react";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import { performLogout } from "@/utils/auth";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ── Status Configuration ──
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
    "bg-indigo-100 text-indigo-700 border-indigo-200",
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

// ── 10 Realistic Applications ──
const SAMPLE_APPLICATIONS = [
    {
        id: 101,
        reference_number: "LC-2026-0814",
        applicant_name: "Batangas Agro-Industrial Corp.",
        representative_name: "Atty. Eduardo Castillo",
        contact_number: "0917-882-9012",
        email: "operations@batangasagro.ph",
        application_type: "Locational Clearance",
        purpose: "Cold storage facility & processing plant with logistics loading bay",
        land_use_class: "Agro-Industrial",
        barangay: "San Carlos",
        lot_number: "Lot 412-A",
        tct_number: "TCT-058-202400918",
        lot_area_sqm: "4500.00",
        created_at: "2026-08-28T09:30:00Z",
        assessment_fee: "18500.00",
        or_number: "OR-7890123",
        remarks: "Environmental clearance certificate submitted. Endorsed for technical evaluation.",
        status: "Technical Review",
    },
    {
        id: 102,
        reference_number: "ZC-2026-0932",
        applicant_name: "Rosario Heights Realty Dev.",
        representative_name: "Engr. Maria Santos",
        contact_number: "0920-554-1920",
        email: "msantos@rosarioheights.com",
        application_type: "Zoning Certificate",
        purpose: "Medium-density residential subdivision phase 2 development",
        land_use_class: "Residential",
        barangay: "Poblacion C",
        lot_number: "Lot 108",
        tct_number: "TCT-058-202300451",
        lot_area_sqm: "12500.00",
        created_at: "2026-08-27T14:15:00Z",
        assessment_fee: "12400.00",
        or_number: "OR-7890124",
        remarks: "Endorsed to Sangguniang Bayan committee on housing and land use.",
        status: "Under Sangguniang Bayan",
    },
    {
        id: 103,
        reference_number: "DP-2026-0419",
        applicant_name: "Prime Meridian Commercial Hub",
        representative_name: "Arch. Dominic Velasquez",
        contact_number: "0918-332-8811",
        email: "dvelasquez@primemeridian.ph",
        application_type: "Development Permit",
        purpose: "Commercial complex & logistics terminal with parking arcade",
        land_use_class: "Commercial",
        barangay: "Namunga",
        lot_number: "Lot 25-B",
        tct_number: "TCT-058-202500892",
        lot_area_sqm: "8200.00",
        created_at: "2026-08-26T11:00:00Z",
        assessment_fee: "35000.00",
        or_number: "OR-7890125",
        remarks: "Final assessment clearance approved. Application ready for release.",
        status: "For Release",
    },
    {
        id: 104,
        reference_number: "LC-2026-0775",
        applicant_name: "Southpoint Grain Silo Corp.",
        representative_name: "Jonathan D. Perez",
        contact_number: "0922-771-4091",
        email: "jperez@southpointgrain.com",
        application_type: "Locational Clearance",
        purpose: "Post-harvest solar grain drying facility and silo depot",
        land_use_class: "Agricultural",
        barangay: "Quilib",
        lot_number: "Lot 701",
        tct_number: "TCT-058-202200114",
        lot_area_sqm: "6300.00",
        created_at: "2026-08-25T16:45:00Z",
        assessment_fee: "8750.00",
        or_number: "OR-7890126",
        remarks: "Official locational clearance certificate issued to applicant.",
        status: "Released",
    },
    {
        id: 105,
        reference_number: "SLUP-2026-0120",
        applicant_name: "Batangas Green Power Systems",
        representative_name: "Clarissa Ramos",
        contact_number: "0919-445-6672",
        email: "cramos@greenpower.ph",
        application_type: "Preliminary Approval and Locational Clearance (PALC)",
        purpose: "5MW ground-mounted solar utility substation installation",
        land_use_class: "Special Use",
        barangay: "Pinagsibaan",
        lot_number: "Lot 14-E",
        tct_number: "TCT-058-202600019",
        lot_area_sqm: "22000.00",
        created_at: "2026-08-24T10:20:00Z",
        assessment_fee: "24600.00",
        or_number: "OR-7890127",
        remarks: "Initial application received. Queueing for technical evaluation review.",
        status: "Received",
    },
    {
        id: 106,
        reference_number: "LC-2026-0562",
        applicant_name: "Batangas Poultry & Feed Mills Inc.",
        representative_name: "Ricardo G. Alcantara",
        contact_number: "0917-550-9933",
        email: "ralcantara@batangaspoultry.com",
        application_type: "Locational Clearance",
        purpose: "Automated broiler poultry farm & organic fertilizer processing unit",
        land_use_class: "Agro-Industrial",
        barangay: "Cahigam",
        lot_number: "Lot 88",
        tct_number: "TCT-058-202400331",
        lot_area_sqm: "9500.00",
        created_at: "2026-08-23T08:15:00Z",
        assessment_fee: "15200.00",
        or_number: "OR-7890128",
        remarks: "Site inspection scheduled for odor and buffer-zone setback verification.",
        status: "Technical Review",
    },
    {
        id: 107,
        reference_number: "DP-2026-0881",
        applicant_name: "Sunrise Eco-Park & Resort Residences",
        representative_name: "Arch. Patricia Lim",
        contact_number: "0921-663-8822",
        email: "plim@sunriseecopark.ph",
        application_type: "Development Permit",
        purpose: "Eco-tourism park with private villa subdivision residential strip",
        land_use_class: "Special Use",
        barangay: "Bagong Pook",
        lot_number: "Lot 301-C",
        tct_number: "TCT-058-202300891",
        lot_area_sqm: "35000.00",
        created_at: "2026-08-22T13:40:00Z",
        assessment_fee: "42000.00",
        or_number: "OR-7890129",
        remarks: "Referred to Sangguniang Bayan committee on environment & tourism.",
        status: "Under Sangguniang Bayan",
    },
    {
        id: 108,
        reference_number: "ZC-2026-0411",
        applicant_name: "Dr. Antonio V. Hernandez Clinic",
        representative_name: null,
        contact_number: "0918-229-4410",
        email: "ahernandez.md@gmail.com",
        application_type: "Zoning Certificate",
        purpose: "Outpatient surgical, dialysis & diagnostic laboratory facility",
        land_use_class: "Institutional",
        barangay: "Poblacion B",
        lot_number: "Lot 52",
        tct_number: "TCT-058-202100412",
        lot_area_sqm: "1850.00",
        created_at: "2026-08-21T15:10:00Z",
        assessment_fee: "9500.00",
        or_number: "OR-7890130",
        remarks: "New application filed. Documents undergoing initial completeness check.",
        status: "Received",
    },
    {
        id: 109,
        reference_number: "LC-2026-0929",
        applicant_name: "Grand Rosario Fuel & Convenience Hub",
        representative_name: "Ferdinand M. Tan",
        contact_number: "0917-440-1928",
        email: "ftan@grandfuel.ph",
        application_type: "Locational Clearance",
        purpose: "Service gasoline station with retail strip convenience arcade",
        land_use_class: "Commercial",
        barangay: "San Roque",
        lot_number: "Lot 19-A",
        tct_number: "TCT-058-202500122",
        lot_area_sqm: "3200.00",
        created_at: "2026-08-20T11:25:00Z",
        assessment_fee: "21800.00",
        or_number: "OR-7890131",
        remarks: "Zoning requirements met. Certificate pending final release signature.",
        status: "For Release",
    },
    {
        id: 110,
        reference_number: "SLUP-2026-0305",
        applicant_name: "Calantas Telecommunications Tower Site",
        representative_name: "Atty. Vincent Cruz",
        contact_number: "0920-881-2299",
        email: "legal@telecominfra.ph",
        application_type: "Preliminary Approval and Locational Clearance (PALC)",
        purpose: "48-meter 5G cellular transceiver tower structure and shelter",
        land_use_class: "Special Use",
        barangay: "Calantas",
        lot_number: "Lot 99",
        tct_number: "TCT-058-202400551",
        lot_area_sqm: "800.00",
        created_at: "2026-08-19T09:50:00Z",
        assessment_fee: "16000.00",
        or_number: "OR-7890132",
        remarks: "Denied due to non-compliance with municipal residential radius clearance buffer.",
        status: "Denied",
    },
];

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

const PROGRESS_STEPS = [
    { key: "Received", label: "Received" },
    { key: "Technical Review", label: "Technical review" },
    { key: "Under Sangguniang Bayan", label: "Sangguniang Bayan" },
    { key: "For Release", label: "Issued / ready for release" },
];

function getProgressSteps(status) {
    if (status === "Denied") {
        return PROGRESS_STEPS.map((step) => ({ ...step, state: "denied" }));
    }
    const currentIndex = status === "Released"
        ? PROGRESS_STEPS.length
        : PROGRESS_STEPS.findIndex((step) => step.key === status);
    return PROGRESS_STEPS.map((step, idx) => ({
        ...step,
        state: idx < currentIndex ? "done" : idx === currentIndex ? "current" : "pending",
    }));
}

function StatusBadge({ status }) {
    const s = status || "Received";
    const cfg = STATUS_CONFIG[s] || { dot: "bg-slate-400", label: s };
    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold whitespace-nowrap">
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} shrink-0`} />
            {cfg.label}
        </span>
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

// ── Leaflet Custom Marker Icon Generator ──
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

// ── Accessible, Keyboard-Friendly Dropdown Select Component ──
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
                    className={`h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                        isCurrentlyActive
                            ? "border-blue-300 bg-blue-50 text-blue-800 font-semibold"
                            : "border-dashed border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-800"
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
                    className="h-9 px-2 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
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

export default function Index({ applications, filters = {}, auth = {}, status_counts = {}, inspectors = [], drafts_count = 0 }) {
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
    const [selectedSort, setSelectedSort] = useState(urlParams.get("sort") || filters?.sort || "newest");
    const [pageSize, setPageSize] = useState(Number(urlParams.get("size")) || 10);
    const [currentPage, setCurrentPage] = useState(Number(urlParams.get("page")) || 1);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [copiedRef, setCopiedRef] = useState(null);
    const [viewMode, setViewMode] = useState("list"); // 'list' | 'folder'
    const [selectedFolder, setSelectedFolder] = useState(null);
    const [selectedApplicant, setSelectedApplicant] = useState(null);
    const [peekItem, setPeekItem] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);
    const [moreOpen, setMoreOpen] = useState(false);

    // ── FILTER STATES ──
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
            setCurrentPage(1);
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
        if (currentPage > 1) params.set("page", String(currentPage));
        if (pageSize !== 10) params.set("size", String(pageSize));

        const queryStr = params.toString();
        const newUrl = queryStr ? `${window.location.pathname}?${queryStr}` : window.location.pathname;
        window.history.replaceState({}, "", newUrl);
    }, [debouncedSearch, selectedStatus, selectedCategory, selectedLandUse, selectedBarangay, selectedSort, dateFrom, dateTo, dateRangePreset, currentPage, pageSize]);

    const isUsingPlaceholders = !applications || !Array.isArray(applications?.data) || applications.data.length === 0;

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
        setCurrentPage(1);
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
        setCurrentPage(1);
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
                confirmButton: "inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer",
                cancelButton: "inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-all active:scale-95 cursor-pointer",
            },
        }).then((result) => {
            if (result.isConfirmed) {
                performLogout();
            }
        });
    };

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
        setCurrentPage(1);
    };

    // Dynamic Status Count Helper
    const fullDataset = isUsingPlaceholders ? SAMPLE_APPLICATIONS : (applications?.data || []);

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
        let list = isUsingPlaceholders ? [...SAMPLE_APPLICATIONS] : [...(applications?.data || [])];

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
    }, [applications, isUsingPlaceholders, selectedStatus, selectedCategory, selectedLandUse, debouncedSearch, selectedBarangay, selectedSort, dateFrom, dateTo]);

    // Client-side pagination calculation
    const totalPages = Math.max(1, Math.ceil(filteredList.length / pageSize));
    
    const paginatedRecords = useMemo(() => {
        if (filteredList.length <= 10) return filteredList;
        const startIdx = (currentPage - 1) * pageSize;
        return filteredList.slice(startIdx, startIdx + pageSize);
    }, [filteredList, currentPage, pageSize]);

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

    const startIndex = filteredList.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const endIndex = Math.min(currentPage * pageSize, filteredList.length);

    const rowKey = (item) => item?.id ?? item?.reference_number;
    const pageKeys = paginatedRecords.map(rowKey);
    const allPageSelected = pageKeys.length > 0 && pageKeys.every((k) => selectedIds.includes(k));
    const toggleRow = (key) => setSelectedIds((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
    const togglePage = () => setSelectedIds((prev) => (allPageSelected ? prev.filter((k) => !pageKeys.includes(k)) : [...new Set([...prev, ...pageKeys])]));

    // Open the first record in the preview panel on load, like the registry concept
    useEffect(() => {
        if (paginatedRecords[0]) setPeekItem(paginatedRecords[0]);
    }, []);

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

    // ── Keyboard Navigation (/, ↑ / ↓, j / k, Enter, Space, Esc) ──
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
            }

            if (!isInput) {
                if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    searchInputRef.current?.focus();
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
    }, [viewMode, paginatedRecords, focusedRowIndex, peekItem, dateFilterOpen]);

    // ── Export CSV Handler ──
    const handleExportCSV = () => {
        const headers = ["Reference Number", "Applicant Name", "Representative", "Application Type", "Land Use Class", "Barangay", "Lot Area (sqm)", "TCT Number", "Assessment Fee (PHP)", "OR Number", "Status", "Date Filed", "Purpose"];
        const source = selectedIds.length > 0 ? filteredList.filter((app) => selectedIds.includes(rowKey(app))) : filteredList;
        const rows = source.map((app) => [
            `"${app.reference_number || ""}"`,
            `"${app.applicant_name || ""}"`,
            `"${app.representative_name || ""}"`,
            `"${app.application_type || ""}"`,
            `"${app.land_use_class || ""}"`,
            `"${app.barangay || ""}"`,
            `"${app.lot_area_sqm || ""}"`,
            `"${app.tct_number || ""}"`,
            `"${app.assessment_fee || ""}"`,
            `"${app.or_number || ""}"`,
            `"${app.status || ""}"`,
            `"${formatDate(app.created_at)}"`,
            `"${(app.purpose || "").replace(/"/g, '""')}"`,
        ]);

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Rosario_Zoning_Registry_${new Date().toISOString().split("T")[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // ── Print Official Transmittal Registry ──
    const handlePrintTransmittal = () => {
        window.print();
    };

    // Map bounds calculation
    const mapBounds = useMemo(() => {
        return filteredList.map((app) => BARANGAY_COORDS[app.barangay] || BARANGAY_COORDS["Default"]);
    }, [filteredList]);

    return (
        <>
            <Head title="Zoning Applications | iMAPS" />
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

            <div id="dashboard-root" className="bg-slate-100/60 font-sans text-slate-800 h-screen flex flex-col overflow-hidden">
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
                        <div className="p-4 sm:p-6 flex-1 flex flex-col h-full overflow-hidden max-w-[1580px] mx-auto w-full gap-3.5">
                            
                            {/* ── TOP HEADER SECTION ── */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 no-print">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                        </svg>
                                    </div>
                                    <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-none">
                                        Application Registry
                                    </h1>
                                    <span className="text-xs font-medium text-slate-500 pt-0.5">
                                        {filteredList.length} {filteredList.length === 1 ? "record" : "records"}
                                    </span>
                                </div>

                                <div className="flex items-center gap-2">
                                    {/* Secondary actions grouped into one segmented control */}
                                    <div className="inline-flex items-stretch h-9 rounded-lg border border-slate-200 bg-white shadow-2xs divide-x divide-slate-200 overflow-hidden">
                                        <button
                                            type="button"
                                            onClick={handlePrintTransmittal}
                                            className="inline-flex items-center gap-1.5 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                                            title="Print official transmittal summary"
                                        >
                                            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M7 9V3h10v6M7 17H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2M7 14h10v7H7z" />
                                            </svg>
                                            <span>Print</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handleExportCSV()}
                                            className="inline-flex items-center gap-1.5 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                                            title={selectedIds.length > 0 ? `Export ${selectedIds.length} selected to CSV` : "Export filtered records to CSV"}
                                        >
                                            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                            </svg>
                                            <span>{selectedIds.length > 0 ? `Export (${selectedIds.length})` : "Export"}</span>
                                        </button>

                                        {userRole === "Planning Officer" && (
                                            <Link
                                                href="/applications/drafts"
                                                className="inline-flex items-center gap-1.5 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                                            >
                                                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                                </svg>
                                                <span>Drafts</span>
                                                {drafts_count > 0 && (
                                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600" aria-hidden="true"></span>
                                                )}
                                            </Link>
                                        )}
                                    </div>

                                    {/* Drafts */}
                                    {userRole === "Planning Officer" && (
                                        <>
                                            <Link
                                                href="/applications/encode"
                                                className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold shadow-xs transition-all active:scale-95"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                                </svg>
                                                <span>New Application</span>
                                            </Link>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* ── STATUS KPI TILES (also act as status filter) ── */}
                            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-1.5 grid grid-cols-2 md:grid-cols-5 gap-1.5 shrink-0 no-print">
                                {[
                                    { label: "All filings", status: "", count: getStatusCount(""), dot: "bg-slate-500" },
                                    { label: "Received", status: "Received", count: receivedCount, dot: "bg-emerald-500" },
                                    { label: "Technical Review", status: "Technical Review", count: reviewCount, dot: "bg-amber-500" },
                                    { label: "Sangguniang Bayan", status: "Under Sangguniang Bayan", count: sbCount, dot: "bg-purple-500" },
                                    { label: "Issued / Ready", status: "Released", count: releasedCount, dot: "bg-blue-600" },
                                ].map((tile) => {
                                    const isActive = tile.status === "" ? !selectedStatus : selectedStatus === tile.status;
                                    const pct = tile.status === "" ? 100 : Math.round((tile.count / totalCount) * 100);
                                    return (
                                        <button
                                            key={tile.label}
                                            type="button"
                                            aria-pressed={isActive}
                                            onClick={() => {
                                                setSelectedStatus(tile.status === "" || selectedStatus === tile.status ? "" : tile.status);
                                                setCurrentPage(1);
                                            }}
                                            className={`text-left rounded-lg px-3.5 py-2.5 border transition-colors cursor-pointer ${
                                                isActive ? "border-blue-500 ring-1 ring-blue-500/30 bg-blue-50/30" : "border-transparent hover:bg-slate-50"
                                            }`}
                                        >
                                            <span className="flex items-center gap-2 text-xs font-medium text-slate-700">
                                                <span className={`w-2 h-2 rounded-full ${tile.dot}`} aria-hidden="true" />
                                                {tile.label}
                                            </span>
                                            <span className="flex items-baseline gap-1.5 mt-1">
                                                <span className="text-2xl font-bold text-slate-900 tabular-nums">{tile.count}</span>
                                                <span className="text-[11px] text-slate-400 font-medium">{tile.status === "" ? "total" : `${pct}%`}</span>
                                            </span>
                                            <span className="block h-1 rounded-full bg-slate-100 mt-2 overflow-hidden" aria-hidden="true">
                                                <span className={`block h-full rounded-full ${isActive ? "bg-blue-600" : "bg-slate-300"}`} style={{ width: `${pct}%` }} />
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* ── MASTER WORKSPACE ROW (TABLE CARD + QUICK PREVIEW PANEL) ── */}
                            <div className="flex-1 flex gap-3.5 min-h-0 no-print">

                            {/* ── UNIFIED MASTER WORKSPACE CARD ── */}
                            <div className="flex-1 min-w-0 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex flex-col min-h-0 overflow-hidden">

                                {/* ── INTEGRATED FILTER TOOLBAR ── */}
                                <div className="px-3 py-2.5 bg-white border-b border-slate-200/80 flex flex-wrap items-center gap-2 shrink-0">
                                    {/* Main Search Input */}
                                    <div className="relative w-full sm:w-56 shrink-0">
                                        <svg
                                            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                        </svg>
                                        <input
                                            ref={searchInputRef}
                                            type="text"
                                            value={searchInput}
                                            onChange={(e) => setSearchInput(e.target.value)}
                                            placeholder="Search name, reference, barangay"
                                            aria-label="Search applications"
                                            className="w-full h-9 rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-xs text-slate-800 transition-all focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 placeholder:text-slate-400"
                                        />
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                            {searchInput ? (
                                                <button
                                                    onClick={() => { setSearchInput(""); setDebouncedSearch(""); setCurrentPage(1); }}
                                                    className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            ) : (
                                                <span className="text-[10px] font-mono text-slate-400 bg-slate-100 border border-slate-200 px-1 py-0.2 rounded">/</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Filters */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <DropdownSelect
                                            variant="pill"
                                            label="Category"
                                            value={selectedCategory}
                                            onChange={(val) => { setSelectedCategory(val); setCurrentPage(1); }}
                                            options={APP_TYPES}
                                            allLabel="All categories"
                                        />

                                        <DropdownSelect
                                            variant="pill"
                                            label="Barangay"
                                            value={selectedBarangay}
                                            onChange={(val) => { setSelectedBarangay(val); setCurrentPage(1); }}
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
                                                className={`h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                                                    dateFrom || dateTo
                                                        ? "border-blue-300 bg-blue-50 text-blue-800 font-semibold"
                                                        : "border-dashed border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-800"
                                                }`}
                                            >
                                                {dateFrom || dateTo ? (
                                                    <span>Filed: {formatDate(dateFrom)} – {formatDate(dateTo)}</span>
                                                ) : (
                                                    <>
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                                        </svg>
                                                        <span>Filing date</span>
                                                    </>
                                                )}
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

                                    </div>

                                    {/* Sort + View switcher */}
                                    <div className="flex items-center gap-2 ml-auto">
                                        <DropdownSelect
                                            variant="ghost"
                                            value={selectedSort === "newest" ? "" : selectedSort}
                                            onChange={(val) => { setSelectedSort(val || "newest"); setCurrentPage(1); }}
                                            options={SORT_OPTIONS.slice(1)}
                                            allLabel="Newest filing"
                                        />
                                        <div className="bg-slate-100 p-0.5 rounded-lg flex items-center" role="group" aria-label="View mode">
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
                                                    className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
                                                        viewMode === v.mode ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"
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

                                {/* ── ACTIVE FILTERS CHIP STRIP ── */}
                                {hasActiveFilters && (
                                    <div className="flex items-center gap-1.5 flex-wrap px-3.5 py-2 bg-slate-50/70 border-b border-slate-100 text-xs shrink-0">
                                        <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Active:</span>
                                        {selectedStatus && (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold">
                                                Status: {selectedStatus === "Released" ? "Issued / Ready" : selectedStatus}
                                                <button onClick={() => setSelectedStatus("")} className="hover:text-rose-600 font-bold ml-0.5 cursor-pointer">✕</button>
                                            </span>
                                        )}
                                        {selectedCategory && (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium">
                                                Type: {selectedCategory}
                                                <button onClick={() => setSelectedCategory("")} className="hover:text-rose-600 font-bold ml-0.5 cursor-pointer">✕</button>
                                            </span>
                                        )}
                                        {selectedBarangay && (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium">
                                                Brgy: {selectedBarangay}
                                                <button onClick={() => setSelectedBarangay("")} className="hover:text-rose-600 font-bold ml-0.5 cursor-pointer">✕</button>
                                            </span>
                                        )}
                                        {(dateFrom || dateTo) && (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium">
                                                Date: {formatDate(dateFrom)} - {formatDate(dateTo)}
                                                <button onClick={() => { setDateFrom(""); setDateTo(""); setDateRangePreset("all"); }} className="hover:text-rose-600 font-bold ml-0.5 cursor-pointer">✕</button>
                                            </span>
                                        )}
                                        {debouncedSearch && (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium">
                                                Query: "{debouncedSearch}"
                                                <button onClick={() => { setSearchInput(""); setDebouncedSearch(""); }} className="hover:text-rose-600 font-bold ml-0.5 cursor-pointer">✕</button>
                                            </span>
                                        )}
                                        <button
                                            onClick={clearFilters}
                                            className="text-xs font-semibold text-rose-600 hover:text-rose-700 ml-auto transition-colors cursor-pointer"
                                        >
                                            Clear All Filters
                                        </button>
                                    </div>
                                )}

                            {/* ── DATA VIEW (LIST / FOLDERS) ── */}
                            {viewMode === "list" ? (
                                <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
                                    <div className="flex-1 overflow-auto custom-scrollbar">
                                        <table className="w-full text-left border-collapse min-w-[640px]">
                                            <thead className="sticky top-0 z-10 bg-white border-b border-slate-200/90">
                                                <tr className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                                                    <th className="py-3 pl-4 pr-2 w-10">
                                                        <input
                                                            type="checkbox"
                                                            checked={allPageSelected}
                                                            onChange={togglePage}
                                                            aria-label="Select all applications on this page"
                                                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                        />
                                                    </th>
                                                    <th className="py-3 px-3">
                                                        <button type="button" onClick={() => handleHeaderSort("applicant")} className="uppercase tracking-wider hover:text-slate-800 cursor-pointer">
                                                            Applicant{selectedSort === "applicant_asc" ? " ↑" : selectedSort === "applicant_desc" ? " ↓" : ""}
                                                        </button>
                                                    </th>
                                                    <th className="py-3 px-3">Application</th>
                                                    <th className="py-3 px-3">Barangay</th>
                                                    <th className="py-3 px-3">
                                                        <button type="button" onClick={() => handleHeaderSort("date")} className="uppercase tracking-wider hover:text-slate-800 cursor-pointer">
                                                            Filed{selectedSort === "newest" ? " ↓" : selectedSort === "oldest" ? " ↑" : ""}
                                                        </button>
                                                    </th>
                                                    <th className="py-3 pr-4 w-10"><span className="sr-only">Open</span></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {paginatedRecords.map((item, idx) => {
                                                    const refCode = item.reference_number || `APP-${item.id}`;
                                                    const key = rowKey(item);
                                                    const types = splitTypes(item.application_type);
                                                    const landUse = item.target_land_use_class || item.land_use_class;
                                                    const subline = types.length > 1
                                                        ? types.slice(1).join(", ")
                                                        : landUse
                                                        ? `Land use · ${landUse}`
                                                        : item.remarks?.trim()
                                                        ? `Remark · ${item.remarks}`
                                                        : "—";
                                                    const isSelected = peekItem && rowKey(peekItem) === key;
                                                    const isFocused = focusedRowIndex === idx;

                                                    return (
                                                        <tr
                                                            key={key ?? idx}
                                                            onClick={() => { setPeekItem(item); setFocusedRowIndex(idx); }}
                                                            aria-selected={Boolean(isSelected)}
                                                            className={`cursor-pointer transition-colors group ${
                                                                isSelected ? "bg-blue-50/50" : "hover:bg-slate-50"
                                                            } ${isFocused ? "ring-1 ring-inset ring-blue-500" : ""}`}
                                                        >
                                                            <td className="py-3 pl-4 pr-2" onClick={(e) => e.stopPropagation()}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedIds.includes(key)}
                                                                    onChange={() => toggleRow(key)}
                                                                    aria-label={`Select ${item.applicant_name || refCode}`}
                                                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                                />
                                                            </td>

                                                            <td className="py-3 px-3">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-semibold shrink-0">
                                                                        {getInitials(item.applicant_name)}
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <p className="text-[13px] font-semibold text-slate-900 truncate max-w-[180px]">
                                                                            {item.applicant_name || "Unknown Applicant"}
                                                                        </p>
                                                                        <p className="font-mono text-[11px] text-slate-400">{refCode}</p>
                                                                    </div>
                                                                </div>
                                                            </td>

                                                            <td className="py-3 px-3">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-[13px] text-slate-800 truncate max-w-[200px]">{types[0] || "—"}</span>
                                                                    {types.length > 1 && (
                                                                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded" title={types.slice(1).join(", ")}>
                                                                            +{types.length - 1}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="text-[11px] text-slate-400 truncate max-w-[220px]">{subline}</p>
                                                            </td>

                                                            <td className="py-3 px-3 text-[13px] text-slate-700 whitespace-nowrap">
                                                                {item.barangay || "—"}
                                                            </td>

                                                            <td className="py-3 px-3 whitespace-nowrap">
                                                                <p className="text-[13px] text-slate-700">{formatDate(item.created_at)}</p>
                                                                <p className="text-[11px] text-slate-400">{timeAgo(item.created_at)}</p>
                                                            </td>

                                                            <td className="py-3 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                                                                <Link
                                                                    href={item.id ? `/applications/${item.id}` : "#"}
                                                                    aria-label={`View full record for ${item.applicant_name || refCode}`}
                                                                    title="View full record"
                                                                    className="inline-flex w-8 h-8 items-center justify-center rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                                                >
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                    </svg>
                                                                </Link>
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
                                    </div>

                                    {/* Table Footer with Summary & Pagination */}
                                    <div className="px-4 py-3 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 shrink-0">
                                        <span>
                                            <strong className="text-slate-900 font-semibold">{startIndex}–{endIndex}</strong> of {filteredList.length} applications
                                            {selectedIds.length > 0 && <span className="ml-2 text-blue-700 font-medium">· {selectedIds.length} selected</span>}
                                        </span>

                                        <div className="flex items-center gap-5">
                                            <div className="flex items-center gap-2">
                                                <span>Rows per page</span>
                                                <div className="bg-slate-100 p-0.5 rounded-lg flex items-center" role="group" aria-label="Rows per page">
                                                    {[10, 25, 50].map((size) => (
                                                        <button
                                                            key={size}
                                                            type="button"
                                                            aria-pressed={pageSize === size}
                                                            onClick={() => { setPageSize(size); setCurrentPage(1); }}
                                                            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                                                                pageSize === size ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                                                            }`}
                                                        >
                                                            {size}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span>Page <strong className="text-slate-900 font-semibold">{currentPage}</strong> of {totalPages}</span>
                                                <button
                                                    type="button"
                                                    disabled={currentPage <= 1}
                                                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                                    aria-label="Previous page"
                                                    className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                                                    </svg>
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={currentPage >= totalPages}
                                                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                                    aria-label="Next page"
                                                    className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                                    </svg>
                                                </button>
                                            </div>

                                            <span
                                                className="hidden lg:flex w-8 h-8 items-center justify-center rounded-lg text-slate-400"
                                                title="Shortcuts: / search · ↑↓ or j/k move · Space preview · Enter open · Esc close"
                                                aria-label="Keyboard shortcuts: slash to search, arrows to move, space to preview, enter to open, escape to close"
                                                role="img"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                                    <rect x="2.25" y="6" width="19.5" height="12" rx="2" />
                                                    <path strokeLinecap="round" d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M7.5 14h9" />
                                                </svg>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* ── FOLDER ARCHIVE VIEW ── */
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
                                                            {(applicantGroups[selectedApplicant] || []).length} Document{(applicantGroups[selectedApplicant] || []).length !== 1 ? 's' : ''}
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

                        {/* ── QUICK PREVIEW PANEL ── */}
                        {viewMode === "list" && peekItem && (
                            <aside id="quick-preview" aria-label="Quick preview" className="hidden lg:flex w-[300px] shrink-0 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex-col min-h-0 overflow-hidden">
                                <div className="flex-1 overflow-y-auto custom-scrollbar">
                                    {/* Identity */}
                                    <div className="p-4 border-b border-slate-100">
                                        <div className="flex items-start gap-3">
                                            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center text-sm font-semibold shrink-0">
                                                {getInitials(peekItem.applicant_name)}
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="text-[15px] font-bold text-slate-900 leading-snug">
                                                    {peekItem.applicant_name || "Unknown Applicant"}
                                                </h3>
                                                <div className="flex items-center gap-1.5 mt-0.5">
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
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setPeekItem(null)}
                                                aria-label="Close preview"
                                                className="ml-auto -mr-1 -mt-1 w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                        <div className="mt-3">
                                            <StatusBadge status={peekItem.status} />
                                        </div>
                                    </div>

                                    {/* Progress */}
                                    <div className="p-4 border-b border-slate-100">
                                        <h4 className="text-xs font-semibold text-slate-900 mb-3">Progress</h4>
                                        <ol>
                                            {getProgressSteps(peekItem.status).map((step, idx, arr) => {
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
                                                    <li key={step.key} className="flex gap-3" aria-current={step.state === "current" ? "step" : undefined}>
                                                        <div className="flex flex-col items-center">
                                                            {step.state === "done" ? (
                                                                <span className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                                                                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5" aria-hidden="true">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                                    </svg>
                                                                </span>
                                                            ) : step.state === "current" ? (
                                                                <span className="w-4 h-4 rounded-full border-[3px] border-blue-600 bg-white shrink-0" />
                                                            ) : (
                                                                <span className={`w-4 h-4 rounded-full border-2 bg-white shrink-0 ${step.state === "denied" ? "border-rose-200" : "border-slate-300"}`} />
                                                            )}
                                                            {!isLast && <span className={`w-0.5 flex-1 min-h-[20px] ${step.state === "done" ? "bg-blue-600" : "bg-slate-200"}`} />}
                                                        </div>
                                                        <div className={isLast ? "" : "pb-3"}>
                                                            <p className={`text-xs leading-4 ${step.state === "current" ? "font-bold text-slate-900" : step.state === "done" ? "font-medium text-slate-900" : "font-medium text-slate-500"}`}>
                                                                {step.label}
                                                            </p>
                                                            <p className="text-[11px] text-slate-400">{sub}</p>
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ol>
                                        {peekItem.status === "Denied" && (
                                            <p className="mt-3 text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200/80 rounded-lg px-2.5 py-1.5">
                                                Application denied
                                            </p>
                                        )}
                                    </div>

                                    {/* Details */}
                                    <dl className="p-4 grid grid-cols-[96px_1fr] gap-x-3 gap-y-2.5 text-xs">
                                        <dt className="text-slate-500">Application</dt>
                                        <dd className="text-slate-900">{splitTypes(peekItem.application_type).join(", ") || "—"}</dd>
                                        <dt className="text-slate-500">Land use</dt>
                                        <dd className="text-slate-900">{peekItem.target_land_use_class || peekItem.land_use_class || "—"}</dd>
                                        <dt className="text-slate-500">Location</dt>
                                        <dd className="text-slate-900">{peekItem.barangay ? `Brgy. ${peekItem.barangay}` : "—"}</dd>
                                        <dt className="text-slate-500">Assessment fee</dt>
                                        <dd className="font-mono font-semibold text-slate-900">{formatFee(peekItem.assessment_fee)}</dd>
                                        <dt className="text-slate-500">Filed</dt>
                                        <dd className="text-slate-900">{formatDate(peekItem.created_at)} <span className="text-slate-400">· {timeAgo(peekItem.created_at)}</span></dd>
                                        <dt className="text-slate-500">Remarks</dt>
                                        <dd className="text-slate-900 break-words">{peekItem.remarks?.trim() || "—"}</dd>
                                    </dl>
                                </div>

                                <div className="p-3.5 border-t border-slate-200/80 flex items-center gap-2 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => { if (peekItem.id) router.visit(`/applications/${peekItem.id}`); }}
                                        disabled={!peekItem.id}
                                        className="flex-1 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
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
                                            className="w-10 h-10 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center justify-center transition-colors cursor-pointer"
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

                    {/* ── END OF MAIN CONTENT ── */}
                </main>
            </div>
        </div>
        </>
    );
}
