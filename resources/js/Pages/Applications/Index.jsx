import React, { useState, useEffect, useMemo, useRef } from "react";
import { Head, router, Link } from "@inertiajs/react";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import ApplicationsSubNav from "@/Components/ApplicationsSubNav";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { detailUrlFromFolder, folderRegistryUrl } from "@/Components/folderOrigin";
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
    pending_delivery: "bg-blue-50 text-blue-700 border-blue-300",
    delivered: "bg-emerald-50 text-emerald-700 border-emerald-300",
    delivery_failed: "bg-red-50 text-red-700 border-red-300",
};

const ROSARIO_BARANGAYS = [
    "Alupay", "Antipolo", "Bagong Pook", "Balibago", "Bayawang", "Baybayin", "Bulihan", "Cahigam", 
    "Calantas", "Colongan", "Itlugan", "Leviste", "Lumbangan", "Maalas-as", "Mabato", "Mabunga", 
    "Macalamcam A", "Macalamcam B", "Malaya", "Maligaya", "Marilag", "Masaya", "Matamis", "Mavalor", 
    "Mayuro", "Namuco", "Namunga", "Natu", "Nazi", "Palacpac", "Pinagsibaan", "Poblacion A", 
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

export default function Index({ applications, filters = {}, auth = {}, status_counts = {}, inspectors = [], applicant_counts = {}, delivery_monitoring = {} }) {
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
    const [pageSize, setPageSize] = useState(Number(urlParams.get("size")) || 10);
    const [currentPage, setCurrentPage] = useState(Number(urlParams.get("page")) || 1);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [copiedRef, setCopiedRef] = useState(null);
    const [viewMode, setViewMode] = useState("folder"); // 'folder' | 'kanban'

    // The open applicant folder is read from the URL, not held only in state.
    // A folder that lives in React state disappears on refresh and cannot be
    // restored from a pasted link, which is exactly the context the back
    // navigation needs to hand back.
    const [selectedFolder, setSelectedFolder] = useState(() => {
        if (typeof window === "undefined") return null;
        return new URLSearchParams(window.location.search).get("folder") || null;
    });
    const [isCompact, setIsCompact] = useState(false);

    // ── NEW FEATURES STATE ──
    // 1. Date Range Filter
    const [dateRangePreset, setDateRangePreset] = useState(urlParams.get("date_preset") || "all");
    const [dateFrom, setDateFrom] = useState(urlParams.get("date_from") || filters?.date_from || "");
    const [dateTo, setDateTo] = useState(urlParams.get("date_to") || filters?.date_to || "");
    const [dateFilterOpen, setDateFilterOpen] = useState(false);

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

        // LOOP 9D: the delivery filter is SERVER-side. It is pushed into the URL
        // and applied by ApplicationController::applyRegistryFilters(); the
        // browser never filters delivery state itself, because deciding which
        // round an application is judged by is a business fact.
        if (deliveryMonitoringEnabled && selectedDelivery && selectedDelivery !== "all") {
            params.set("delivery_status", selectedDelivery);
        } else {
            params.delete("delivery_status");
        }

        // The open folder travels with the registry state, so a refresh or a
        // pasted link returns the user to the folder they were working in.
        // `from` is dropped here: it describes how a DETAIL page was reached and
        // has no meaning on the registry itself.
        if (selectedFolder) params.set("folder", selectedFolder);
        else params.delete("folder");
        params.delete("from");

        const queryStr = params.toString();
        const newUrl = queryStr ? `${window.location.pathname}?${queryStr}` : window.location.pathname;
        window.history.replaceState({}, "", newUrl);
    }, [debouncedSearch, selectedStatus, selectedCategory, selectedLandUse, selectedBarangay, selectedSort, dateFrom, dateTo, dateRangePreset, currentPage, pageSize, selectedFolder, deliveryMonitoringEnabled, selectedDelivery]);

    // Admin/PO audit (P1): this used to fall back to a SAMPLE_APPLICATIONS
    // fixture and render invented applicants, TCT and OR numbers as though they
    // were real records. Official records are never fabricated, so an empty
    // result is now an honest empty state.
    const hasRecords = Array.isArray(applications?.data) && applications.data.length > 0;

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
    const fullDataset = applications?.data || [];

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
        let list = [...(applications?.data || [])];

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
    }, [applications, selectedStatus, selectedCategory, selectedLandUse, debouncedSearch, selectedBarangay, selectedSort, dateFrom, dateTo]);

    // Client-side pagination calculation
    const totalPages = Math.max(1, Math.ceil(filteredList.length / pageSize));
    
    const paginatedRecords = useMemo(() => {
        if (filteredList.length <= 10) return filteredList;
        const startIdx = (currentPage - 1) * pageSize;
        return filteredList.slice(startIdx, startIdx + pageSize);
    }, [filteredList, currentPage, pageSize]);

    // Group records by applicant name for the Folder view
    const folderGroups = useMemo(() => {
        const groups = {};
        filteredList.forEach(app => {
            const name = (app.corporation_name || app.applicant_name)?.trim() || 'Unknown Applicant';
            if (!groups[name]) groups[name] = [];
            groups[name].push(app);
        });
        return groups;
    }, [filteredList]);

    /**
     * True number of applications this applicant has for the CURRENT filters.
     *
     * The browser only holds one page of applications, so counting the loaded
     * rows would present a page-local number as if it were a total. The
     * controller supplies the real matching count per applicant, computed with
     * the same filter semantics. When that count is unavailable we fall back to
     * the loaded rows rather than inventing a number.
     */
    const applicantTotal = (name) => {
        const server = applicant_counts?.[name];
        return Number.isFinite(Number(server)) ? Number(server) : (folderGroups[name] || []).length;
    };

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
                                                        router.visit(`/applications/${paginatedRecords[focusedRowIndex].id}`);
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
                                    {/* 2-Way View Switcher: Board | Folders */}
                                    <div className="bg-white p-0.5 rounded-xl border border-slate-200/90 shadow-2xs flex items-center">
                                        <button
                                            type="button"
                                            onClick={() => setViewMode("folder")}
                                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                                                viewMode === "folder"
                                                    ? "bg-slate-900 text-white shadow-2xs"
                                                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                                            }`}
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
                                            </svg>
                                            <span>Folders</span>
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

                                    {/* Persistent Applications sub-navigation. Shared with the
                                        Technical Review and Drafts pages so the three sections can
                                        never drift apart. Planning Officer workflow only. */}
                                    <ApplicationsSubNav active="all" userRole={userRole} />

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

               

                            {/* ── 2. UNIFIED COMMAND & SEARCH BAR ── */}
                            <div className="bg-white p-2.5 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col gap-2 shrink-0 no-print">
                                <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
                                    {/* Main Search Input */}
                                    <div className="relative w-full lg:w-80 shrink-0">
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

                                    {/* Right Side: Filters & Controls */}
                                    <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-4">
                                        {/* Dropdown Filters */}
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 items-center">
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

                                        {/* LOOP 9D: Admin aggregate delivery monitoring filter.
                                            Rendered only when the SERVER enabled the feature, and
                                            applied server-side, so the browser never decides which
                                            round an application is judged by. */}
                                        {deliveryMonitoringEnabled && (
                                            <div className="min-w-[165px]">
                                                <select
                                                    value={selectedDelivery}
                                                    onChange={(e) => {
                                                        setSelectedDelivery(e.target.value);
                                                        setCurrentPage(1);
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
                                                    className="w-full text-xs font-semibold px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 shadow-2xs focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200 cursor-pointer"
                                                >
                                                    {(delivery_monitoring?.states || []).map((s) => (
                                                        <option key={s.value} value={s.value}>
                                                            {s.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>

                                    {/* Utility Controls: Date Range, Clear */}
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

                            {/* ── DATA VIEW (PIPELINE KANBAN / FOLDERS) ── */}
                            {viewMode === "kanban" ? (
                                /* ── KANBAN PIPELINE BOARD VIEW ── */
                                <div className="flex-1 overflow-x-auto min-h-0 pb-2 custom-scrollbar">
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
                                                <div key={col.title} className="bg-slate-50/50 rounded-xl border border-slate-200/80 flex flex-col h-full overflow-hidden">
                                                    {/* Column Header */}
                                                    <div className="flex items-center justify-between p-3 border-b border-slate-200/80 bg-white/50">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`w-2 h-2 rounded-full ${col.badgeColor}`} />
                                                            <h3 className="text-sm font-semibold text-slate-800">{col.title}</h3>
                                                        </div>
                                                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-200/50 text-slate-600">
                                                            {colItems.length}
                                                        </span>
                                                    </div>

                                                    {/* Column Body (Cards) */}
                                                    <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 custom-scrollbar">
                                                        {colItems.length === 0 ? (
                                                            <div className="py-8 text-center">
                                                                <span className="text-[12px] font-medium text-slate-400">Empty</span>
                                                            </div>
                                                        ) : (
                                                            colItems.map((card) => {
                                                                const refCode = card?.reference_number || `APP-${card?.id}`;
                                                                const landUseBadgeStyle = LAND_USE_BADGES[card?.land_use_class] || "bg-slate-100 text-slate-700 border-slate-200";

                                                                return (
                                                                    <div
                                                                        key={card.id || refCode}
                                                                        onClick={() => router.visit(`/applications/${card.id}`)}
                                                                        className="group bg-white rounded-lg border border-slate-200/80 p-3 hover:border-slate-300 hover:shadow-sm transition-all duration-200 cursor-pointer flex flex-col gap-2"
                                                                    >
                                                                        {/* Header: Ref & Date */}
                                                                        <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium tracking-wide mb-0.5">
                                                                            <span>{refCode}</span>
                                                                            <span>{formatDate(card.created_at)}</span>
                                                                        </div>

                                                                        {/* Body: Applicant & Purpose */}
                                                                        <div>
                                                                            <h4 className="text-[13px] font-semibold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                                                                                {card.applicant_name || "Unknown Applicant"}
                                                                            </h4>
                                                                            {card.purpose?.trim() && (
                                                                                <p className="text-[12px] text-slate-500 mt-1 line-clamp-2 leading-snug">
                                                                                    {card.purpose}
                                                                                </p>
                                                                            )}
                                                                            {/* Admin/PO audit: same single compact
                                                                                inspection line as the folder view, so both
                                                                                views answer the same question. Locally
                                                                                provable facts only — never "Ongoing". */}
                                                                            {card.inspection_summary && (
                                                                                <p className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/70 rounded-md px-1.5 py-0.5 mt-1.5 inline-block self-start leading-tight">
                                                                                    {card.inspection_summary}
                                                                                </p>
                                                                            )}

                                                                            {/* LOOP 9D: Admin aggregate delivery monitoring.
                                                                                Every string here is server-authored: the
                                                                                state, its label, the failure category label
                                                                                and the message all come from
                                                                                InspectionDeliveryStatus. The browser holds no
                                                                                delivery vocabulary of its own, so a future server
                                                                                change reaches this card with no React edit, and
                                                                                this card can never invent a delivery verdict. */}
                                                                            {deliveryMonitoringEnabled && card.delivery_monitoring && (
                                                                                <div className="mt-1.5 rounded-md border border-slate-200/80 bg-slate-50/70 px-2 py-1.5 self-start w-full">
                                                                                    <div className="flex items-center justify-between gap-2">
                                                                                        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${DELIVERY_STATE_STYLES[card.delivery_monitoring.state] || DELIVERY_STATE_STYLES.no_delivery_record}`}>
                                                                                            {card.delivery_monitoring.label}
                                                                                        </span>
                                                                                        {card.delivery_monitoring.is_superseded === true && (
                                                                                            <span
                                                                                                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border bg-slate-100 text-slate-500 border-slate-300"
                                                                                                title="A newer inspection round exists for this parcel."
                                                                                            >
                                                                                                Superseded
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                    <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                                                                                        {card.delivery_monitoring.message}
                                                                                    </p>
                                                                                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-1 text-[10px] text-slate-500">
                                                                                        {card.delivery_monitoring.inspector && (
                                                                                            <span>
                                                                                                Inspector:{" "}
                                                                                                <span className="font-semibold text-slate-700">
                                                                                                    {card.delivery_monitoring.inspector.name}
                                                                                                </span>
                                                                                            </span>
                                                                                        )}
                                                                                        <span>
                                                                                            Attempts:{" "}
                                                                                            <span className="font-semibold text-slate-700">
                                                                                                {card.delivery_monitoring.attempt_count}
                                                                                            </span>
                                                                                        </span>
                                                                                        {card.delivery_monitoring.last_attempt_at && (
                                                                                            <span>Last attempt: {formatDate(card.delivery_monitoring.last_attempt_at)}</span>
                                                                                        )}
                                                                                        {card.delivery_monitoring.delivered_at && (
                                                                                            <span>Delivered: {formatDate(card.delivery_monitoring.delivered_at)}</span>
                                                                                        )}
                                                                                    </div>
                                                                                    {card.delivery_monitoring.failure_label && (
                                                                                        <p className="text-[10px] font-semibold text-red-700 mt-1">
                                                                                            Category: {card.delivery_monitoring.failure_label}
                                                                                        </p>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                        </div>

                                                                        {/* Footer: Land Use & Fee */}
                                                                        <div className="mt-2 pt-2 border-t border-slate-100/80 flex items-center justify-between">
                                                                            {card.land_use_class?.trim() ? (
                                                                                <span className={`px-2 py-0.5 rounded text-[10px] ${landUseBadgeStyle} font-medium border-transparent bg-opacity-40`}>
                                                                                    {card.land_use_class}
                                                                                </span>
                                                                            ) : (
                                                                                <span className="px-2 py-0.5 rounded text-[10px] text-slate-500 bg-slate-100 font-medium border border-slate-200/50">
                                                                                    Unclassified
                                                                                </span>
                                                                            )}
                                                                            <span className="text-[12px] font-medium text-slate-700">
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
                                /* ── FOLDER GRID VIEW ── */
                                <div className="flex-1 bg-white rounded-2xl shadow-2xs border border-slate-200/90 overflow-y-auto p-6 relative">
                                    {selectedFolder ? (
                                        <>
                                            <div className="flex items-center gap-3 mb-8">
                                                <button 
                                                    type="button" 
                                                    onClick={() => setSelectedFolder(null)}
                                                    className="flex items-center justify-center w-8 h-8 bg-white border border-slate-200/80 rounded-full hover:bg-slate-50 text-slate-500 hover:text-blue-600 shadow-sm transition-all ring-1 ring-black/[0.02]"
                                                >
                                                    <svg className="w-4 h-4 -ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                                                </button>
                                                <div>
                                                    <h3 className="text-[15px] font-bold text-slate-900 tracking-tight">{selectedFolder}</h3>
                                                    <p className="text-[11px] font-medium text-slate-500 uppercase tracking-widest mt-0.5">
                                                        {(() => {
                                                            const total = applicantTotal(selectedFolder);
                                                            const listed = (folderGroups[selectedFolder] || []).length;
                                                            const label = `${total} Application${total !== 1 ? "s" : ""}`;
                                                            // When the browser only loaded part of this
                                                            // applicant's records, say so rather than
                                                            // implying the listed rows are all they have.
                                                            return total > listed ? `${label} · showing ${listed}` : label;
                                                        })()}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-6 gap-y-8 text-center">
                                                {(folderGroups[selectedFolder] || []).map((item, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="group flex flex-col items-center p-3 rounded-2xl transition-all cursor-pointer hover:bg-white hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-1 border border-transparent hover:border-slate-200/60"
                                                        onClick={() => router.visit(detailUrlFromFolder("/applications", item.id, selectedFolder, typeof window !== "undefined" ? window.location.search : ""))}
                                                    >
                                                        <div className="relative mb-3 transition-transform duration-300 text-slate-300 group-hover:text-blue-500">
                                                            <svg width="72" height="72" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-md text-blue-500 group-hover:drop-shadow-lg transition-all duration-300">
                                                                <path d="M22 14C22 10.6863 24.6863 8 28 8H60L82 30V86C82 89.3137 79.3137 92 76 92H28C24.6863 92 22 89.3137 22 86V14Z" fill="url(#doc-base)"/>
                                                                <path d="M60 8V24C60 27.3137 62.6863 30 66 30H82L60 8Z" fill="url(#doc-fold)"/>
                                                                <rect x="34" y="44" width="32" height="5" rx="2.5" fill="#CBD5E1"/>
                                                                <rect x="34" y="58" width="20" height="5" rx="2.5" fill="#CBD5E1"/>
                                                                <rect x="34" y="72" width="26" height="5" rx="2.5" fill="#CBD5E1"/>
                                                                <rect x="34" y="24" width="12" height="12" rx="4" fill="#3B82F6"/>
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
                                                        {/* Admin/PO audit: one compact line answers "is there a site
                                                            inspection, is it a reinspection, and who is the
                                                            inspector?" without opening the application. Wording is
                                                            produced server-side by App\Support\InspectionSummary and
                                                            only uses locally provable facts, so it never claims
                                                            field progress (no "Ongoing"). Rendered only when there
                                                            is something to say. */}
                                                        {item.inspection_summary && (
                                                            <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/70 rounded-md px-1.5 py-0.5 mt-1.5 max-w-[190px] leading-tight text-center line-clamp-2">
                                                                {item.inspection_summary}
                                                            </span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-6 gap-y-8 text-center">
                                                {Object.entries(folderGroups).map(([applicant, apps]) => (
                                                    <div
                                                        key={applicant}
                                                        className="group cursor-pointer flex flex-col items-center p-2 rounded-xl hover:bg-blue-50/50 transition-colors"
                                                        onClick={() => setSelectedFolder(applicant)}
                                                        title={`View ${applicantTotal(applicant)} application(s) for ${applicant}`}
                                                    >
                                                        <div className="relative mb-3 transition-transform duration-200 group-hover:scale-105 group-hover:-translate-y-1">
                                                            {/* Custom SVG folder icon mimicking desktop file explorer folders */}
                                                            <svg
                                                                width="76"
                                                                height="76"
                                                                viewBox="0 0 100 100"
                                                                fill="none"
                                                                xmlns="http://www.w3.org/2000/svg"
                                                                className="drop-shadow-sm text-blue-500"
                                                            >
                                                                {/* Back flap of folder */}
                                                                <path d="M10 28C10 24.6863 12.6863 22 16 22H36.1716C37.7628 22 39.2889 22.6321 40.4142 23.7574L46.5858 29.9289C47.7111 31.0543 49.2372 31.6863 50.8284 31.6863H84C87.3137 31.6863 90 34.3726 90 37.6863V76C90 79.3137 87.3137 82 84 82H16C12.6863 82 10 79.3137 10 76V28Z" fill="url(#folder-back)"/>
                                                                {/* Front flap */}
                                                                <path d="M10 40C10 36.6863 12.6863 34 16 34H84C87.3137 34 90 36.6863 90 40V76C90 79.3137 87.3137 82 84 82H16C12.6863 82 10 79.3137 10 76V40Z" fill="url(#folder-front)"/>
                                                                <defs>
                                                                    <linearGradient id="folder-back" x1="50" y1="22" x2="50" y2="82" gradientUnits="userSpaceOnUse">
                                                                        <stop stopColor="#60A5FA" />
                                                                        <stop offset="1" stopColor="#3B82F6" />
                                                                    </linearGradient>
                                                                    <linearGradient id="folder-front" x1="50" y1="34" x2="50" y2="82" gradientUnits="userSpaceOnUse">
                                                                        <stop stopColor="#93C5FD" />
                                                                        <stop offset="1" stopColor="#2563EB" />
                                                                    </linearGradient>
                                                                </defs>
                                                            </svg>
                                                            
                                                            {/* Count badge styled like notification pills. Shows the
                                                                applicant's true matching application count, not the
                                                                number of rows that happened to load on this page. */}
                                                            <span className="absolute -bottom-1 -right-1 bg-white text-slate-800 text-[10px] font-black px-1.5 py-0.5 min-w-[20px] rounded-full shadow-sm border border-slate-200">
                                                                {applicantTotal(applicant)}
                                                            </span>
                                                        </div>
                                                        <span className="text-[11px] font-bold text-slate-700 leading-snug line-clamp-2 px-1 group-hover:text-blue-700">
                                                            {applicant}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                            {Object.keys(folderGroups).length === 0 && (
                                                <div className="flex flex-col items-center justify-center h-full text-slate-400 p-10">
                                                    <svg className="w-12 h-12 mb-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                                    </svg>
                                                    <p className="font-semibold text-slate-600">No applications found.</p>
                                                    <p className="text-xs text-slate-400 mt-1 text-center max-w-xs">
                                                        There are no applications to show. Adjust the filters, or encode a new
                                                        application to get started.
                                                    </p>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>



                        {/* ── END OF MAIN CONTENT ── */}
                    </main>
                </div>
            </div>
        </>
    );
}
