import React, { useState, useEffect, useMemo, useRef } from "react";
import { Head, router, Link } from "@inertiajs/react";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ── Status Configuration ──
const STATUS_CONFIG = {
    Received: {
        bg: "bg-emerald-50 text-emerald-800 border-emerald-300",
        dot: "bg-emerald-500",
        markerColor: "#10b981",
        label: "Received",
    },
    "Technical Review": {
        bg: "bg-amber-50 text-amber-800 border-amber-300",
        dot: "bg-amber-500",
        markerColor: "#f59e0b",
        label: "Technical Review",
    },
    "Under Sangguniang Bayan": {
        bg: "bg-purple-50 text-purple-800 border-purple-300",
        dot: "bg-purple-500",
        markerColor: "#a855f7",
        label: "SB Review",
    },
    "For Release": {
        bg: "bg-sky-50 text-sky-800 border-sky-300",
        dot: "bg-sky-500",
        markerColor: "#0ea5e9",
        label: "For Release",
    },
    Released: {
        bg: "bg-indigo-50 text-indigo-800 border-indigo-300",
        dot: "bg-indigo-600",
        markerColor: "#4f46e5",
        label: "Released",
    },
    Denied: {
        bg: "bg-rose-50 text-rose-800 border-rose-300",
        dot: "bg-rose-500",
        markerColor: "#f43f5e",
        label: "Denied",
    },
};

const LAND_USE_BADGES = {
    Residential: "bg-emerald-50 text-emerald-800 border-emerald-300 font-bold",
    Commercial: "bg-amber-50 text-amber-800 border-amber-300 font-bold",
    Industrial: "bg-rose-50 text-rose-800 border-rose-300 font-bold",
    "Agro-Industrial": "bg-purple-50 text-purple-800 border-purple-300 font-bold",
    Agricultural: "bg-lime-50 text-lime-800 border-lime-300 font-bold",
    Institutional: "bg-sky-50 text-sky-800 border-sky-300 font-bold",
    "Special Use": "bg-indigo-50 text-indigo-800 border-indigo-300 font-bold",
};

const STATUSES = ["Received", "Technical Review", "Under Sangguniang Bayan", "For Release", "Released", "Denied"];
const APP_TYPES = ["Locational Clearance", "Zoning Certification", "Development Permit", "Special Land Use Permit"];
const LAND_USE_CLASSES = ["Residential", "Commercial", "Industrial", "Agro-Industrial", "Agricultural", "Institutional", "Special Use"];
const ROSARIO_BARANGAYS = [
    "Antipolo", "Bagong Pook", "Balibago", "Bayawang", "Baybayin", "Bulihan", "Cahigam", 
    "Calantas", "Colongan", "Itlugan", "Lumbangan", "Maalas-as", "Mabato", "Mabunga", "Macalamcam A", 
    "Macalamcam B", "Malaya", "Maligaya", "Marilag", "Masaya", "Matamis", "Mavalor", "Mayuro", 
    "Namuco", "Namunga", "Natu", "Nasi", "Palakpak", "Pinagsibaan", "Poblacion A", "Poblacion B", 
    "Poblacion C", "Poblacion D", "Poblacion E", "Putingkahoy", "Quilib", "Salao", "San Carlos", 
    "San Ignacio", "San Isidro", "San Jose", "San Roque", "Santa Cruz", "Timbugan"
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
    "Default": [13.8475, 121.2058],
};

const SORT_OPTIONS = [
    { value: "newest", label: "Newest Filing First" },
    { value: "oldest", label: "Oldest Filing First" },
    { value: "fee_desc", label: "Highest Fee (₱)" },
    { value: "fee_asc", label: "Lowest Fee (₱)" },
    { value: "applicant_asc", label: "Applicant Name (A-Z)" },
    { value: "applicant_desc", label: "Applicant Name (Z-A)" },
    { value: "ref_asc", label: "Application Ref (A-Z)" },
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
        application_type: "Zoning Certification",
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
        application_type: "Special Land Use Permit",
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
        application_type: "Zoning Certification",
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
        application_type: "Special Land Use Permit",
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

function StatusBadge({ status }) {
    const s = status || "Received";
    const cfg = STATUS_CONFIG[s] || { bg: "bg-slate-100 text-slate-700 border-slate-200", dot: "bg-slate-400", label: s };
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shadow-2xs ${cfg.bg}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} shrink-0`} />
            {cfg.label}
        </span>
    );
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
        if (!value) return allLabel;
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

    return (
        <div className="relative w-full" ref={dropdownRef} onKeyDown={handleKeyDown}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full text-xs font-medium px-3 py-2 rounded-xl border transition-all flex items-center justify-between gap-2 shadow-xs ${
                    isOpen
                        ? "border-blue-500 ring-2 ring-blue-500/10 bg-white text-slate-900 shadow-xs"
                        : value
                        ? "border-blue-300 bg-blue-50/50 text-blue-900 font-semibold hover:border-blue-400"
                        : "border-slate-200 bg-slate-50/60 hover:bg-white text-slate-700 hover:border-slate-300"
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

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-white rounded-2xl shadow-xl border border-slate-200/90 p-2 min-w-[210px] max-w-sm animate-in fade-in zoom-in-95 duration-150">
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

export default function Index({ applications, filters = {}, auth = {}, status_counts = {}, inspectors = [] }) {
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
    const [viewMode, setViewMode] = useState("table"); // 'table' | 'kanban' | 'map'
    const [isCompact, setIsCompact] = useState(false);

    // ── NEW FEATURES STATE ──
    // 1. Date Range Filter
    const [dateRangePreset, setDateRangePreset] = useState(urlParams.get("date_preset") || "all");
    const [dateFrom, setDateFrom] = useState(urlParams.get("date_from") || filters?.date_from || "");
    const [dateTo, setDateTo] = useState(urlParams.get("date_to") || filters?.date_to || "");
    const [dateFilterOpen, setDateFilterOpen] = useState(false);

    // 2. Quick Peek Slide-Over Drawer
    const [peekItem, setPeekItem] = useState(null);

    // 3. Column Visibility Customizer
    const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
    const [visibleColumns, setVisibleColumns] = useState({
        lot_area: false,
        tct_number: false,
        contact: false,
        remarks: false,
    });

    // 4. Active Keyboard Navigation Row
    const [focusedRowIndex, setFocusedRowIndex] = useState(-1);

    const dateFilterRef = useRef(null);
    const columnSettingsRef = useRef(null);

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
            if (columnSettingsRef.current && !columnSettingsRef.current.contains(e.target)) {
                setColumnSettingsOpen(false);
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
        const num = Number(String(fee || 0).replace(/[^0-9.-]+/g, ""));
        return isNaN(num) ? "₱0.00" : "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
                sessionStorage.removeItem("hasShownWelcome");
                router.post("/logout");
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
            return Number(status_counts[s] || 0);
        }
        if (s === "") return fullDataset.length;
        return fullDataset.filter((a) => a?.status === s).length;
    };

    // Filter & Sort Dataset
    const filteredList = useMemo(() => {
        let list = isUsingPlaceholders ? [...SAMPLE_APPLICATIONS] : [...(applications?.data || [])];

        if (selectedStatus) {
            list = list.filter((item) => item?.status === selectedStatus);
        }
        if (selectedCategory) {
            list = list.filter((item) => item?.application_type === selectedCategory);
        }
        if (selectedLandUse) {
            list = list.filter((item) => String(item?.land_use_class || "").toLowerCase() === selectedLandUse.toLowerCase());
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
    
    // Paginated slice
    const paginatedRecords = useMemo(() => {
        if (filteredList.length <= 10) return filteredList;
        const startIdx = (currentPage - 1) * pageSize;
        return filteredList.slice(startIdx, startIdx + pageSize);
    }, [filteredList, currentPage, pageSize]);

    const startIndex = (currentPage - 1) * pageSize + 1;
    const endIndex = Math.min(currentPage * pageSize, filteredList.length);

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

    // ── Keyboard Navigation (↑ / ↓ / Enter / Space / Esc) ──
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Ignore if active typing inside input or textarea
            if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;

            if (e.key === "ArrowDown" || e.key === "j") {
                e.preventDefault();
                setFocusedRowIndex((prev) => Math.min(prev + 1, paginatedRecords.length - 1));
            } else if (e.key === "ArrowUp" || e.key === "k") {
                e.preventDefault();
                setFocusedRowIndex((prev) => Math.max(prev - 1, 0));
            } else if (e.key === "Enter" && focusedRowIndex >= 0 && paginatedRecords[focusedRowIndex]) {
                e.preventDefault();
                router.visit(`/applications/${paginatedRecords[focusedRowIndex].id || 101}`);
            } else if (e.key === " " && focusedRowIndex >= 0 && paginatedRecords[focusedRowIndex]) {
                e.preventDefault();
                setPeekItem(paginatedRecords[focusedRowIndex]);
            } else if (e.key === "Escape") {
                setPeekItem(null);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [focusedRowIndex, paginatedRecords]);

    // ── Export CSV Handler ──
    const handleExportCSV = () => {
        const headers = ["Reference Number", "Applicant Name", "Representative", "Application Type", "Land Use Class", "Barangay", "Lot Area (sqm)", "TCT Number", "Assessment Fee (PHP)", "OR Number", "Status", "Date Filed", "Purpose"];
        const rows = filteredList.map((app) => [
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

                /* Print Stylesheet for Official Transmittal Sheet */
                @media print {
                    body { background: white !important; color: black !important; }
                    header, aside, .no-print, button, .print-hide { display: none !important; }
                    #print-transmittal-header { display: block !important; }
                    table { width: 100% !important; border: 1px solid #000 !important; }
                    th, td { border: 1px solid #ddd !important; padding: 6px !important; font-size: 10pt !important; }
                }
                #print-transmittal-header { display: none; }
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
                            
                            {/* ── PRINT-ONLY TRANSMITTAL HEADER ── */}
                            <div id="print-transmittal-header" className="mb-4 text-center">
                                <h2 className="text-sm font-bold uppercase tracking-widest text-slate-600">Republic of the Philippines · Province of Batangas</h2>
                                <h1 className="text-xl font-black text-slate-900">MUNICIPALITY OF ROSARIO</h1>
                                <p className="text-xs font-semibold text-slate-500">Municipal Planning and Development Office (MPDO) · Zoning & Land Use Registry</p>
                                <div className="mt-2 border-b-2 border-slate-900 pb-1 flex justify-between text-xs text-slate-600">
                                    <span>Official Transmittal Summary</span>
                                    <span>Date Generated: {new Date().toLocaleDateString("en-PH")}</span>
                                </div>
                            </div>

                            {/* ── TOP HEADER SECTION ── */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 no-print">
                                <div>
                                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                                        Application Registry
                                    </h1>
                                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                                        Manage, track, and geo-locate municipal zoning clearance applications
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap">
                                    {/* 3-Way View Switcher: Table | Board | GIS Map */}
                                    <div className="bg-white p-0.5 rounded-xl border border-slate-200/90 shadow-2xs flex items-center">
                                        <button
                                            type="button"
                                            onClick={() => setViewMode("table")}
                                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                                                viewMode === "table"
                                                    ? "bg-slate-900 text-white shadow-2xs"
                                                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                                            }`}
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                                            </svg>
                                            <span>Table</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setViewMode("kanban")}
                                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                                                viewMode === "kanban"
                                                    ? "bg-slate-900 text-white shadow-2xs"
                                                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                                            }`}
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.5-15h15a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75A2.25 2.25 0 014.5 4.5z" />
                                            </svg>
                                            <span>Board</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setViewMode("map")}
                                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                                                viewMode === "map"
                                                    ? "bg-blue-600 text-white shadow-2xs"
                                                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                                            }`}
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                                            </svg>
                                            <span>GIS Map</span>
                                        </button>
                                    </div>

                                    {/* Print Transmittal Sheet */}
                                    <button
                                        type="button"
                                        onClick={handlePrintTransmittal}
                                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 shadow-2xs transition-all active:scale-98 cursor-pointer"
                                        title="Print official registry transmittal sheet"
                                    >
                                        <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.32 0h-11.32M19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H8.25A2.25 2.25 0 016 18.75V14" />
                                        </svg>
                                        <span>Print Sheet</span>
                                    </button>

                                    {/* Export CSV */}
                                    <button
                                        type="button"
                                        onClick={() => handleExportCSV(false)}
                                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 hover:border-slate-300 shadow-2xs transition-all active:scale-98 cursor-pointer"
                                        title="Export filtered records to CSV"
                                    >
                                        <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                        </svg>
                                        <span>Export CSV</span>
                                    </button>

                                    {/* Drafts */}
                                    {userRole === "Planning Officer" && (
                                        <Link
                                            href="/applications/drafts"
                                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 hover:border-slate-300 shadow-2xs transition-all active:scale-98"
                                        >
                                            <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                            </svg>
                                            <span>Drafts</span>
                                        </Link>
                                    )}

                                    {/* New Application */}
                                    {userRole === "Planning Officer" && (
                                        <Link
                                            href="/applications/encode"
                                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm shadow-blue-600/20 transition-all active:scale-98"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                            </svg>
                                            <span>New Application</span>
                                        </Link>
                                    )}
                                </div>
                            </div>

                            {/* ── 1. SMART INTERACTIVE WORKFLOW STATUS CARDS (KPIS + FILTERS) ── */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 shrink-0 no-print">
                                {[
                                    {
                                        id: "",
                                        label: "All Applications",
                                        count: totalCount,
                                        sub: "Active Registry",
                                        dot: "bg-blue-600",
                                        activeClass: "border-blue-600 ring-2 ring-blue-500/15 bg-blue-50/30",
                                    },
                                    {
                                        id: "Received",
                                        label: "Received",
                                        count: receivedCount,
                                        sub: `${receivedPct}% Intake`,
                                        dot: "bg-emerald-500",
                                        activeClass: "border-emerald-500 ring-2 ring-emerald-500/15 bg-emerald-50/30",
                                    },
                                    {
                                        id: "Technical Review",
                                        label: "Tech Review",
                                        count: reviewCount,
                                        sub: `${reviewPct}% In Review`,
                                        dot: "bg-amber-500",
                                        activeClass: "border-amber-500 ring-2 ring-amber-500/15 bg-amber-50/30",
                                    },
                                    {
                                        id: "Under Sangguniang Bayan",
                                        label: "SB Legislative",
                                        count: sbCount,
                                        sub: `${sbPct}% Committee`,
                                        dot: "bg-purple-500",
                                        activeClass: "border-purple-500 ring-2 ring-purple-500/15 bg-purple-50/30",
                                    },
                                    {
                                        id: "For Release",
                                        label: "For Release",
                                        count: forReleaseCount,
                                        sub: `${forReleasePct}% Pending Sign`,
                                        dot: "bg-sky-500",
                                        activeClass: "border-sky-500 ring-2 ring-sky-500/15 bg-sky-50/30",
                                    },
                                    {
                                        id: "Released",
                                        label: "Released / Ready",
                                        count: releasedCount,
                                        sub: `${releasedPct}% Completed`,
                                        dot: "bg-indigo-600",
                                        activeClass: "border-indigo-500 ring-2 ring-indigo-500/15 bg-indigo-50/30",
                                    },
                                ].map((tab) => {
                                    const isSelected = selectedStatus === tab.id;
                                    return (
                                        <button
                                            key={tab.id || "all"}
                                            type="button"
                                            onClick={() => { setSelectedStatus(tab.id); setCurrentPage(1); }}
                                            className={`p-3 rounded-2xl bg-white border text-left transition-all cursor-pointer shadow-2xs hover:border-slate-300 relative overflow-hidden group ${
                                                isSelected ? tab.activeClass : "border-slate-200/90 hover:bg-slate-50/50"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-[11px] font-bold text-slate-500 group-hover:text-slate-800 transition-colors truncate">
                                                    {tab.label}
                                                </span>
                                                <span className={`w-2 h-2 rounded-full ${tab.dot} shrink-0`} />
                                            </div>
                                            <div className="mt-1 flex items-baseline justify-between">
                                                <span className="text-xl font-bold text-slate-900 font-mono tracking-tight">{tab.count}</span>
                                                <span className="text-[10px] text-slate-400 font-semibold">{tab.sub}</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* ── 2. UNIFIED COMMAND & SEARCH BAR ── */}
                            <div className="bg-white p-2.5 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col gap-2 shrink-0 no-print">
                                <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2">
                                    {/* Main Search Input */}
                                    <div className="relative flex-1 min-w-[200px]">
                                        <svg
                                            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                        </svg>
                                        <input
                                            type="text"
                                            value={searchInput}
                                            onChange={(e) => setSearchInput(e.target.value)}
                                            placeholder="Search ref #, applicant, purpose, OR #..."
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-9 pr-10 py-2 text-xs font-medium text-slate-800 transition-all focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 shadow-2xs placeholder:text-slate-400"
                                        />
                                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
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
                                                <span className="text-[10px] font-mono text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">/</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Dropdown Filters */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
                                        {/* Category Filter */}
                                        <div className="min-w-[125px]">
                                            <DropdownSelect
                                                value={selectedCategory}
                                                onChange={(val) => { setSelectedCategory(val); setCurrentPage(1); }}
                                                options={APP_TYPES}
                                                allLabel="All Categories"
                                                withSearch={false}
                                            />
                                        </div>

                                        {/* Land Use Filter */}
                                        <div className="min-w-[120px]">
                                            <DropdownSelect
                                                value={selectedLandUse}
                                                onChange={(val) => { setSelectedLandUse(val); setCurrentPage(1); }}
                                                options={LAND_USE_CLASSES}
                                                allLabel="All Land Uses"
                                                withSearch={false}
                                            />
                                        </div>

                                        {/* Barangay Jurisdiction (Searchable) */}
                                        <div className="min-w-[130px]">
                                            <DropdownSelect
                                                value={selectedBarangay}
                                                onChange={(val) => { setSelectedBarangay(val); setCurrentPage(1); }}
                                                options={ROSARIO_BARANGAYS}
                                                allLabel="All Barangays"
                                                searchPlaceholder="Search 48 barangays..."
                                                prefix="Brgy."
                                                withSearch={true}
                                            />
                                        </div>

                                        {/* Sort Order */}
                                        <div className="min-w-[135px]">
                                            <DropdownSelect
                                                value={selectedSort}
                                                onChange={(val) => { setSelectedSort(val || "newest"); setCurrentPage(1); }}
                                                options={SORT_OPTIONS}
                                                allLabel="Sort: Newest"
                                                withSearch={false}
                                            />
                                        </div>
                                    </div>

                                    {/* Utility Controls: Date Range, Columns, Density, Clear */}
                                    <div className="flex items-center gap-1.5 shrink-0 self-end lg:self-auto">
                                        {/* Date Range Popover Button */}
                                        <div className="relative" ref={dateFilterRef}>
                                            <button
                                                type="button"
                                                onClick={() => setDateFilterOpen(!dateFilterOpen)}
                                                className={`text-xs font-semibold px-2.5 py-2 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                                                    dateFrom || dateTo || dateRangePreset !== "all"
                                                        ? "bg-blue-50 border-blue-300 text-blue-800 font-bold"
                                                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                                }`}
                                                title="Filter by filing date"
                                            >
                                                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
                                                </svg>
                                                <span>{dateFrom ? `${formatDate(dateFrom)} - ${formatDate(dateTo)}` : "Date"}</span>
                                            </button>

                                            {dateFilterOpen && (
                                                <div className="absolute right-0 mt-1.5 z-50 bg-white rounded-2xl shadow-xl border border-slate-200/90 p-3 min-w-[260px] animate-in fade-in zoom-in-95">
                                                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Filing Date Presets</p>
                                                    <div className="grid grid-cols-2 gap-1 mb-3">
                                                        {DATE_PRESETS.map((p) => (
                                                            <button
                                                                key={p.value}
                                                                type="button"
                                                                onClick={() => handleDatePreset(p.value)}
                                                                className={`text-xs px-2 py-1.5 rounded-lg text-left font-medium transition-all ${
                                                                    dateRangePreset === p.value
                                                                        ? "bg-blue-600 text-white font-bold"
                                                                        : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                                                                }`}
                                                            >
                                                                {p.label}
                                                            </button>
                                                        ))}
                                                    </div>

                                                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Custom Date Range</p>
                                                    <div className="space-y-2">
                                                        <div>
                                                            <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Date From</label>
                                                            <input
                                                                type="date"
                                                                value={dateFrom}
                                                                onChange={(e) => { setDateFrom(e.target.value); setDateRangePreset("custom"); }}
                                                                className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-blue-500"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Date To</label>
                                                            <input
                                                                type="date"
                                                                value={dateTo}
                                                                onChange={(e) => { setDateTo(e.target.value); setDateRangePreset("custom"); }}
                                                                className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-blue-500"
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
                                                            className="text-xs bg-slate-900 text-white px-3 py-1 rounded-lg font-bold cursor-pointer"
                                                        >
                                                            Apply
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Column Customizer */}
                                        <div className="relative" ref={columnSettingsRef}>
                                            <button
                                                type="button"
                                                onClick={() => setColumnSettingsOpen(!columnSettingsOpen)}
                                                className="text-xs font-semibold px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                                                title="Show/hide optional columns"
                                            >
                                                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                                                </svg>
                                                <span>Columns</span>
                                            </button>

                                            {columnSettingsOpen && (
                                                <div className="absolute right-0 mt-1.5 z-50 bg-white rounded-2xl shadow-xl border border-slate-200/90 p-3 min-w-[200px] animate-in fade-in zoom-in-95">
                                                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Optional Columns</p>
                                                    <div className="space-y-1.5">
                                                        {[
                                                            { key: "lot_area", label: "Lot Area (sq.m)" },
                                                            { key: "tct_number", label: "TCT / Lot Number" },
                                                            { key: "contact", label: "Contact Phone / Email" },
                                                            { key: "remarks", label: "Application Remarks" },
                                                        ].map((col) => (
                                                            <label key={col.key} className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer hover:text-slate-900">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={visibleColumns[col.key]}
                                                                    onChange={(e) => setVisibleColumns((prev) => ({ ...prev, [col.key]: e.target.checked }))}
                                                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                                />
                                                                <span>{col.label}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Density Switcher */}
                                        <button
                                            type="button"
                                            onClick={() => setIsCompact(!isCompact)}
                                            className={`text-xs font-semibold px-2.5 py-2 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                                                isCompact
                                                    ? "bg-slate-100 border-slate-300 text-slate-900"
                                                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                            }`}
                                            title="Toggle compact row spacing"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                                            </svg>
                                            <span>{isCompact ? "Compact" : "Comfortable"}</span>
                                        </button>

                                        {hasActiveFilters && (
                                            <button
                                                onClick={clearFilters}
                                                className="text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/60 px-2.5 py-2 rounded-xl flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                                                title="Clear active filters"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                                <span>Reset</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Active Filter Pills Strip */}
                                {hasActiveFilters && (
                                    <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-100 text-xs">
                                        <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Active:</span>
                                        {selectedStatus && (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold">
                                                Status: {selectedStatus}
                                                <button onClick={() => setSelectedStatus("")} className="hover:text-rose-600 font-bold ml-0.5 cursor-pointer">✕</button>
                                            </span>
                                        )}
                                        {selectedLandUse && (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium">
                                                Use: {selectedLandUse}
                                                <button onClick={() => setSelectedLandUse("")} className="hover:text-rose-600 font-bold ml-0.5 cursor-pointer">✕</button>
                                            </span>
                                        )}
                                        {selectedCategory && (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium">
                                                Type: {selectedCategory}
                                                <button onClick={() => setSelectedCategory("")} className="hover:text-rose-600 font-bold ml-0.5 cursor-pointer">✕</button>
                                            </span>
                                        )}
                                        {selectedBarangay && (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium">
                                                Brgy: {selectedBarangay}
                                                <button onClick={() => setSelectedBarangay("")} className="hover:text-rose-600 font-bold ml-0.5 cursor-pointer">✕</button>
                                            </span>
                                        )}
                                        {(dateFrom || dateTo) && (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium">
                                                Date: {formatDate(dateFrom)} - {formatDate(dateTo)}
                                                <button onClick={() => { setDateFrom(""); setDateTo(""); setDateRangePreset("all"); }} className="hover:text-rose-600 font-bold ml-0.5 cursor-pointer">✕</button>
                                            </span>
                                        )}
                                        {debouncedSearch && (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium">
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
                            </div>

                            {/* ── DATA VIEW (TABLE / PIPELINE KANBAN / GIS MAP) ── */}
                            {viewMode === "table" ? (
                                <div className="flex-1 bg-white rounded-2xl shadow-2xs border border-slate-200/90 overflow-hidden flex flex-col min-h-0 relative">
                                    {paginatedRecords.length === 0 ? (
                                        <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
                                            <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-200/60 mb-3.5 shadow-2xs">
                                                <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                                </svg>
                                            </div>
                                            <h3 className="text-base font-bold text-slate-900">No applications match your filters</h3>
                                            <p className="text-xs text-slate-500 mt-1 max-w-sm">
                                                No application records found for the selected criteria. Try adjusting keywords or resetting filters.
                                            </p>
                                            {hasActiveFilters && (
                                                <button
                                                    onClick={clearFilters}
                                                    className="mt-4 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all cursor-pointer"
                                                >
                                                    Clear All Filters
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex-1 overflow-auto">
                                            <table className="w-full text-left border-collapse whitespace-nowrap">
                                                <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-10 border-b border-slate-200/90 select-none">
                                                    <tr>
                                                        {/* Sortable Header: Application Ref */}
                                                        <th 
                                                            onClick={() => handleHeaderSort("ref")}
                                                            className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-blue-600 group"
                                                        >
                                                            <div className="flex items-center gap-1">
                                                                <span>Application Ref</span>
                                                                <span className="text-[10px] text-slate-400 group-hover:text-blue-600">
                                                                    {selectedSort === "ref_asc" ? "▲" : "⇅"}
                                                                </span>
                                                            </div>
                                                        </th>

                                                        {/* Sortable Header: Applicant */}
                                                        <th 
                                                            onClick={() => handleHeaderSort("applicant")}
                                                            className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-blue-600 group"
                                                        >
                                                            <div className="flex items-center gap-1">
                                                                <span>Applicant & Entity</span>
                                                                <span className="text-[10px] text-slate-400 group-hover:text-blue-600">
                                                                    {selectedSort === "applicant_asc" ? "▲" : selectedSort === "applicant_desc" ? "▼" : "⇅"}
                                                                </span>
                                                            </div>
                                                        </th>

                                                        <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                                            Category & Purpose
                                                        </th>

                                                        <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                                            Barangay Jurisdiction
                                                        </th>

                                                        {/* Optional column: Lot Area */}
                                                        {visibleColumns.lot_area && (
                                                            <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                                                Lot Area (sqm)
                                                            </th>
                                                        )}

                                                        {/* Optional column: TCT Number */}
                                                        {visibleColumns.tct_number && (
                                                            <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                                                TCT / Lot No
                                                            </th>
                                                        )}

                                                        {/* Sortable Header: Filing Date */}
                                                        <th 
                                                            onClick={() => handleHeaderSort("date")}
                                                            className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-blue-600 group"
                                                        >
                                                            <div className="flex items-center gap-1">
                                                                <span>Filing Date</span>
                                                                <span className="text-[10px] text-slate-400 group-hover:text-blue-600">
                                                                    {selectedSort === "oldest" ? "▲" : selectedSort === "newest" ? "▼" : "⇅"}
                                                                </span>
                                                            </div>
                                                        </th>

                                                        {/* Sortable Header: Assessment Fee (Right-Aligned) */}
                                                        <th 
                                                            onClick={() => handleHeaderSort("fee")}
                                                            className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-blue-600 group text-right"
                                                        >
                                                            <div className="flex items-center justify-end gap-1">
                                                                <span className="text-[10px] text-slate-400 group-hover:text-blue-600">
                                                                    {selectedSort === "fee_asc" ? "▲" : selectedSort === "fee_desc" ? "▼" : "⇅"}
                                                                </span>
                                                                <span>Assessment Fee</span>
                                                            </div>
                                                        </th>

                                                        <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                                            Status
                                                        </th>

                                                        <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">
                                                            Action
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {paginatedRecords.map((app, index) => {
                                                        const refCode = app?.reference_number || `APP-${app?.id || 0}`;
                                                        const isCopied = copiedRef === refCode;
                                                        const landUseBadgeStyle = LAND_USE_BADGES[app?.land_use_class] || "bg-slate-100 text-slate-700 border-slate-200/80";
                                                        const isCorp = isCorporateEntity(app?.applicant_name);
                                                        const isKeyboardFocused = focusedRowIndex === index;

                                                        return (
                                                            <tr 
                                                                key={app?.id || refCode} 
                                                                onClick={() => router.visit(`/applications/${app?.id || 101}`)}
                                                                className={`hover:bg-blue-50/40 hover:border-l-4 hover:border-l-blue-600 transition-all group cursor-pointer ${
                                                                    isKeyboardFocused ? "ring-2 ring-blue-500 ring-inset bg-blue-50/70" : ""
                                                                } ${
                                                                    isCompact ? "py-2" : ""
                                                                }`}
                                                            >
                                                                {/* Application Ref */}
                                                                <td className={`px-4 ${isCompact ? "py-2.5" : "py-3.5"}`}>
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="font-mono text-xs font-bold text-blue-700 hover:text-blue-900 group-hover:underline">
                                                                            {refCode}
                                                                        </span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => handleCopyRef(e, refCode)}
                                                                            title="Copy reference code"
                                                                            className="text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-all p-1 cursor-pointer"
                                                                        >
                                                                            {isCopied ? (
                                                                                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600">
                                                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                                                    </svg>
                                                                                    Copied
                                                                                </span>
                                                                            ) : (
                                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                                                                                </svg>
                                                                            )}
                                                                        </button>
                                                                    </div>
                                                                </td>

                                                                {/* Applicant Details & Icon */}
                                                                <td className={`px-4 ${isCompact ? "py-2.5" : "py-3.5"}`}>
                                                                    <div className="flex items-center gap-2.5">
                                                                        <div className={`w-7 h-7 rounded-full border text-xs font-bold flex items-center justify-center shrink-0 ${
                                                                            isCorp
                                                                                ? "bg-blue-50 border-blue-200 text-blue-700"
                                                                                : "bg-slate-100 border-slate-200 text-slate-700"
                                                                        }`}>
                                                                            {isCorp ? "🏢" : (app?.applicant_name ? app.applicant_name.charAt(0).toUpperCase() : "👤")}
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                                                                                {app?.applicant_name || "—"}
                                                                            </p>
                                                                            {app?.representative_name && (
                                                                                <p className="text-[10px] text-slate-400 font-medium">
                                                                                    Rep: {app.representative_name}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </td>

                                                                {/* Category & Purpose with Land Use Badge */}
                                                                <td className={`px-4 ${isCompact ? "py-2.5" : "py-3.5"}`}>
                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                        <span className="text-xs font-semibold text-slate-800">{app?.application_type || "—"}</span>
                                                                        {app?.land_use_class && (
                                                                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${landUseBadgeStyle}`}>
                                                                                {app.land_use_class}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <p className="text-[11px] text-slate-400 truncate max-w-[220px] mt-0.5 font-medium" title={app?.purpose}>
                                                                        {app?.purpose || "—"}
                                                                    </p>
                                                                </td>

                                                                {/* Barangay Jurisdiction (Clean Text) */}
                                                                <td className={`px-4 ${isCompact ? "py-2.5" : "py-3.5"}`}>
                                                                    <span className="text-xs font-medium text-slate-700">
                                                                        Brgy. {app?.barangay || "—"}
                                                                    </span>
                                                                </td>

                                                                {/* Optional Column: Lot Area */}
                                                                {visibleColumns.lot_area && (
                                                                    <td className={`px-4 ${isCompact ? "py-2.5" : "py-3.5"} font-mono text-xs text-slate-700`}>
                                                                        {app?.lot_area_sqm ? `${Number(app.lot_area_sqm).toLocaleString()} sqm` : "—"}
                                                                    </td>
                                                                )}

                                                                {/* Optional Column: TCT No */}
                                                                {visibleColumns.tct_number && (
                                                                    <td className={`px-4 ${isCompact ? "py-2.5" : "py-3.5"} font-mono text-xs text-slate-600`}>
                                                                        {app?.tct_number || "—"}
                                                                    </td>
                                                                )}

                                                                {/* Filing Date */}
                                                                <td className={`px-4 ${isCompact ? "py-2.5" : "py-3.5"}`}>
                                                                    <span className="text-xs text-slate-600 font-mono">
                                                                        {formatDate(app?.created_at)}
                                                                    </span>
                                                                </td>

                                                                {/* Assessment Fee & Verified Tag (Right-Aligned) */}
                                                                <td className={`px-4 ${isCompact ? "py-2.5" : "py-3.5"} text-right`}>
                                                                    <div className="font-mono text-xs font-bold text-slate-900">
                                                                        {formatFee(app?.assessment_fee)}
                                                                    </div>
                                                                    {app?.or_number && (
                                                                        <div className="inline-flex items-center justify-end gap-1 text-[10px] text-emerald-600 font-mono">
                                                                            <span>{app.or_number}</span>
                                                                            <span className="text-emerald-500 font-bold">✓</span>
                                                                        </div>
                                                                    )}
                                                                </td>

                                                                {/* Status */}
                                                                <td className={`px-4 ${isCompact ? "py-2.5" : "py-3.5"}`}>
                                                                    <StatusBadge status={app?.status} />
                                                                </td>

                                                                {/* Actions (Peek Drawer + Direct View) */}
                                                                <td className={`px-4 ${isCompact ? "py-2.5" : "py-3.5"} text-right`}>
                                                                    <div className="inline-flex items-center gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
                                                                        {/* Quick Peek Drawer Trigger */}
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setPeekItem(app)}
                                                                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                                                                            title="Quick peek overview"
                                                                        >
                                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                                                                            </svg>
                                                                        </button>

                                                                        {/* View Link */}
                                                                        <Link
                                                                            href={`/applications/${app?.id || 101}`}
                                                                            className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100/80 px-2.5 py-1 rounded-xl transition-all shadow-2xs cursor-pointer"
                                                                        >
                                                                            <span>View</span>
                                                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                                                            </svg>
                                                                        </Link>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {/* ── NUMBERED PAGINATION BAR (ONLY IF RECORDS > 10) ── */}
                                    {filteredList.length > 10 && (
                                        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/70 shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3 no-print">
                                            <div className="flex items-center gap-3">
                                                <p className="text-xs text-slate-500 font-medium">
                                                    Showing <span className="font-semibold text-slate-800">{filteredList.length > 0 ? startIndex : 0}</span> to <span className="font-semibold text-slate-800">{endIndex}</span> of{" "}
                                                    <span className="font-semibold text-slate-800">{filteredList.length}</span> applications
                                                </p>

                                                {/* Page Size Selector */}
                                                <div className="flex items-center gap-1.5 text-xs text-slate-400 pl-3 border-l border-slate-200">
                                                    <span>Show:</span>
                                                    <select
                                                        value={pageSize}
                                                        onChange={(e) => {
                                                            setPageSize(Number(e.target.value));
                                                            setCurrentPage(1);
                                                        }}
                                                        className="bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-xs font-semibold text-slate-700 outline-none cursor-pointer"
                                                    >
                                                        <option value={10}>10</option>
                                                        <option value={20}>20</option>
                                                        <option value={50}>50</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {/* Numbered Page Buttons */}
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    type="button"
                                                    disabled={currentPage <= 1}
                                                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all border ${
                                                        currentPage <= 1
                                                            ? "opacity-30 cursor-not-allowed border-slate-200 bg-white text-slate-400"
                                                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:border-slate-300 cursor-pointer"
                                                    }`}
                                                >
                                                    Previous
                                                </button>

                                                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                                                    const isActive = currentPage === pageNum;
                                                    return (
                                                        <button
                                                            key={pageNum}
                                                            type="button"
                                                            onClick={() => setCurrentPage(pageNum)}
                                                            className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                                                                isActive
                                                                    ? "bg-blue-600 border-blue-600 text-white shadow-xs"
                                                                    : "bg-white border-slate-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300"
                                                            }`}
                                                        >
                                                            {pageNum}
                                                        </button>
                                                    );
                                                })}

                                                <button
                                                    type="button"
                                                    disabled={currentPage >= totalPages}
                                                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all border ${
                                                        currentPage >= totalPages
                                                            ? "opacity-30 cursor-not-allowed border-slate-200 bg-white text-slate-400"
                                                            : "border-slate-200 bg-white text-blue-600 hover:bg-blue-50 hover:border-blue-300 cursor-pointer"
                                                    }`}
                                                >
                                                    Next
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : viewMode === "kanban" ? (
                                /* ── KANBAN PIPELINE BOARD VIEW ── */
                                <div className="flex-1 overflow-x-auto min-h-0 pb-2">
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 min-w-[1000px] h-full">
                                        {[
                                            { title: "Received Queue", statusKey: "Received", badgeColor: "bg-emerald-500" },
                                            { title: "Technical Review", statusKey: "Technical Review", badgeColor: "bg-amber-500" },
                                            { title: "Sangguniang Bayan", statusKey: "Under Sangguniang Bayan", badgeColor: "bg-purple-500" },
                                            { title: "For Release / Released", statusKey: "Released", badgeColor: "bg-indigo-600" },
                                        ].map((col) => {
                                            const colItems = filteredList.filter((a) => {
                                                if (col.statusKey === "Released") return a.status === "Released" || a.status === "For Release";
                                                return a.status === col.statusKey;
                                            });

                                            return (
                                                <div key={col.title} className="bg-slate-50/80 rounded-2xl p-3 border border-slate-200/90 flex flex-col h-full overflow-hidden">
                                                    <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-200/80">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`w-2 h-2 rounded-full ${col.badgeColor}`} />
                                                            <h3 className="text-xs font-bold text-slate-900">{col.title}</h3>
                                                        </div>
                                                        <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700">
                                                            {colItems.length}
                                                        </span>
                                                    </div>

                                                    <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5">
                                                        {colItems.length === 0 ? (
                                                            <div className="py-8 text-center text-xs text-slate-400 font-medium">
                                                                No applications in this stage
                                                            </div>
                                                        ) : (
                                                            colItems.map((card) => {
                                                                const refCode = card?.reference_number || `APP-${card?.id}`;
                                                                const landUseBadgeStyle = LAND_USE_BADGES[card?.land_use_class] || "bg-slate-100 text-slate-700 border-slate-200";

                                                                return (
                                                                    <div
                                                                        key={card.id || refCode}
                                                                        onClick={() => router.visit(`/applications/${card.id || 101}`)}
                                                                        className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs hover:shadow-sm hover:border-blue-400 hover:ring-2 hover:ring-blue-500/10 transition-all cursor-pointer group"
                                                                    >
                                                                        <div className="flex items-center justify-between gap-1.5 mb-1.5">
                                                                            <span className="font-mono text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200/60">
                                                                                {refCode}
                                                                            </span>
                                                                            <span className="text-[10px] text-slate-400 font-mono">
                                                                                {formatDate(card.created_at)}
                                                                            </span>
                                                                        </div>

                                                                        <h4 className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                                                                            {card.applicant_name}
                                                                        </h4>

                                                                        <p className="text-[11px] text-slate-400 line-clamp-2 mt-1 font-medium">
                                                                            {card.purpose}
                                                                        </p>

                                                                        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                                                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${landUseBadgeStyle}`}>
                                                                                {card.land_use_class}
                                                                            </span>
                                                                            <span className="font-mono font-bold text-slate-800">
                                                                                {formatFee(card.assessment_fee)}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                /* ── INTERACTIVE GIS MAP VIEW ── */
                                <div className="flex-1 bg-white rounded-2xl shadow-2xs border border-slate-200/90 overflow-hidden flex flex-col min-h-0 relative">
                                    <div className="p-3 bg-slate-50/90 border-b border-slate-200 flex items-center justify-between z-10">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-ping" />
                                            <p className="text-xs font-bold text-slate-800">
                                                Municipal GIS Overlay · {filteredList.length} Geocoded Applications
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
                                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Received</span>
                                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Review</span>
                                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500" /> SB</span>
                                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-600" /> Released</span>
                                        </div>
                                    </div>

                                    <div className="flex-1 w-full h-full relative">
                                        <MapContainer
                                            center={[13.8475, 121.2058]}
                                            zoom={13}
                                            scrollWheelZoom={true}
                                            className="w-full h-full"
                                            style={{ height: "100%", width: "100%" }}
                                        >
                                            <TileLayer
                                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                            />
                                            <MapViewRecenter bounds={mapBounds} />

                                            {filteredList.map((app) => {
                                                const coords = BARANGAY_COORDS[app.barangay] || BARANGAY_COORDS["Default"];
                                                const refNo = app.reference_number || `APP-${app.id}`;
                                                const markerIcon = createCustomMarker(app.status, refNo);

                                                return (
                                                    <Marker key={app.id} position={coords} icon={markerIcon}>
                                                        <Popup className="custom-leaflet-popup">
                                                            <div className="p-1 min-w-[220px]">
                                                                <div className="flex items-center justify-between gap-1 mb-1">
                                                                    <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                                                        {refNo}
                                                                    </span>
                                                                    <StatusBadge status={app.status} />
                                                                </div>
                                                                <h4 className="text-xs font-bold text-slate-900 mt-1">{app.applicant_name}</h4>
                                                                <p className="text-[11px] text-slate-500 mt-0.5">{app.purpose}</p>
                                                                <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-xs">
                                                                    <span className="font-semibold text-slate-700">Brgy. {app.barangay}</span>
                                                                    <span className="font-mono font-bold text-slate-900">{formatFee(app.assessment_fee)}</span>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => router.visit(`/applications/${app.id || 101}`)}
                                                                    className="mt-2.5 w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold text-center transition-colors block cursor-pointer"
                                                                >
                                                                    Open Full Dossier
                                                                </button>
                                                            </div>
                                                        </Popup>
                                                    </Marker>
                                                );
                                            })}
                                        </MapContainer>
                                    </div>
                                </div>
                            )}
                        </div>



                        {/* ── QUICK PEEK SLIDE-OVER DRAWER ── */}
                        {peekItem && (
                            <div className="fixed inset-0 z-[800] flex justify-end animate-in fade-in duration-200">
                                <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-[2px]" onClick={() => setPeekItem(null)} />
                                <div className="relative w-full max-w-md bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col z-10 animate-in slide-in-from-right duration-250">
                                    <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg">
                                                {peekItem.reference_number || `APP-${peekItem.id}`}
                                            </span>
                                            <StatusBadge status={peekItem.status} />
                                        </div>
                                        <button
                                            onClick={() => setPeekItem(null)}
                                            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
                                        >
                                            ✕
                                        </button>
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
                                        {/* Applicant Card */}
                                        <div>
                                            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Applicant Profile</h3>
                                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5">
                                                <p className="font-bold text-slate-900 text-sm">{peekItem.applicant_name}</p>
                                                {peekItem.representative_name && (
                                                    <p className="text-slate-600 font-medium">Representative: {peekItem.representative_name}</p>
                                                )}
                                                {peekItem.contact_number && (
                                                    <p className="text-slate-500 font-mono">Phone: {peekItem.contact_number}</p>
                                                )}
                                                {peekItem.email && (
                                                    <p className="text-slate-500 font-mono">Email: {peekItem.email}</p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Property Jurisdiction & Land Use */}
                                        <div>
                                            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Property & Zoning Details</h3>
                                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                                                <div className="flex justify-between">
                                                    <span className="text-slate-500">Barangay</span>
                                                    <span className="font-semibold text-slate-900">Brgy. {peekItem.barangay}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-slate-500">Zoning Class</span>
                                                    <span className={`px-2 py-0.5 rounded text-[10px] ${LAND_USE_BADGES[peekItem.land_use_class] || "bg-slate-100"}`}>
                                                        {peekItem.land_use_class}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-slate-500">Lot & TCT</span>
                                                    <span className="font-mono text-slate-800">{peekItem.lot_number || "—"} ({peekItem.tct_number || "—"})</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-slate-500">Lot Area</span>
                                                    <span className="font-mono font-semibold text-slate-900">{peekItem.lot_area_sqm ? `${Number(peekItem.lot_area_sqm).toLocaleString()} sq.m` : "—"}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Purpose & Remarks */}
                                        <div>
                                            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Project Purpose</h3>
                                            <p className="text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100 font-medium leading-relaxed">
                                                {peekItem.purpose || "—"}
                                            </p>
                                        </div>

                                        {peekItem.remarks && (
                                            <div>
                                                <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Staff Remarks</h3>
                                                <p className="text-slate-600 bg-amber-50/50 p-3 rounded-xl border border-amber-200/60 font-medium text-[11px]">
                                                    {peekItem.remarks}
                                                </p>
                                            </div>
                                        )}

                                        {/* Assessment & OR */}
                                        <div>
                                            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Assessment & Payment</h3>
                                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
                                                <div>
                                                    <span className="text-[10px] text-slate-400 uppercase block font-semibold">Total Assessment</span>
                                                    <span className="text-base font-bold font-mono text-slate-900">{formatFee(peekItem.assessment_fee)}</span>
                                                </div>
                                                {peekItem.or_number && (
                                                    <span className="text-xs font-mono font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg">
                                                        {peekItem.or_number} ✓
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-4 border-t border-slate-100 bg-slate-50/70 flex gap-2">
                                        <Link
                                            href={`/applications/${peekItem.id || 101}`}
                                            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs text-center shadow-xs transition-all"
                                        >
                                            Open Full Evaluation Workbench
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        )}

                    </main>
                </div>
            </div>
        </>
    );
}
