// resources/js/Pages/Applications/Create.jsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import { Link, Head, router } from "@inertiajs/react";
import axios from "axios";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import { performLogout } from "@/utils/auth";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Label, Input, Textarea, Select } from "./Components/FormControls";
import StepCategory from "./Components/StepCategory";
import StepApplicant from "./Components/StepApplicant";
import StepPropertyGIS from "./Components/StepPropertyGIS";
import StepReview from "./Components/StepReview";
import StepFee from "./Components/StepFee";
import SiteMapPrint from "./Components/SiteMapPrint";
import { splitFullName, joinName } from "@/utils/names";
import { getZoneInfo } from "@/utils/clupZones";
import { getRecommendedPetition } from "@/Components/MapKit";
const AMENDMENT_TYPES = [
    {
        id: "Petition for Rezoning",
        icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
        desc: "Request to modify existing zoning classification of a specific property.",
    },
    {
        id: "Petition for Reclassification",
        icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
        desc: "Request to reclassify agricultural land to non-agricultural uses.",
    },
];

const APPLICATION_TYPES = [
    {
        id: "Locational Clearance",
        icon: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7",
        desc: "Standard municipal building & land clearance",
    },
    {
        id: "Zoning Certificate",
        icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
        desc: "Land use classification & zoning compliance",
    },
    {
        id: "Development Permit",
        icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
        desc: "Subdivisions, estates & complex developments",
    },
    {
        id: "Preliminary Approval and Locational Clearance (PALC)",
        icon: "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21",
        desc: "Preliminary Approval & Locational Clearance applications (PALC).",
    },

];

const LAND_USE_CLASSES = ["Residential", "Commercial", "Industrial", "Agri-Industrial", "Institutional", "Recreational"];

// Property first: the verified lot supplies barangay, owner, area and zoning to every later step.
// Review is last so it can show the fee being charged.
const STEP = { PROPERTY: 1, APPLICATION: 2, APPLICANT: 3, FEES: 4, REVIEW: 5 };
const STEPS = [
    { id: STEP.PROPERTY, title: "Property", label: "Property & Map" },
    { id: STEP.APPLICATION, title: "Application", label: "Application Details" },
    { id: STEP.APPLICANT, title: "Applicant", label: "Applicant Details" },
    { id: STEP.FEES, title: "Fees", label: "Assessment & Fees" },
    { id: STEP.REVIEW, title: "Review", label: "Review & Submit" },
];

const STEP_ERROR_FIELDS = {
    [STEP.APPLICATION]: ["application_stream", "application_type", "form_number", "land_use_class", "purpose", "target_land_use_class", "building_area", "area_to_develop", "number_of_saleable_lots", "project_type_business_name", "project_cost", "project_tenure"],
    [STEP.APPLICANT]: ["applicant_name", "first_name", "last_name", "contact_number", "email", "applicant_street", "applicant_barangay", "representative_name", "representative_contact", "representative_address", "corporation_name", "corporation_contact", "corporation_address", "right_over_land"],
    [STEP.FEES]: ["assessment_fee", "or_number", "date_of_receipt", "zoning_certificate_fee", "locational_clearance_fee", "development_permit_fee", "other_fees", "penalty_fee"],
};

const DRAFT_UUID_KEY = "imaps_current_draft_uuid";
const DRAFT_PAYLOAD_KEY = "imaps_local_backup_payload";
// Retired: applicants used to be cached here per browser. Kept only so the old copy can be wiped.
const LEGACY_APPLICANT_REGISTRY_KEY = "imaps_known_applicants_registry";

// ── Official Municipal Assessment Fee Calculation Engine ──
// Referenced from:
// 1. Zoning Clearance: ₱720.00 per hectare (1 hectare = 10,000 sq.m, min. ₱720.00)
// 2. Locational Clearance: HLURB Resolution No. 912, Series of 2013 (based on Bill of Materials / Project Cost)
// 3. Development Permit: ₱10.00 per square meter

function calculateMunicipalFee(appType, landUse, areaSqm, projectCost = 0) {
    const area = Math.max(0, Number(areaSqm) || 0);
    const cost = Math.max(0, Number(projectCost) || 0);
    let baseFee = 0;
    let formulaDesc = "";
    let rateDetail = "";
    let calculationSummary = "";

    if (appType === "Zoning Certificate" || appType === "Zoning Clearance") {
        // ₱720.00 per hectare (1 ha = 10,000 sq.m)
        const hectares = area / 10000;
        baseFee = Math.max(720, Math.round(hectares * 720 * 100) / 100);
        formulaDesc = "₱720.00 per hectare (min. ₱720.00)";
        rateDetail = `${area.toLocaleString()} sq.m (${hectares.toFixed(4)} ha) @ ₱720.00 / hectare`;
        calculationSummary = hectares <= 1 
            ? "₱720.00 (Minimum Base 1 Hectare)" 
            : `${hectares.toFixed(2)} ha × ₱720.00/ha = ₱${baseFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    } else if (appType === "Development Permit") {
        // ₱10.00 per square meter
        baseFee = Math.round(area * 10 * 100) / 100;
        formulaDesc = "₱10.00 per square meter";
        rateDetail = `${area.toLocaleString()} sq.m @ ₱10.00 / sq.m`;
        calculationSummary = `${area.toLocaleString()} sq.m × ₱10.00/sq.m = ₱${baseFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    } else if (appType === "Locational Clearance") {
        // HLURB Resolution No. 912, Series of 2013 (Based on Bill of Materials / Declared Project Cost)
        if (landUse === "Residential") {
            if (cost <= 100000) {
                baseFee = 288.00;
                rateDetail = "HLURB Tier: Project Cost ≤ ₱100,000 (Flat ₱288.00)";
                calculationSummary = "Flat ₱288.00 (Cost ≤ ₱100k)";
            } else if (cost <= 200000) {
                baseFee = 576.00;
                rateDetail = "HLURB Tier: Project Cost > ₱100k to ₱200,000 (Flat ₱576.00)";
                calculationSummary = "Flat ₱576.00 (Cost ≤ ₱200k)";
            } else {
                const excess = cost - 200000;
                const excessFee = excess * 0.001; // 1/10 of 1%
                baseFee = 720.00 + excessFee;
                rateDetail = `HLURB Tier: Project Cost > ₱200k (₱720.00 + 0.1% excess)`;
                calculationSummary = `₱720.00 + (₱${excess.toLocaleString()} × 0.1%) = ₱${baseFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            }
            formulaDesc = "HLURB 2013 Residential Rates (Bill of Materials)";
        } else if (landUse === "Institutional") {
            if (cost <= 2000000) {
                baseFee = 2880.00;
                rateDetail = "HLURB Tier: Project Cost ≤ ₱2.0 Million (Flat ₱2,880.00)";
                calculationSummary = "Flat ₱2,880.00 (Cost ≤ ₱2M)";
            } else {
                const excess = cost - 2000000;
                const excessFee = excess * 0.001;
                baseFee = 2880.00 + excessFee;
                rateDetail = `HLURB Tier: Project Cost > ₱2.0M (₱2,880.00 + 0.1% excess)`;
                calculationSummary = `₱2,880.00 + (₱${excess.toLocaleString()} × 0.1%) = ₱${baseFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            }
            formulaDesc = "HLURB 2013 Institutional Rates (Bill of Materials)";
        } else {
            // Commercial, Industrial, Agri-Industrial, Recreational
            if (cost < 100000) {
                baseFee = 1440.00;
                rateDetail = "HLURB Tier: Project Cost < ₱100,000 (Flat ₱1,440.00)";
                calculationSummary = "Flat ₱1,440.00 (Cost < ₱100k)";
            } else if (cost <= 500000) {
                baseFee = 2160.00;
                rateDetail = "HLURB Tier: Project Cost ₱100k to ₱500,000 (Flat ₱2,160.00)";
                calculationSummary = "Flat ₱2,160.00 (Cost ≤ ₱500k)";
            } else if (cost <= 1000000) {
                baseFee = 2880.00;
                rateDetail = "HLURB Tier: Project Cost > ₱500k to ₱1.0 Million (Flat ₱2,880.00)";
                calculationSummary = "Flat ₱2,880.00 (Cost ≤ ₱1M)";
            } else if (cost <= 2000000) {
                baseFee = 4320.00;
                rateDetail = "HLURB Tier: Project Cost > ₱1.0M to ₱2.0 Million (Flat ₱4,320.00)";
                calculationSummary = "Flat ₱4,320.00 (Cost ≤ ₱2M)";
            } else {
                const excess = cost - 2000000;
                const excessFee = excess * 0.001;
                baseFee = 7200.00 + excessFee;
                rateDetail = `HLURB Tier: Project Cost > ₱2.0M (₱7,200.00 + 0.1% excess)`;
                calculationSummary = `₱7,200.00 + (₱${excess.toLocaleString()} × 0.1%) = ₱${baseFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            }
            formulaDesc = "HLURB 2013 Commercial / Industrial Rates (Bill of Materials)";
        }
    } else {
        // Special Land Use Permit
        if (cost > 0) {
            const excess = Math.max(0, cost - 2000000);
            baseFee = 7200.00 + (excess * 0.001);
            rateDetail = `Special Rate: ₱7,200.00 + 0.1% of excess cost`;
            calculationSummary = `₱7,200.00 + (₱${excess.toLocaleString()} × 0.1%) = ₱${baseFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
        } else {
            baseFee = Math.max(2500, Math.round(area * 10 * 100) / 100);
            rateDetail = `${area.toLocaleString()} sq.m @ ₱10.00/sq.m (Min. ₱2,500.00)`;
            calculationSummary = `${area.toLocaleString()} sq.m × ₱10.00/sq.m = ₱${baseFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
        }
        formulaDesc = "Special Land Use Rates";
    }

    const total = Math.max(0, Math.round(baseFee * 100) / 100);

    return {
        baseFee,
        formulaDesc,
        rateDetail,
        calculationSummary,
        cost,
        area,
        total,
    };
}

// Which itemised fee field each application type's charge goes into; petitions and PALC use "Other fees"
const FEE_FIELD_BY_TYPE = {
    "Zoning Certificate": "zoning_certificate_fee",
    "Locational Clearance": "locational_clearance_fee",
    "Development Permit": "development_permit_fee",
};
const TYPE_FEE_FIELDS = ["zoning_certificate_fee", "locational_clearance_fee", "development_permit_fee", "other_fees"];

// Fee tier land use comes from the first verified lot's CLUP zone
function feeLandUse(parcels) {
    const zoneCode = (parcels || []).find((p) => p.is_verified && p.land_use_class?.trim())?.land_use_class?.trim() || "";
    const category = zoneCode ? getZoneInfo(zoneCode).category : "";
    // Everything that isn't residential or institutional shares the commercial/industrial tier
    const landUse = category === "residential" ? "Residential" : category === "institutional" ? "Institutional" : "Non-residential";
    return { landUse, zoneCode };
}

// Each selected application type is a separate permit with its own charge; combined filings pay the sum
function computeFeeLines(applicationType, landUse, area, cost) {
    const types = String(applicationType || "").split(",").map((t) => t.trim()).filter(Boolean);
    const lines = types.map((type) => ({ type, field: FEE_FIELD_BY_TYPE[type] || "other_fees", ...calculateMunicipalFee(type, landUse, area, cost) }));
    const byField = Object.fromEntries(TYPE_FEE_FIELDS.map((f) => [f, 0]));
    lines.forEach((l) => (byField[l.field] += l.total));
    const total = Math.round(lines.reduce((s, l) => s + l.total, 0) * 100) / 100;
    return { lines, byField, total };
}

// ── Title Case & Formatting Helper ──
function toTitleCase(str) {
    if (!str) return "";
    return str
        .toLowerCase()
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

// Same comparison as the map step's progression lock: Assessor classification vs spatial CLUP zone
function hasZoningMismatch(parcels) {
    return (parcels || []).some((p) => {
        const cadastral = p.cadastral_zone?.trim().toLowerCase();
        const clup = p.land_use_class?.trim().toLowerCase();
        return p.is_verified && cadastral && clup && cadastral !== clup;
    });
}

const emptyForm = () => ({
    application_stream: "permit", // Defaults to Track A
    application_type: "",
    form_number: "",
    target_land_use_class: "",
    allowable_use: "",
    purpose: "",
    first_name: "",
    middle_name: "",
    last_name: "",
    suffix: "",
    applicant_name: "",
    applicant_street: "",
    applicant_barangay: "",
    contact_number: "",
    email: "",
    representative_name: "",
    representative_address: "",
    representative_contact: "",
    corporation_name: "",
    corporation_address: "",
    corporation_contact: "",
    barangay: "",
    street_address: "",
    project_cost: "",
    building_area: "",
    area_to_develop: "",
    number_of_saleable_lots: "",
    project_type_business_name: "",
    right_over_land: "",
    project_tenure: "",
    preferred_release_mode: "",
    route_to_sb: false,
    remarks: "",
    zoning_certificate_fee: "",
    locational_clearance_fee: "",
    development_permit_fee: "",
    other_fees: "",
    penalty_fee: "",
    date_of_receipt: new Date().toISOString().split("T")[0], // Default to today
    assessment_fee: "0.00",
    or_number: "",
    

    parcels: [
        {
            parcel_code: "P-01",
            location_address: "",
            barangay: "",
            owner_name: "",
            property_index_number: "",
            arp_number: "",
            lot_number: "",
            tct_number: "",
            tax_dec_number: "",
            survey_number: "",
            lot_area_sqm: "",
            land_use_class: "",
            allowable_use: "",
            coordinates: "",
        },
    ],
});

// ── Custom Map Bounds Controller ──
function MapController({ brgyData, activeParcelFeature }) {
    const map = useMap();
    const prevFeaturePin = useRef(null);

    useEffect(() => {
        if (!map) return;
        const currentPin = activeParcelFeature?.properties?.property_index_number || activeParcelFeature?.id || null;
        const isSameFeature = currentPin && prevFeaturePin.current === currentPin;
        prevFeaturePin.current = currentPin;

        const timer = setTimeout(() => {
            try {
                map.invalidateSize({ animate: false });
                if (activeParcelFeature) {
                    const layer = L.geoJSON(activeParcelFeature);
                    const bounds = layer.getBounds();

                    if (bounds.isValid()) {
                        const currentBounds = map.getBounds();
                        // Only fit bounds if the parcel isn't already fully visible in viewport
                        if (!isSameFeature && (!currentBounds.isValid() || !currentBounds.contains(bounds))) {
                            map.fitBounds(bounds, { padding: [60, 60], maxZoom: 18, animate: false });
                        }
                    }
                } else if (brgyData && !isSameFeature) {
                    const layer = L.geoJSON(brgyData);
                    const bounds = layer.getBounds();

                    if (bounds.isValid()) {
                        map.fitBounds(bounds, { padding: [30, 30], animate: false });
                    }
                }
            } catch (e) {
                console.error("MapController error:", e);
            }
        }, 120);

        return () => clearTimeout(timer);
    }, [brgyData, activeParcelFeature, map]);

    return null;
}

export default function Create({ auth, errors: serverErrors = {}, cloudDraftPayload = null, cloudDraftRef = null, inspectors = [] }) {
    const userName = auth?.user?.name || "Planning Officer";
    const userRole = auth?.user?.role || "Planning Officer";

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [clock, setClock] = useState("");
    // LOOP 9 (restored by the master merge): the wizard step is persisted with
    // the draft and restored on load, so an officer who reloads or crashes
    // returns to the step they were on instead of starting over at step 1.
    // The stored value is validated against the real step range, so a corrupted
    // or hand-edited value cannot put the wizard into a non-existent step.
    const [currentStep, setCurrentStep] = useState(() => {
        try {
            const raw = localStorage.getItem(DRAFT_PAYLOAD_KEY);
            const saved = raw ? JSON.parse(raw)?.__wizard_step : null;
            const n = Number(saved);
            return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 1;
        } catch (e) {
            return 1;
        }
    });
    const [submitting, setSubmitting] = useState(false);
    const [submissionFinalized, setSubmissionFinalized] = useState(false);
    const [showRoutingSlip, setShowRoutingSlip] = useState(false);
    const [routingSlipData, setRoutingSlipData] = useState(null);

    // ── LOOP 9 SUBMISSION INTEGRITY (restored by the master merge) ──────────
    // A/B. `submittingRef` is a SYNCHRONOUS lock, separate from the `submitting`
    // state. React state does not update until the next render, so a rapid
    // double click can read a stale `false` twice and fire two final
    // submissions. The ref is set before any await/then boundary, so the second
    // click is rejected in the same tick.
    const submittingRef = useRef(false);
    // A confirmed success is tracked explicitly so a FAILED submission can never
    // be rendered as a success, and so autosave knows to stand down.
    const [submissionSucceeded, setSubmissionSucceeded] = useState(false);
    // C/D. One controller for the in-flight autosave. A new autosave aborts the
    // previous one, and the signal is passed to axios so the browser actually
    // drops the request rather than leaving it to resolve into a late write.
    const autosaveControllerRef = useRef(null);
    const [flash, setFlash] = useState(null);
    const [errors, setErrors] = useState(serverErrors);
    const formRef = useRef(null);

    // Set when arriving from the map's "Start Anyway (Requires Variance Review)"
    // path so Step 1 can flag that this filing needs SB reclassification/variance.
    // Reads (without clearing) the same handoff payload the `form` initializer
    // below consumes and clears from sessionStorage.
    const [varianceNotice, setVarianceNotice] = useState(() => {
        try {
            const raw = sessionStorage.getItem("imaps_verified_parcel_prefill");
            return raw ? Boolean(JSON.parse(raw).requiresVariance) : false;
        } catch (e) {
            return false;
        }
    });

    // Smart Features State
    const [applicantSuggestion, setApplicantSuggestion] = useState(null);
    const [siteMapOpen, setSiteMapOpen] = useState(false);

    // Tracking identifier
    const [tempDraftId, setTempDraftId] = useState(() => {
        return cloudDraftRef || "TMP-" + Math.random().toString(36).substring(2, 11).toUpperCase();
    });
    const [syncStatus, setSyncStatus] = useState("Saved locally");

    // Map States
    const [brgyMapData, setBrgyMapData] = useState(null);
    const [parcelMapData, setParcelMapData] = useState(null);
    const [activeParcelFeature, setActiveParcelFeature] = useState(null);
    const [activeParcelIndex, setActiveParcelIndex] = useState(null);
    const rosarioCenter = [13.7850, 121.2500];

    // Payload cleaner
    const cleanPayload = (data) => {
        if (!data) return null;
        let parsed = data;
        if (typeof parsed === 'string') {
            try { parsed = JSON.parse(parsed); } catch (e) { return null; }
        }
        if (typeof parsed === 'object' && parsed !== null && "0" in parsed && "1" in parsed) {
            return null;
        }
        return parsed;
    };

    // Hydration
    const [form, setForm] = useState(() => {
        const baseForm = emptyForm();
        const validCloud = cleanPayload(cloudDraftPayload);
        if (validCloud) {
            return {
                ...baseForm,
                ...validCloud,
                parcels: Array.isArray(validCloud.parcels) && validCloud.parcels.length > 0
                         ? validCloud.parcels
                         : baseForm.parcels
            };
        }

        // One-shot handoff from the Permits & Status map layer's "Verify Parcel"
        // check (TCT/Tax Dec lookup + CLUP conformance) — see StatusPanel.jsx.
        try {
            const raw = sessionStorage.getItem("imaps_verified_parcel_prefill");
            if (raw) {
                sessionStorage.removeItem("imaps_verified_parcel_prefill");
                const prefill = JSON.parse(raw);
                return {
                    ...baseForm,
                    target_land_use_class: prefill.target_land_use_class || baseForm.target_land_use_class,
                    parcels: [
                        {
                            ...baseForm.parcels[0],
                            tct_number: prefill.tct_number || "",
                            tax_dec_number: prefill.tax_dec_number || "",
                            barangay: prefill.barangay || "",
                            owner_name: prefill.owner_name || "",
                            location_address: prefill.location_address || "",
                            lot_area_sqm: prefill.lot_area_sqm || "",
                            property_index_number: prefill.property_index_number || "",
                            lot_number: prefill.lot_number || "",
                            // The parcel's own CLUP zone, as Step 1's spatial lookup records it.
                            land_use_class: prefill.clup_zone_code || prefill.target_land_use_class || "",
                            cadastral_zone: prefill.cadastral_zone || "",
                            is_verified: Boolean(prefill.property_index_number),
                            coordinates: prefill.coordinates || "",
                        },
                    ],
                };
            }
        } catch (e) {}

        return baseForm;
    });

    // Valid parcels and total lot area computation (only when PIN is filled)
    const validParcels = useMemo(() => {
        return (form.parcels || []).filter((p) => Boolean(p.property_index_number?.trim()));
    }, [form.parcels]);

    const validParcelsCount = validParcels.length;

    const totalLotArea = useMemo(() => {
        return validParcels.reduce((acc, p) => acc + (parseFloat(p.lot_area_sqm) || 0), 0);
    }, [validParcels]);

    // Municipal fee schedule: one line per selected application type, land use from the lot's CLUP zone
    const feeBasis = useMemo(() => feeLandUse(form.parcels), [form.parcels]);
    const feeSuggestion = useMemo(
        () => ({ ...computeFeeLines(form.application_type, feeBasis.landUse, totalLotArea, form.project_cost || 0), ...feeBasis, area: totalLotArea }),
        [form.application_type, feeBasis, totalLotArea, form.project_cost]
    );

    const recommendedPetition = useMemo(() => {
        return getRecommendedPetition(form.parcels);
    }, [form.parcels]);

    // In Amendment track, ensure the legislative petition is strictly synchronized with
    // the zoning mismatch recommendation and cannot be left blank, unselected, or mismatched.
    useEffect(() => {
        if (form.application_stream === "amendment") {
            const currentTypes = (form.application_type || "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            const currentPetition = currentTypes.find((t) => t.startsWith("Petition for"));
            const targetPetition = recommendedPetition || currentPetition || "Petition for Rezoning";

            if (currentPetition !== targetPetition) {
                const standardTypes = currentTypes.filter((t) => !t.startsWith("Petition for"));
                setForm((f) => ({
                    ...f,
                    application_type: [...standardTypes, targetPetition].join(", "),
                }));
            }
        }
    }, [form.application_stream, recommendedPetition, form.application_type]);

    // The schedule only pre-fills the itemised fees; the officer can adjust them and the total is always their sum
    const applySuggestedFees = () => {
        setForm((prev) => ({
            ...prev,
            ...Object.fromEntries(TYPE_FEE_FIELDS.map((f) => [f, feeSuggestion.byField[f] > 0 ? feeSuggestion.byField[f].toFixed(2) : ""])),
        }));
    };

    // First visit to the Fees step with nothing itemised yet: pre-fill from the schedule
    useEffect(() => {
        if (currentStep !== STEP.FEES) return;
        const nothingEntered = TYPE_FEE_FIELDS.every((f) => !(parseFloat(form[f]) > 0));
        if (nothingEntered && feeSuggestion.total > 0) applySuggestedFees();
    }, [currentStep]);

    // Wipe the retired per-browser applicant cache (it held applicants' personal data on shared PCs)
    useEffect(() => {
        try {
            localStorage.removeItem(LEGACY_APPLICANT_REGISTRY_KEY);
        } catch (e) {}
    }, []);

    // Applicant auto-complete: past applicants from the database, looked up after typing pauses
    const formLatest = useRef(form);
    formLatest.current = form;
    const applicantLookupTimer = useRef(null);
    const applicantLookupSeq = useRef(0);
    const checkApplicantMatches = (val) => {
        clearTimeout(applicantLookupTimer.current);
        const q = String(val || "").trim();
        if (q.length < 3) {
            setApplicantSuggestion(null);
            return;
        }
        applicantLookupTimer.current = setTimeout(() => {
            const seq = ++applicantLookupSeq.current;
            axios
                .get("/applications/applicant-lookup", { params: { q } })
                .then(({ data }) => {
                    if (seq !== applicantLookupSeq.current) return;
                    const current = (formLatest.current.applicant_name || "").trim().toLowerCase();
                    const match = (Array.isArray(data) ? data : []).find((a) => a.applicant_name?.trim().toLowerCase() !== current);
                    setApplicantSuggestion(match || null);
                })
                .catch(() => seq === applicantLookupSeq.current && setApplicantSuggestion(null));
        }, 350);
    };
    useEffect(() => () => clearTimeout(applicantLookupTimer.current), []);

    const applyApplicantSuggestion = () => {
        if (!applicantSuggestion) return;
        const parts = splitFullName(applicantSuggestion.applicant_name);
        // Stored numbers are digits only; formatted to 10-digit mobile number
        let mobile = String(applicantSuggestion.contact_number || "").replace(/\D/g, "");
        if (mobile.startsWith("63") && mobile.length > 10) mobile = mobile.slice(2);
        if (mobile.startsWith("0") && mobile.length === 11) mobile = mobile.slice(1);
        if (mobile.length > 10) mobile = mobile.slice(-10);
        setForm((prev) => ({
            ...prev,
            ...parts,
            applicant_name: joinName(parts),
            contact_number: mobile || prev.contact_number,
            email: applicantSuggestion.email || prev.email,
            representative_name: applicantSuggestion.representative_name || prev.representative_name,
        }));
        setApplicantSuggestion(null);
        setFlash({ type: "success", msg: `Auto-filled details for ${applicantSuggestion.applicant_name}.` });
        setTimeout(() => setFlash(null), 3000);
    };

    // Helper to move focus to the next field when pressing Enter on an input
    const focusNextField = (currentEl) => {
        if (!currentEl) return;
        const root = currentEl.closest("form") || formRef.current || document;
        const focusable = Array.from(
            root.querySelectorAll(
                'input:not([type="hidden"]):not([disabled]):not([readonly]), select:not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])'
            )
        ).filter((el) => {
            return el.offsetParent !== null && window.getComputedStyle(el).visibility !== "hidden";
        });

        const index = focusable.indexOf(currentEl);
        if (index >= 0 && index < focusable.length - 1) {
            focusable[index + 1].focus();
        }
    };

    // Global Keyboard Navigation
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                if (currentStep === STEP.REVIEW) {
                    if (!submitting && !submissionFinalized) handleSubmit(e);
                } else {
                    handleNext();
                }
                return;
            }

            if (e.altKey && e.key === "ArrowLeft") {
                e.preventDefault();
                handleBack();
                return;
            }

            if (e.key === "Enter") {
                // If focused on a select dropdown, open it and NEVER trigger Next
                if (e.target.tagName === "SELECT") {
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                        if (typeof e.target.showPicker === "function") {
                            e.target.showPicker();
                        } else {
                            const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window });
                            e.target.dispatchEvent(event);
                        }
                    } catch (err) {}
                    return;
                }

                // If focused on textarea, submit button, or regular button, let native behavior proceed
                if (e.target.tagName === "TEXTAREA" || e.target.type === "submit" || e.target.type === "button" || e.target.dataset?.noAdvance) {
                    return;
                }

                // If focused on an input field:
                // User uses Tab and Enter to navigate fields — move to next field instead of triggering Next
                if (e.target.tagName === "INPUT") {
                    e.preventDefault();
                    focusNextField(e.target);
                    return;
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [currentStep, form]);

    useEffect(() => {
        const validCloud = cleanPayload(cloudDraftPayload);
        if (validCloud) {
            setForm((prev) => ({
                ...prev,
                ...validCloud,
                parcels: Array.isArray(validCloud.parcels) && validCloud.parcels.length > 0
                    ? validCloud.parcels
                    : prev.parcels,
            }));
            if (cloudDraftRef) {
                setTempDraftId(cloudDraftRef);
            }
        }
    }, [cloudDraftPayload, cloudDraftRef]);

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

    // Draft persistence handlers
    const persistDraftState = (uuid, payload) => {
        try {
            if (uuid) localStorage.setItem(DRAFT_UUID_KEY, uuid);
            if (payload) localStorage.setItem(DRAFT_PAYLOAD_KEY, JSON.stringify(payload));
        } catch (e) {}
    };

    const clearDraftStateRecord = () => {
        try {
            localStorage.removeItem(DRAFT_UUID_KEY);
            localStorage.removeItem(DRAFT_PAYLOAD_KEY);
        } catch (e) {}
    };

    // E. Abort any outstanding autosave. Called BEFORE the final submission so a
    // stale autosave cannot resolve afterwards and recreate/overwrite a draft
    // that the server has already turned into an application.
    const abortOutstandingAutosave = () => {
        autosaveControllerRef.current?.abort();
        autosaveControllerRef.current = null;
    };

    // Auto-save sync effect
    useEffect(() => {
        if (submissionFinalized) return;
        // O. While a final submission is in flight (or already succeeded) the
        // autosave must stand down entirely.
        if (submitting || submissionSucceeded) return;

        const handler = setTimeout(() => {
            const hasData = form.application_type || form.form_number || form.applicant_name || form.barangay;
            if (!hasData) return;

            setSyncStatus("Saving modifications...");
            // The wizard step is part of the saved draft: an officer who reloads
            // or crashes must return to the step they were on, not to step 1.
            persistDraftState(tempDraftId, { ...form, __wizard_step: currentStep });
            setSyncStatus("Saving modifications...");
            // The wizard step is part of the saved draft: an officer who reloads
            // or crashes must return to the step they were on, not to step 1.
            persistDraftState(tempDraftId, { ...form, __wizard_step: currentStep });
            abortOutstandingAutosave();
            const controller = new AbortController();
            autosaveControllerRef.current = controller;

            axios.post("/applications/drafts/save", {
                temp_id: tempDraftId,
                payload: form,
            }, { signal: controller.signal })
            .then(() => {
                if (autosaveControllerRef.current === controller) {
                    autosaveControllerRef.current = null;
                    setSyncStatus("Auto-saved to drafts");
                }
            })
            .catch((error) => {
                // F. An intentional abort is not a failure and must not tell the
                // officer their draft could not be saved.
                if (axios.isCancel(error)) return;
                setSyncStatus("Saved locally");
            });
        }, 1200);

        return () => clearTimeout(handler);
    }, [form, tempDraftId, submissionFinalized, submitting, submissionSucceeded]);

    const handleManualSave = () => {
        if (submissionFinalized || submitting || submissionSucceeded) return;

        setSyncStatus("Saving modifications...");
        persistDraftState(tempDraftId, { ...form, __wizard_step: currentStep });
        abortOutstandingAutosave();
        const controller = new AbortController();
        autosaveControllerRef.current = controller;
        axios
            .post("/applications/drafts/save", {
                temp_id: tempDraftId,
                payload: form,
            }, { signal: controller.signal })
            .then(() => {
                if (autosaveControllerRef.current === controller) {
                    autosaveControllerRef.current = null;
                    setSyncStatus("Auto-saved to drafts");
                }
                setFlash({ type: "success", msg: `Draft synchronized (${tempDraftId}).` });
                setTimeout(() => setFlash(null), 3000);
            })
            .catch((error) => {
                if (axios.isCancel(error)) return;
                setSyncStatus("Saved locally");
                setFlash({ type: "success", msg: "Draft stored to local storage." });
                setTimeout(() => setFlash(null), 3000);
            });
    };

    const handleRestart = () => {
        Swal.fire({
            title: "Reset Application Form?",
            text: "This will clear all entered application fields and draft data. You can start fresh from Step 1.",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Yes, Reset Form",
            cancelButtonText: "Cancel",
            buttonsStyling: false,
            customClass: {
                popup: "rounded-3xl border border-slate-200 shadow-2xl p-6 sm:p-8 bg-white font-sans",
                title: "text-lg font-bold text-slate-900",
                htmlContainer: "text-xs text-slate-500",
                actions: "flex items-center justify-center gap-3 mt-5",
                confirmButton: "inline-flex items-center justify-center px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer",
                cancelButton: "inline-flex items-center justify-center px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-all active:scale-95 cursor-pointer",
            },
        }).then((res) => {
            if (res.isConfirmed) {
                clearDraftStateRecord();
                setTempDraftId("TMP-" + Math.random().toString(36).substring(2, 11).toUpperCase());
                setForm(emptyForm());
                setCurrentStep(1);
                setActiveParcelFeature(null);
                setActiveParcelIndex(null);
                setSyncStatus("Saved locally");
            }
        });
    };

    // Parcel Management
    const addParcel = () => {
        const nextIndex = (form.parcels || []).length + 1;
        const newCode = `P-${String(nextIndex).padStart(2, "0")}`;
        setForm((prev) => ({
            ...prev,
            parcels: [
                ...(prev.parcels || []),
                {
                    parcel_code: newCode,
                    location_address: "",
                    barangay: "",
                    owner_name: "",
                    property_index_number: "",
                    arp_number: "",
                    survey_number: "",
                    lot_number: "",
                    tct_number: "",
                    tax_dec_number: "",
                    lot_area_sqm: "",
                    land_use_class: "",
                    allowable_use: "",
                    coordinates: "",
                },
            ],
        }));
    };

    const removeParcel = (index) => {
        if ((form.parcels || []).length <= 1) return;
        setForm((prev) => {
            const nextParcels = prev.parcels.filter((_, i) => i !== index);
            return {
                ...prev,
                parcels: nextParcels.map((p, i) => ({
                    ...p,
                    parcel_code: `P-${String(i + 1).padStart(2, "0")}`,
                })),
            };
        });
        if (activeParcelIndex === index) {
            setActiveParcelFeature(null);
            setActiveParcelIndex(null);
        }
    };

    const setParcelField = (index, field) => (e) => {
        const val = e.target.value;
        setForm((prev) => ({
            ...prev,
            parcels: (prev.parcels || []).map((p, i) => (i === index ? { ...p, [field]: val } : p)),
        }));
        if (errors[`parcels.${index}.${field}`]) {
            setErrors((prev) => {
                const next = { ...prev };
                delete next[`parcels.${index}.${field}`];
                return next;
            });
        }
    };

    const [pinLoading, setPinLoading] = useState({});
    const [pinLookupMap, setPinLookupMap] = useState({});

    const getGeometryCentroid = (geometry) => {
        if (!geometry || !geometry.coordinates) return null;

        const averageRing = (ring) => {
            if (!ring || ring.length === 0) return null;
            const totals = ring.reduce(
                (acc, coord) => ({
                    lat: acc.lat + Number(coord[1]),
                    lng: acc.lng + Number(coord[0]),
                }),
                { lat: 0, lng: 0 },
            );
            return {
                lat: totals.lat / ring.length,
                lng: totals.lng / ring.length,
            };
        };

        if (geometry.type === "Polygon") {
            return averageRing(geometry.coordinates[0] || []);
        }

        if (geometry.type === "MultiPolygon") {
            return averageRing(geometry.coordinates?.[0]?.[0] || []);
        }

        return null;
    };
    const fetchZoningByCoords = async (lat, lng) => {
        if (!lat || !lng) return null;
        try {
            const res = await fetch(`/api/map/zoning-lookup?lat=${lat}&lng=${lng}`);
            if (!res.ok) return null;
            const payload = await res.json();
            return payload.lup_2030;
        } catch (e) {
            return null;
        }
    };
    const fetchZoningByParcelArea = async (pin) => {
        if (!pin) return null;
        try {
            const res = await fetch(`/api/map/zoning-area-lookup?pin=${encodeURIComponent(pin)}`);
            if (!res.ok) return null;
            const payload = await res.json();
            return payload.lup_2030;
        } catch (e) {
            return null;
        }
    };

    useEffect(() => {
        fetch("/api/map/barangay_boundary")
            .then((res) => res.json())
            .then((data) => setBrgyMapData(data))
            .catch(() => {});

        const loadParcelLookup = async () => {
            try {
                // Fetch live cadastral parcels from the database engine
                const response = await fetch("/api/map/land_parcels");
                if (!response.ok) return;
                const payload = await response.json();

                setParcelMapData(payload);

                const lookupMap = {};
                (payload.features || []).forEach((feature) => {
                    const pin = feature?.properties?.property_index_number?.trim();
                    if (!pin) return;
                    const centroid = getGeometryCentroid(feature.geometry);
                    lookupMap[pin] = {
                        feature: feature,
                        property_index_number: pin,
                        arp_number: feature.properties?.arp_number || feature.properties?.arp_no || "",
                        survey_number: feature.properties?.survey_number || feature.properties?.survey_no || "",
                        location_address: feature.properties?.location_address || "",
                        owner_name: feature.properties?.owner_name || "",
                        barangay: feature.properties?.barangay || "",
                        tct_number: feature.properties?.tct_number || "",
                        tax_dec_number: feature.properties?.tax_dec_number || "",
                        lot_number: feature.properties?.lot_number || "",
                        land_use_class: feature.properties?.land_use_class || "",
                        lot_area_sqm: feature.properties?.lot_area_sqm != null ? String(feature.properties.lot_area_sqm) : "",
                        coordinates: centroid ? `${centroid.lat.toFixed(6)},${centroid.lng.toFixed(6)}` : "",
                    };
                });

                setPinLookupMap(lookupMap);
            } catch (error) {}
        };

        loadParcelLookup();
    }, []);

    const lookupPin = async (pin) => {
        const normalizedPin = pin?.trim();
        if (!normalizedPin) throw new Error("Property Index Number is required");

        if (pinLookupMap[normalizedPin]) {
            return pinLookupMap[normalizedPin];
        }

        const res = await fetch(`/api/tax-map/lookup/${encodeURIComponent(normalizedPin)}`);
        if (!res.ok) {
            throw new Error("Unable to locate parcel geometry with the provided PIN.");
        }
        const payload = await res.json();
        return payload.data;
    };

    const handlePinLookup = async (index) => {
        const pin = form.parcels[index]?.property_index_number?.trim();

        const isDuplicate = (form.parcels || []).some((p, i) => i !== index && p.property_index_number?.trim() === pin);
        if (isDuplicate) {
            setErrors((prev) => ({ ...prev, [`parcels.${index}.property_index_number`]: "This PIN is already attached to another parcel." }));
            setFlash({ type: "error", msg: "Duplicate PIN detected." });
            setTimeout(() => setFlash(null), 4000);
            return;
        }

        setPinLoading((prev) => ({ ...prev, [index]: true }));

        try {
            const data = await lookupPin(pin);
            if (data.feature) {
                setActiveParcelFeature(data.feature);
                setActiveParcelIndex(index);
            }

            const cadastralZoneClass = data.land_use_class || data.zoning_plan_class || data.recorded_land_use_class || "";
            let coordsStr = data.coordinates || (data.latitude && data.longitude ? `${data.latitude},${data.longitude}` : null);

            setForm((prev) => {
                const newBarangay = index === 0 && data.barangay ? data.barangay : prev.barangay;
                const newStreet = index === 0 && data.location_address ? data.location_address : prev.street_address;
                return {
                    ...prev,
                    barangay: newBarangay,
                    street_address: newStreet,
                    parcels: (prev.parcels || []).map((p, i) =>
                        i === index
                            ? {
                                  ...p,
                                  property_index_number: data.property_index_number || p.property_index_number,
                                  arp_number: data.arp_number || p.arp_number || "",
                                  survey_number: data.survey_number || p.survey_number || "",
                                  location_address: data.location_address || p.location_address || prev.street_address || "",
                                  barangay: data.barangay || p.barangay || "",
                                  owner_name: data.owner_name || p.owner_name || prev.applicant_name || "",
                                  lot_number: data.lot_number || p.lot_number || "",
                                  tct_number: data.tct_number || p.tct_number || "",
                                  tax_dec_number: data.tax_dec_number || p.tax_dec_number || "",
                                  lot_area_sqm: data.lot_area_sqm ?? p.lot_area_sqm,
                                  cadastral_zone: cadastralZoneClass,
                                  land_use_class: "",
                                  is_zoning_loading: Boolean(pin),
                                  is_verified: true,
                                  coordinates: coordsStr || p.coordinates,
                              }
                            : p,
                    ),
                };
            });
            setErrors((prev) => {
                const next = { ...prev };
                delete next[`parcels.${index}.property_index_number`];
                delete next.barangay;
                return next;
            });
            setFlash({ type: "success", msg: `PIN ${pin} verified successfully.` });
            setTimeout(() => setFlash(null), 3000);

            // Fetch spatial zoning intersection in background
            fetchZoningByParcelArea(pin).then((spatialZoning) => {
                setForm((prev) => ({
                    ...prev,
                    parcels: (prev.parcels || []).map((p, i) =>
                        i === index
                            ? {
                                  ...p,
                                  land_use_class: spatialZoning || "Unmapped in CLUP",
                                  is_zoning_loading: false,
                              }
                            : p
                    ),
                }));
            }).catch(() => {
                setForm((prev) => ({
                    ...prev,
                    parcels: (prev.parcels || []).map((p, i) =>
                        i === index
                            ? {
                                  ...p,
                                  land_use_class: "Unmapped in CLUP",
                                  is_zoning_loading: false,
                              }
                            : p
                    ),
                }));
            });
        } catch (err) {
            setErrors((prev) => ({ ...prev, [`parcels.${index}.property_index_number`]: err?.message || "PIN not found in approved records" }));
            setForm((prev) => ({ ...prev, parcels: (prev.parcels || []).map((p, i) => i === index ? { ...p, is_verified: false, is_zoning_loading: false } : p) }));
        } finally {
            setPinLoading((prev) => ({ ...prev, [index]: false }));
        }
    };
    // Direct GIS Map Click-to-Select Handler
    const handleSelectMapParcel = (pin, lot, area, brgy, feature, preloadedClupZone = null) => {
        const targetIdx = activeParcelIndex !== null ? activeParcelIndex : 0;
        const pProps = feature?.properties || {};
        
        const centroid = getGeometryCentroid(feature?.geometry);
        const cadastralZoneClass = pProps.land_use_class || pProps.zoning_class || pProps.land_use || "";
        const hasPreloaded = preloadedClupZone !== null && preloadedClupZone !== undefined && preloadedClupZone !== "";
        const clupZoningClass = hasPreloaded ? preloadedClupZone : "";
        const isChecking = !hasPreloaded && Boolean(pin);

        const tdNo = pProps.tax_dec_number || pProps.td_no || "";
        const arpNo = pProps.arp_number || pProps.arp_no || "";
        const surveyNo = pProps.survey_number || pProps.survey_no || "";
        const tctNo = pProps.tct_number || "";
        const locationAddress = pProps.location_address || "";
        const ownerName = pProps.owner_name || "";

        if (feature) {
            setActiveParcelFeature(feature);
            setActiveParcelIndex(targetIdx);
        }

        // Apply state update synchronously for instant UI response
        setForm((prev) => {
            const newBarangay = targetIdx === 0 && brgy ? brgy : prev.barangay;
            const newStreet = targetIdx === 0 && locationAddress ? locationAddress : prev.street_address;
            return {
                ...prev,
                barangay: newBarangay,
                street_address: newStreet,
                parcels: (prev.parcels || []).map((p, i) =>
                    i === targetIdx
                        ? {
                              ...p,
                              property_index_number: pin || p.property_index_number,
                              arp_number: arpNo || p.arp_number,
                              survey_number: surveyNo || p.survey_number,
                              location_address: locationAddress || p.location_address || prev.street_address || "",
                              lot_number: lot || p.lot_number,
                              lot_area_sqm: area != null ? String(area) : p.lot_area_sqm,
                              barangay: brgy || p.barangay,
                              owner_name: ownerName || p.owner_name || prev.applicant_name || "",
                              tax_dec_number: tdNo || p.tax_dec_number,
                              tct_number: tctNo || p.tct_number,
                              cadastral_zone: cadastralZoneClass, 
                              land_use_class: clupZoningClass,
                              is_zoning_loading: isChecking,
                              is_verified: Boolean(pin),
                              coordinates: centroid ? `${centroid.lat.toFixed(6)},${centroid.lng.toFixed(6)}` : p.coordinates,
                          }
                        : p
                ),
            };
        });

        setFlash({ type: "success", msg: `Selected lot PIN: ${pin || "Map Polygon"}` });
        setTimeout(() => setFlash(null), 3000);

        // Perform spatial zoning lookup asynchronously in background if not preloaded
        if (pin && !hasPreloaded) {
            fetchZoningByParcelArea(pin).then((spatialZoning) => {
                setForm((prev) => ({
                    ...prev,
                    parcels: (prev.parcels || []).map((p, i) =>
                        i === targetIdx
                            ? {
                                  ...p,
                                  land_use_class: spatialZoning || "Unmapped in CLUP",
                                  is_zoning_loading: false,
                              }
                            : p
                    ),
                }));
            }).catch(() => {
                setForm((prev) => ({
                    ...prev,
                    parcels: (prev.parcels || []).map((p, i) =>
                        i === targetIdx
                            ? {
                                  ...p,
                                  land_use_class: "Unmapped in CLUP",
                                  is_zoning_loading: false,
                              }
                            : p
                    ),
                }));
            });
        }
    };

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

    const set = (field) => (e) => {
        const val = e.target.value;
        setForm((f) => ({ ...f, [field]: val }));
        if (field === "email") {
            checkApplicantMatches(val, "email");
        }
        if (errors[field]) {
            setErrors((err) => {
                const n = { ...err };
                delete n[field];
                return n;
            });
        }
    };

    const handleNameChange = (field) => (e) => {
        const rawVal = e.target.value;
        const val = toTitleCase(rawVal);
        setForm((prev) => {
            const next = { ...prev, [field]: val };
            const parts = [
                next.first_name?.trim(),
                next.middle_name?.trim(),
                next.last_name?.trim(),
                next.suffix?.trim(),
            ].filter(Boolean);

            return {
                ...next,
                applicant_name: parts.join(" "),
            };
        });

        checkApplicantMatches(val, field);

        if (errors[field] || errors.applicant_name) {
            setErrors((prev) => {
                const next = { ...prev };
                delete next[field];
                delete next.applicant_name;
                return next;
            });
        }
    };

    const handleTypeSelect = (typeId) => {
        const isPetition = typeId.startsWith("Petition for");
        if (form.application_stream === "amendment" && isPetition) {
            // If there is an actual recommendation based on the mismatch, it is locked:
            // The user cannot uncheck it, nor can they change the recommendation to the other petition.
            if (recommendedPetition) {
                return;
            }
            // If no specific mismatch recommendation exists, allow selecting between petitions (radio behavior),
            // but prevent unchecking to 0 petitions.
            setForm((f) => {
                const current = (f.application_type || "")
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean);
                const standardTypes = current.filter((t) => !t.startsWith("Petition for"));
                return {
                    ...f,
                    application_type: [...standardTypes, typeId].join(", "),
                };
            });
            if (errors.application_type) {
                setErrors((err) => {
                    const n = { ...err };
                    delete n.application_type;
                    return n;
                });
            }
            return;
        }

        setForm((f) => {
            const current = (f.application_type || "")
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean);
                
            const next = current.includes(typeId)
                ? current.filter((item) => item !== typeId)
                : [...current, typeId];

            return {
                ...f,
                application_type: next.join(", "),
            };
        });
        if (errors.application_type) {
            setErrors((err) => {
                const n = { ...err };
                delete n.application_type;
                return n;
            });
        }
    };

    const handleContactInput = (e) => {
        let val = e.target.value.replace(/\D/g, "");
        if (val === "") {
            setForm((f) => ({ ...f, contact_number: "" }));
            checkApplicantMatches("", "contact_number");
            return;
        }
        if (val.startsWith("63") && val.length > 10) val = val.slice(2);
        if (val.startsWith("0") && val.length === 11) val = val.slice(1);
        if (val.length > 10) val = val.slice(0, 10);
        setForm((f) => ({ ...f, contact_number: val }));
        checkApplicantMatches(val, "contact_number");
    };

    const handleFeeBlur = (e) => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) setForm((f) => ({ ...f, assessment_fee: v.toFixed(2) }));
    };

    const validateStep = (step) => {
        const newErrors = {};

        if (step === STEP.PROPERTY) {
            if (!form.barangay?.trim()) newErrors.barangay = "Barangay is required";

            if (!form.parcels || form.parcels.length === 0) {
                newErrors.parcels = "At least one parcel is required";
            } else {
                const seenPins = new Set();
                form.parcels.forEach((parcel, index) => {
                    const pin = parcel.property_index_number?.trim();
                    if (!pin) {
                        newErrors[`parcels.${index}.property_index_number`] = "PIN is required";
                    } else if (seenPins.has(pin)) {
                        newErrors[`parcels.${index}.property_index_number`] = "Duplicate PIN";
                    } else {
                        seenPins.add(pin);
                    }
                });
            }

            // A standard clearance can't proceed on a lot whose recorded use contradicts the CLUP
            if (form.application_stream !== "amendment" && hasZoningMismatch(form.parcels)) {
                newErrors.parcels = "Resolve the zoning mismatch (switch to a rezoning or reclassification petition) before continuing";
            }
        }

        if (step === STEP.APPLICATION) {
            if (!form.application_type) newErrors.application_type = "Select an application category";
            if (!form.form_number?.trim()) newErrors.form_number = "Form number is required";
            if (!form.purpose?.trim()) newErrors.purpose = "Operational purpose is required";
            if (form.application_stream === "amendment") {
                if (!form.target_land_use_class) {
                    newErrors.target_land_use_class = "Target zoning class is required";
                }
                const currentTypes = (form.application_type || "")
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                const recPetition = getRecommendedPetition(form.parcels);
                if (recPetition && !currentTypes.includes(recPetition)) {
                    newErrors.application_type = `This application requires ${recPetition} due to the zoning mismatch.`;
                } else if (!currentTypes.some((t) => t.startsWith("Petition for"))) {
                    newErrors.application_type = "A legislative petition (Rezoning or Reclassification) is required for Track B.";
                }
            }
            if (form.application_stream !== "amendment" && hasZoningMismatch(form.parcels)) {
                newErrors.application_stream = "A lot's zoning doesn't match the CLUP, so this must be a legislative amendment (Track B)";
            }

            // Parcel evaluation decision, as in the earlier Evaluation step
            (form.parcels || []).forEach((parcel, index) => {
                if (!parcel.decision) {
                    newErrors[`parcels.${index}.decision`] = "Evaluation decision is required";
                }
                if (parcel.decision === "Needs Site Inspection") {
                    if (!parcel.inspector_id) newErrors[`parcels.${index}.inspector_id`] = "Required";
                    if (!parcel.scheduled_date) newErrors[`parcels.${index}.scheduled_date`] = "Required";
                    if (!parcel.deadline_date) newErrors[`parcels.${index}.deadline_date`] = "Required";
                }
                if (parcel.decision === "Declined" && !parcel.decision_reason?.trim()) {
                    newErrors[`parcels.${index}.decision_reason`] = "Required for declined parcels";
                }
            });
        }

        if (step === STEP.APPLICANT) {
            if (!form.right_over_land) newErrors.right_over_land = "State the applicant's right over the land";
            if (!form.last_name?.trim()) newErrors.last_name = "Last name is required";
            if (!form.first_name?.trim()) newErrors.first_name = "First name is required";
            if (!form.applicant_name?.trim()) newErrors.applicant_name = "Applicant name is required";
            if (!form.contact_number?.trim()) {
                newErrors.contact_number = "Phone number is required";
            } else if (form.contact_number.length !== 10) {
                newErrors.contact_number = "Must be a 10-digit phone number";
            }
            if (!form.email?.trim()) {
                newErrors.email = "Email address is required";
            } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
                newErrors.email = "Enter a valid email format";
            }
            if (form.representative_contact && form.representative_contact.length !== 10) {
                newErrors.representative_contact = "Must be a 10-digit phone number";
            }
        }

        if (step === STEP.FEES) {
            if (!form.or_number?.trim()) {
                newErrors.or_number = "Official Receipt (OR) number is required.";
            }
            if (form.assessment_fee === "" || form.assessment_fee == null || Number(form.assessment_fee) < 0) {
                newErrors.assessment_fee = "Assessment fee is required.";
            }
        }

        if (step === STEP.REVIEW) {
            if (!form.preferred_release_mode) {
                newErrors.preferred_release_mode = "Preferred mode of release is required.";
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleNext = () => {
        if (validateStep(currentStep)) {
            setCurrentStep((p) => p + 1);
            if (formRef.current) formRef.current.scrollTo({ top: 0, behavior: "smooth" });
        } else {
            setFlash({
                type: "error",
                msg: `Please complete the required fields in Step ${currentStep}.`,
            });
            setTimeout(() => setFlash(null), 4000);
        }
    };

    const handleBack = () => {
        if (currentStep > STEP.PROPERTY) setCurrentStep((p) => p - 1);
        if (formRef.current) formRef.current.scrollTo({ top: 0, behavior: "smooth" });
    };

    const handleSubmit = (e) => {
        // A. Synchronous lock FIRST, before any await/then boundary. A second
        // click in the same tick is rejected here, so two final submissions can
        // never be created for one application.
        if (submittingRef.current || submitting || submissionFinalized || submissionSucceeded) return;
        if (e && e.preventDefault) e.preventDefault();

        // Every step is re-checked: drafts and step-jumping can skip earlier validation
        const failedStep = [STEP.PROPERTY, STEP.APPLICATION, STEP.APPLICANT, STEP.FEES, STEP.REVIEW].find((s) => !validateStep(s));
        if (failedStep) {
            setCurrentStep(failedStep);
            setFlash({ type: "error", msg: `Please complete the required fields in the ${STEPS[failedStep - 1].title} step.` });
            setTimeout(() => setFlash(null), 4000);
            return;
        }

        setSubmissionFinalized(true);
        setSubmitting(true);
        // A (cont). Claim the lock synchronously, before the request is issued.
        submittingRef.current = true;
        // E. Stop the autosave BEFORE the final submission, so a stale autosave
        // cannot complete after the server has recorded the application and
        // resurrect the draft it just consumed.
        abortOutstandingAutosave();

        const payload = {
            ...form,
            route_to_sb: form.application_stream === "amendment" ? true : Boolean(form.route_to_sb),
            draft_id: tempDraftId,
        };
        router.post("/applications/encode", payload, {
            onSuccess: (page) => {
                const ref = page.props.flash?.reference_number;
                const newAppId = page.props.flash?.application_id || null;

                if (!ref) {
                    setSubmissionFinalized(false);
                    setSubmitting(false);
                    submittingRef.current = false;
                    setFlash({
                        type: "error",
                        msg: "The server did not confirm a reference number. Your application was not recorded — please submit again.",
                    });
                    setTimeout(() => setFlash(null), 8000);
                    return;
                }

                setRoutingSlipData({
                    reference_number: ref,
                    date_of_application: new Date().toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }),
                    encoded_by_name: userName,
                    applicant_name: form.applicant_name,
                    contact_number: form.contact_number,
                    email: form.email,
                    representative_name: form.representative_name,
                    application_type: form.application_type,
                    land_use_class: feeBasis.zoneCode || "—",
                    purpose: form.purpose,
                    barangay: form.barangay,
                    street_address: form.street_address,
                    parcels: form.parcels,
                    total_area: totalLotArea,
                    project_cost: form.project_cost,
                    assessment_fee: form.assessment_fee,
                    or_number: form.or_number,
                });
                setShowRoutingSlip(true);

                clearDraftStateRecord();
                setTempDraftId("TMP-" + Math.random().toString(36).substring(2, 11).toUpperCase());
                setSyncStatus("Submitted");
                setSubmissionFinalized(true);
                setSubmissionSucceeded(true);

                const applicantName = form.applicant_name?.trim() || joinName(form.first_name, form.middle_name, form.last_name, form.suffix).trim() || "N/A";
                const appType = form.application_type || (form.application_stream === "amendment" ? "Amendment Track" : "Standard Permit");
                const barangay = form.parcels?.[0]?.barangay || form.barangay || "N/A";
                const totalFee = form.assessment_fee ? Number(form.assessment_fee) : 0;

                Swal.fire({
                    title: "Application Encoded Successfully!",
                    html: `
                        <div class="text-left text-xs text-slate-600 mt-2 space-y-3">
                            <p class="text-center font-medium text-slate-600 mb-3">
                                ${ref ? `Reference No: <span class="font-bold text-slate-900">${ref}</span>` : "Application record created successfully."}
                            </p>
                            <div class="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 text-left space-y-2 text-xs">
                                <div class="flex justify-between items-center border-b border-slate-200/60 pb-1.5">
                                    <span class="font-medium text-slate-500 text-[11px]">Applicant</span>
                                    <span class="font-semibold text-slate-800">${applicantName}</span>
                                </div>
                                <div class="flex justify-between items-center border-b border-slate-200/60 pb-1.5">
                                    <span class="font-medium text-slate-500 text-[11px]">Type / Track</span>
                                    <span class="font-semibold text-slate-800">${appType}</span>
                                </div>
                                <div class="flex justify-between items-center ${totalFee > 0 ? "border-b border-slate-200/60 pb-1.5" : ""}">
                                    <span class="font-medium text-slate-500 text-[11px]">Barangay</span>
                                    <span class="font-semibold text-slate-800">${barangay}</span>
                                </div>
                                ${totalFee > 0 ? `
                                <div class="flex justify-between items-center pt-0.5">
                                    <span class="font-medium text-slate-500 text-[11px]">Assessed Fee</span>
                                    <span class="font-bold text-emerald-600">₱${totalFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>` : ""}
                            </div>
                        </div>
                    `,
                    icon: "success",
                    iconHtml: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
                    showCancelButton: true,
                    confirmButtonText: "View Application Details",
                    cancelButtonText: "Applications List",
                    buttonsStyling: false,
                    customClass: {
                        popup: "rounded-3xl border border-slate-200 shadow-2xl p-6 sm:p-8 bg-white font-sans max-w-md",
                        title: "text-lg font-bold text-slate-900",
                        htmlContainer: "text-xs text-slate-500 mt-2",
                        actions: "flex flex-col-reverse sm:flex-row items-center justify-center gap-3 mt-6 w-full",
                        confirmButton: "w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer",
                        cancelButton: "w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-all active:scale-95 cursor-pointer",
                    },
                }).then((result) => {
                    if (result.isConfirmed && newAppId) {
                        router.visit(`/applications/${newAppId}`);
                    } else {
                        router.visit("/applications");
                    }
                });
            },
            onError: (errs) => {
                setSubmissionFinalized(false);
                // A. Release the synchronous lock so the officer can correct and
                // resubmit. `submissionSucceeded` deliberately stays false, so a
                // failure can never render as success.
                submittingRef.current = false;
                // J. The form is NOT reset: the officer keeps everything they
                // typed, and only the errors change.
                setErrors(errs);

                const errKeys = Object.keys(errs);
                let targetStep = STEP.REVIEW;
                const isDecisionError = (k) => /^parcels\.\d+\.(decision|decision_reason|inspector_id|scheduled_date|deadline_date|assigned_notes)$/.test(k);
                if (errKeys.some(isDecisionError)) {
                    targetStep = STEP.APPLICATION;
                } else if (errKeys.some((k) => k === "barangay" || k.startsWith("parcels"))) {
                    targetStep = STEP.PROPERTY;
                } else if (errKeys.some((k) => STEP_ERROR_FIELDS[STEP.APPLICATION].includes(k))) {
                    targetStep = STEP.APPLICATION;
                } else if (errKeys.some((k) => STEP_ERROR_FIELDS[STEP.APPLICANT].includes(k))) {
                    targetStep = STEP.APPLICANT;
                } else if (errKeys.some((k) => STEP_ERROR_FIELDS[STEP.FEES].includes(k))) {
                    targetStep = STEP.FEES;
                }

                setCurrentStep(targetStep);
                if (formRef.current) formRef.current.scrollTo({ top: 0, behavior: "smooth" });

                const firstErrorKey = errKeys[0];
                const actualErrorMessage = errs.db || errs[firstErrorKey] || "Please resolve the highlighted validation issues.";

                setFlash({
                    type: "error",
                    msg: actualErrorMessage,
                });

                setTimeout(() => setFlash(null), 6000);
            },
            onFinish: () => {
                setSubmitting(false);
                // Only a CONFIRMED success keeps the lock. On any other outcome
                // it is released here so the officer may resubmit.
                if (!submissionSucceeded) submittingRef.current = false;
            },
        });
    };

    // ── I. SESSION / CSRF EXPIRY (419) AND TRANSPORT FAILURE ────────────────
    // G/H. Inertia surfaces some failures as global events rather than through
    // this component's onError. Without these listeners a 419 during submission
    // fails silently: the button simply stops spinning and the officer believes
    // nothing happened.
    //
    // They are SCOPED to a submission in flight, so an unrelated page-level 419
    // does not overwrite a half-completed form, and both are removed on unmount
    // because Inertia's router.on returns an unsubscribe function.
    useEffect(() => {
        if (!submitting && !submissionFinalized) return;

        const isExpiredSession = (status) => status === 419 || status === 401;

        const offInvalid = router.on("invalid", (event) => {
            event.preventDefault();
            const status = event.detail?.response?.status ?? event.detail?.status;
            if (isExpiredSession(status)) {
                setSubmitting(false);
                submittingRef.current = false;
                setSubmissionFinalized(false);
                setFlash({
                    type: "error",
                    msg: "Your session or CSRF token expired before the server confirmed this application. Nothing was recorded — please sign in again and submit again.",
                });
                setTimeout(() => setFlash(null), 10000);
                return;
            }
            // A 5xx during submission is a server failure, not a validation
            // problem; it must not be presented as a field error.
            if (status >= 500) {
                setSubmitting(false);
                submittingRef.current = false;
                setSubmissionFinalized(false);
                setFlash({
                    type: "error",
                    msg: "The server failed before confirming this application. Your entries are preserved — please try again.",
                });
                setTimeout(() => setFlash(null), 10000);
            }
        });

        const offException = router.on("exception", (event) => {
            console.error("Submission exception:", event.detail?.exception);
            if (submissionSucceeded) return;

            event.preventDefault();
            setSubmitting(false);
            submittingRef.current = false;
            setSubmissionFinalized(false);
            setFlash({
                type: "error",
                msg: "The request could not reach the server, so this application was not recorded. Your entries are preserved — please try again.",
            });
            setTimeout(() => setFlash(null), 10000);
        });

        return () => {
            offInvalid?.();
            offException?.();
        };
    }, [submitting, submissionFinalized, submissionSucceeded]);

    const brgyStyle = {
        color: "#2563eb",
        weight: 1.5,
        opacity: 0.7,
        fillOpacity: 0.04,
        fillColor: "#3b82f6",
    };

    const getParcelStyle = (feature) => {
        const isActive = activeParcelFeature && activeParcelFeature.properties?.property_index_number === feature.properties?.property_index_number;
        // Selected feature uses QGIS's yellow selection colour
        return {
            color: isActive ? "#facc15" : "#2563eb",
            weight: isActive ? 3 : 1.5,
            opacity: 0.9,
            fillOpacity: isActive ? 0.45 : 0.2,
            fillColor: isActive ? "#fde047" : "#3b82f6",
        };
    };

    const workflowProgress = useMemo(() => {
        const done = [
            Boolean(form.barangay && form.parcels?.some((p) => p.property_index_number?.trim())),
            Boolean(form.application_type && form.form_number?.trim() && form.purpose?.trim() && (form.application_stream !== "amendment" || form.target_land_use_class)),
            Boolean((form.last_name?.trim() && form.first_name?.trim()) && form.contact_number?.trim() && form.email?.trim() && form.right_over_land),
            Boolean(form.or_number?.trim() && form.assessment_fee !== "" && Number(form.assessment_fee) >= 0),
            Boolean(form.preferred_release_mode),
        ];
        return done.filter(Boolean).length * 20;
    }, [form]);

    const stepHasInputs = (stepId) => {
        switch (stepId) {
            case STEP.PROPERTY:
                return Boolean(
                    form.barangay?.trim() ||
                    (Array.isArray(form.parcels) && form.parcels.some((p) => p.property_index_number?.trim() || p.is_verified || p.boundary_geojson || p.lot_area_sqm))
                );
            case STEP.APPLICATION:
                return Boolean(
                    form.application_type ||
                    form.form_number?.trim() ||
                    form.purpose?.trim() ||
                    form.target_land_use_class
                );
            case STEP.APPLICANT:
                return Boolean(
                    form.applicant_name?.trim() ||
                    form.first_name?.trim() ||
                    form.last_name?.trim() ||
                    form.contact_number?.trim() ||
                    form.email?.trim() ||
                    form.right_over_land ||
                    form.corporation_name?.trim() ||
                    form.representative_name?.trim()
                );
            case STEP.FEES:
                return Boolean(
                    form.or_number?.trim() ||
                    (form.assessment_fee !== "" && form.assessment_fee != null && Number(form.assessment_fee) > 0) ||
                    form.date_of_receipt
                );
            case STEP.REVIEW:
                return Boolean(form.preferred_release_mode);
            default:
                return false;
        }
    };

    const stepProgress = Math.round((currentStep / 5) * 100);

    return (
        <>
            <Head title="Encode Application | iMAPS Rosario" />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
                
                #encode-root {
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

                /* SweetAlert Modern iMAPS Theme Overrides */
                .swal2-container {
                    backdrop-filter: blur(4px) !important;
                    background-color: rgba(15, 23, 42, 0.4) !important;
                }
                .swal2-popup {
                    font-family: 'Plus Jakarta Sans', sans-serif !important;
                    border-radius: 1.5rem !important;
                    border: 1px solid #e2e8f0 !important;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15) !important;
                    padding: 1.75rem !important;
                }
                .swal2-icon.swal2-warning {
                    border-color: #f59e0b !important;
                    color: #f59e0b !important;
                    width: 3.5rem !important;
                    height: 3.5rem !important;
                    margin: 0.5rem auto 1rem !important;
                }
                .swal2-icon.swal2-success {
                    border-color: #10b981 !important;
                    color: #10b981 !important;
                    width: 3.5rem !important;
                    height: 3.5rem !important;
                    margin: 0.5rem auto 1rem !important;
                }
                .swal2-icon .swal2-icon-content {
                    font-size: 2rem !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                }
                .swal2-title {
                    font-size: 1.25rem !important;
                    font-weight: 700 !important;
                    color: #0f172a !important;
                    padding: 0 !important;
                    margin-bottom: 0.5rem !important;
                }
                .swal2-html-container {
                    font-size: 0.8125rem !important;
                    color: #64748b !important;
                    margin: 0 0 1.25rem !important;
                    line-height: 1.5 !important;
                }
                .swal2-actions {
                    gap: 0.75rem !important;
                    margin-top: 1rem !important;
                }

                /* Printable Routing Slip Optimizations */
                @media print {
                    body * {
                        visibility: hidden !important;
                    }
                    #printable-routing-slip, #printable-routing-slip * {
                        visibility: visible !important;
                    }
                    #printable-routing-slip {
                        position: fixed !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100vw !important;
                        height: auto !important;
                        max-height: 100% !important;
                        margin: 0 !important;
                        padding: 1.5rem !important;
                        background: #ffffff !important;
                        color: #0f172a !important;
                        border: none !important;
                        box-shadow: none !important;
                        z-index: 999999 !important;
                    }
                }
            `}</style>

            <div id="encode-root" className="bg-slate-50 font-sans text-slate-800 h-screen flex flex-col overflow-hidden">
                {/* ── TOP HEADER ── */}
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

                    {/* ── SLEEK CONTROL & STEPPER BAR ── */}
                    <div className="h-14 bg-white border-b border-slate-200/90 px-4 sm:px-6 flex items-center justify-between shrink-0 z-10 shadow-2xs gap-3">
                        {/* Left: Modern Return to Records Button & Title */}
                        <div className="flex items-center gap-3 shrink-0">
                            <Link 
                                href="/applications" 
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100/90 hover:bg-slate-200/90 text-slate-700 hover:text-slate-900 text-xs font-semibold border border-slate-200/80 transition-all shadow-2xs active:scale-95 group cursor-pointer"
                                title="Return to All Records"
                            >
                                <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                                </svg>
                                <span>All Records</span>
                            </Link>
                            <span className="h-4 w-px bg-slate-200 hidden sm:block" />
                            <div className="flex items-center gap-2">
                                <h1 className="text-xs sm:text-sm font-bold text-slate-900 leading-none">New Application</h1>
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 bg-slate-100/90 px-2 py-0.5 rounded-full">
                                    <span className={`w-1.5 h-1.5 rounded-full ${syncStatus === "Saving modifications..." ? "bg-amber-500 animate-ping" : syncStatus === "Auto-saved to drafts" ? "bg-emerald-500" : "bg-slate-400"}`} />
                                    <span className="hidden md:inline">{syncStatus}</span>
                                </span>
                            </div>
                        </div>

                        {/* Center: Modern Smart Stepper (Direct seamless access to each step, with indicator for steps with inputs) */}
                        <div className="flex items-center bg-slate-100/90 p-1 rounded-2xl border border-slate-200/80 gap-1 overflow-x-auto max-w-full">
                            {STEPS.map((step) => {
                                const hasInputs = stepHasInputs(step.id);
                                const isCurrent = currentStep === step.id;
                                return (
                                    <button
                                        key={step.id}
                                        type="button"
                                        onClick={() => {
                                            setCurrentStep(step.id);
                                            if (formRef.current) formRef.current.scrollTo({ top: 0, behavior: "smooth" });
                                        }}
                                        className={`group flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap select-none cursor-pointer ${
                                            isCurrent
                                                ? "bg-white text-blue-700 shadow-xs ring-1 ring-slate-200/80 font-bold cursor-default"
                                                : "text-slate-600 hover:text-blue-700 hover:bg-white/70"
                                        }`}
                                    >
                                        <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md transition-colors ${
                                            isCurrent
                                                ? "bg-blue-600 text-white shadow-2xs"
                                                : hasInputs
                                                ? "bg-blue-50 text-blue-700 border border-blue-200/60 group-hover:bg-blue-600 group-hover:text-white"
                                                : "bg-slate-200/70 text-slate-500 group-hover:bg-slate-300 group-hover:text-slate-700"
                                        }`}>
                                            0{step.id}
                                        </span>
                                        <span className="tracking-tight">{step.title}</span>
                                        {hasInputs && (
                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" title="Has inputs" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Right: Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                            <button 
                                type="button" 
                                onClick={handleRestart}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                </svg>
                                <span className="hidden sm:inline">Reset</span>
                            </button>
                            <button 
                                type="button" 
                                onClick={handleManualSave}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200/80 hover:bg-blue-100 shadow-2xs transition-all active:scale-98 cursor-pointer"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                                </svg>
                                <span>Save Draft</span>
                            </button>
                        </div>
                    </div>

                    {/* ── WORKSPACE ── */}
                    <main className="flex-1 w-full h-full flex flex-col bg-white overflow-hidden relative">
                        {flash && (
                            <div className="absolute top-4 right-4 z-[999] pointer-events-none animate-in fade-in slide-in-from-top-2">
                                <div className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl border shadow-xl max-w-sm pointer-events-auto transition-all ${flash.type === "success" ? "bg-slate-900 text-white border-slate-800" : "bg-rose-50 border-rose-200 text-rose-800"}`}>
                                    <p className="font-semibold text-xs flex-1">{flash.msg}</p>
                                    <button onClick={() => setFlash(null)} className="text-slate-400 hover:text-slate-200 cursor-pointer">
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Main Application Container - Full Screen Layout */}
                        <div className="relative z-10 flex-1 w-full h-full flex flex-col lg:flex-row bg-white overflow-hidden">
                            {currentStep === STEP.PROPERTY ? (
                                /* ── STEP 1: GIS STUDIO ── */
                                <StepPropertyGIS
                                    form={form}
                                    setForm={setForm}
                                    setParcelField={setParcelField}
                                    addParcel={addParcel}
                                    removeParcel={removeParcel}
                                    handlePinLookup={handlePinLookup}
                                    pinLoading={pinLoading}
                                    errors={errors}
                                    totalLotArea={totalLotArea}
                                    activeParcelIndex={activeParcelIndex}
                                    setActiveParcelIndex={setActiveParcelIndex}
                                    activeParcelFeature={activeParcelFeature}
                                    setActiveParcelFeature={setActiveParcelFeature}
                                    brgyMapData={brgyMapData}
                                    parcelMapData={parcelMapData}
                                    rosarioCenter={rosarioCenter}
                                    getParcelStyle={getParcelStyle}
                                    handleSelectMapParcel={handleSelectMapParcel}
                                    MapController={MapController}
                                    handleNext={handleNext}
                                    formRef={formRef}
                                    onPrintSiteMap={() => setSiteMapOpen(true)}
                                />
                            ) : (
                                /* ── STEPS 1, 2, 4, 5: LEFT DOSSIER + RIGHT ACTIVE FORM ── */
                                <>
                                    {/* Left: Step Guidance & Application Summary (Light Theme) */}
                                    <div className="w-full lg:w-76 xl:w-[310px] shrink-0 bg-slate-50/90 border-b lg:border-b-0 lg:border-r border-slate-200/90 p-4 sm:p-5 flex flex-col justify-between overflow-y-auto">
                                        <div className="space-y-3.5">
                                            <div>
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 uppercase tracking-wider">
                                                    Step {currentStep} of 5 · Application Form
                                                </span>
                                                <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight mt-1.5">
                                                    {STEPS[currentStep - 1]?.label}
                                                </h2>
                                                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                                                    {currentStep === STEP.APPLICATION && "Choose the clearance type, then describe the project. Options follow the zoning check of the property."}
                                                    {currentStep === STEP.APPLICANT && "Confirm who is applying and their right over the land. The registered owner can be used as the applicant."}
                                                    {currentStep === STEP.FEES && "Compute the assessment fee and record the official receipt."}
                                                    {currentStep === STEP.REVIEW && "Check every section, including the fee, then choose the release mode and submit."}
                                                </p>
                                            </div>

                                            {/* Application Summary or Review Checklist */}
                                            {currentStep === STEP.REVIEW ? (
                                                /* ── REVIEW & SECTION COMPLETION CHECKLIST ── */
                                                <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-xs flex flex-col items-center text-center">
                                                    <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center border border-emerald-100 mb-3 shadow-sm">
                                                        <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                    </div>
                                                    <div>
                                                        <h3 className="text-[13px] font-bold text-slate-800 tracking-tight">Ready for Review</h3>
                                                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                                                            Everything, including the assessed fee, is shown here for a final check before submission.
                                                        </p>
                                                    </div>
                                                    <div className="w-full pt-3.5 mt-3.5 border-t border-slate-100 text-left">
                                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2.5">Required Actions</p>
                                                        <ul className="text-[11px] text-slate-600 space-y-2 font-medium">
                                                            {[
                                                                ["Verify details in all sections", true],
                                                                ["Confirm the fee and OR number", true],
                                                                ["Select a mode of release", Boolean(form.preferred_release_mode)],
                                                            ].map(([text, ok]) => (
                                                                <li key={text} className="flex items-start gap-2">
                                                                    <svg className={`w-3.5 h-3.5 mt-px shrink-0 ${ok ? "text-blue-500" : "text-slate-300"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d={ok ? "M9 12l2 2 4-4" : "M5 12h14"} />
                                                                    </svg>
                                                                    <span className={ok ? "" : "text-slate-500"}>{text}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                </div>
                                            ) : (
                                                /* ── STEPS 1, 2, 5: APPLICATION SUMMARY CARD ── */
                                                <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-slate-200/90 shadow-xs space-y-2">
                                                    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Application Summary</span>
                                                        <span className="text-[10px] font-mono font-bold text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-md">{tempDraftId}</span>
                                                    </div>

                                                    <div className="space-y-1.5 text-xs">
                                                        <div>
                                                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Category</p>
                                                            <p className="font-bold text-slate-900 mt-0.5 truncate text-[11px]">{form.application_type || "Not selected yet"}</p>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-100">
                                                            <div>
                                                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Applicant</p>
                                                                <p className="font-semibold text-slate-800 truncate mt-0.5 text-[11px]">{form.applicant_name || "—"}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Zoning Class</p>
                                                                <p className="font-semibold text-slate-800 truncate mt-0.5 text-[11px]">{feeBasis.zoneCode || "—"}</p>
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-100">
                                                            <div>
                                                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Location</p>
                                                                <p className="font-semibold text-slate-800 truncate mt-0.5 text-[11px]">
                                                                    {form.barangay ? (form.street_address ? `${form.street_address}, Brgy. ${form.barangay}` : `Brgy. ${form.barangay}`) : "—"}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Property Lots</p>
                                                                <p className="font-mono font-semibold text-slate-800 mt-0.5 text-[11px]">
                                                                    {validParcelsCount > 0 
                                                                        ? `${validParcelsCount} lot(s) (${totalLotArea.toLocaleString()} m²)` 
                                                                        : "—"}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        {currentStep >= STEP.FEES && form.assessment_fee ? (
                                                            <div className="pt-1.5 border-t border-slate-100">
                                                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Assessment Fee</p>
                                                                <p className="font-mono font-bold text-emerald-600 text-xs mt-0.5">₱ {Number(form.assessment_fee).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Footer of Left Panel: 20% per Step Progress */}
                                        <div className="pt-3 border-t border-slate-200/90 mt-3 lg:mt-0 space-y-1.5">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="font-bold text-slate-800 flex items-center gap-1.5 text-[11px]">
                                                    <span className={`w-2 h-2 rounded-full ${workflowProgress === 100 ? "bg-emerald-500" : "bg-blue-600 animate-pulse"}`} />
                                                    Workflow Progress
                                                </span>
                                                <span className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-lg text-[11px] shadow-2xs">
                                                    {workflowProgress}%
                                                </span>
                                            </div>
                                            <div className="w-full h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500 ease-out"
                                                    style={{ width: `${workflowProgress}%` }}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                                                <span>{workflowProgress === 100 ? "Ready for submission" : `${workflowProgress}% completed (Step ${Math.min(5, Math.floor(workflowProgress / 20) + 1)} of 5)`}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── RIGHT PANEL: ACTIVE FORM SURFACE ── */}
                                    <div ref={formRef} className="flex-1 p-5 sm:p-6 lg:p-7 flex flex-col justify-between bg-white overflow-y-auto">
                                        <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-between space-y-4">
                                            
                                            {/* ── STEP 2: APPLICATION (category, purpose, project details) ── */}
                                            {currentStep === STEP.APPLICATION && (
                                                <>
                                                    {varianceNotice && (
                                                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 text-xs text-amber-800">
                                                            <span className="text-sm">⚠️</span>
                                                            <div className="flex-1">
                                                                <p className="font-bold">Zoning check flagged this parcel for variance review</p>
                                                                <p className="text-[11px] text-amber-700 mt-0.5">The requested zoning type did not conform to the barangay's CLUP classification. This filing may require Sangguniang Bayan reclassification or variance approval.</p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => setVarianceNotice(false)}
                                                                className="text-amber-600 hover:text-amber-900 cursor-pointer shrink-0"
                                                                title="Dismiss"
                                                                >
                                                                ✕
                                                            </button>
                                                        </div>
                                                    )}
                                                    <StepCategory
                                                        form={form}
                                                        set={set}
                                                        handleTypeSelect={handleTypeSelect}
                                                        errors={errors}
                                                        APPLICATION_TYPES={APPLICATION_TYPES}
                                                        AMENDMENT_TYPES={AMENDMENT_TYPES}
                                                        LAND_USE_CLASSES={LAND_USE_CLASSES}
                                                        zoningMismatch={hasZoningMismatch(form.parcels)}
                                                        recommendedPetition={recommendedPetition}
                                                        goToProperty={() => setCurrentStep(STEP.PROPERTY)}
                                                        setParcelField={setParcelField}
                                                        handlePinLookup={handlePinLookup}
                                                        pinLoading={pinLoading}
                                                        inspectors={inspectors}
                                                    />
                                                </>
                                            )}

                                            {/* ── STEP 3: APPLICANT PROFILE ── */}
                                            {currentStep === STEP.APPLICANT && (
                                                <StepApplicant
                                                    form={form}
                                                    set={set}
                                                    setForm={setForm}
                                                    handleNameChange={handleNameChange}
                                                    handleContactInput={handleContactInput}
                                                    applicantSuggestion={applicantSuggestion}
                                                    applyApplicantSuggestion={applyApplicantSuggestion}
                                                    setApplicantSuggestion={setApplicantSuggestion}
                                                    errors={errors}
                                                />
                                            )}

                                            {/* ── STEP 4: FEES ── */}
                                            {currentStep === STEP.FEES && (
                                                <StepFee
                                                    form={form}
                                                    set={set}
                                                    feeSuggestion={feeSuggestion}
                                                    applySuggestedFees={applySuggestedFees}
                                                    errors={errors}
                                                />
                                            )}

                                            {/* ── STEP 5: REVIEW & SUBMIT ── */}
                                            {currentStep === STEP.REVIEW && (
                                                <StepReview
                                                    form={form}
                                                    set={set}
                                                    errors={errors}
                                                    totalLotArea={totalLotArea}
                                                    setCurrentStep={setCurrentStep}
                                                    STEP={STEP}
                                                    onPrintSiteMap={() => setSiteMapOpen(true)}
                                                />
                                            )}

                                            {/* ── STEP NAVIGATION CONTROLS ── */}
                                            <div className="pt-6 border-t border-slate-100 flex items-center justify-between gap-3 mt-auto">
                                                {currentStep > STEP.PROPERTY ? (
                                                    <button
                                                        type="button"
                                                        onClick={handleBack}
                                                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-all active:scale-98 cursor-pointer"
                                                    >
                                                        <span>Back</span>
                                                    </button>
                                                ) : <div />}

                                                {currentStep < STEP.REVIEW ? (
                                                    <button
                                                        key="next-btn"
                                                        type="button"
                                                        onClick={handleNext}
                                                        className="inline-flex items-center justify-center min-w-[100px] gap-2 px-6 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-98 cursor-pointer ml-auto"
                                                    >
                                                        <span>Next</span>
                                                    </button>
                                                ) : (
                                                    <button
                                                        key="submit-btn"
                                                        type="submit"
                                                        disabled={submitting}
                                                        className="inline-flex items-center justify-center min-w-[120px] gap-2 px-6 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ml-auto"
                                                    >
                                                        {submitting ? (
                                                            <>
                                                                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
                                                                <span>Submitting...</span>
                                                            </>
                                                        ) : (
                                                            <span>Submit Application</span>
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        </form>
                                    </div>
                                </>
                            )}
                        </div>
                    </main>
                </div>
            </div>

            <SiteMapPrint
                open={siteMapOpen}
                onClose={() => setSiteMapOpen(false)}
                form={form}
                parcelMapData={parcelMapData}
                preparedBy={userName}
            />
        </>
    );
}
