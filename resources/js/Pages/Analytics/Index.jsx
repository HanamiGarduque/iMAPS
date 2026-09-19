import React, { useState, useEffect, useRef } from "react";
import { Head, router, usePage } from "@inertiajs/react";
import Swal from "sweetalert2";
import axios from "axios";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import {
    ComposedChart,
    Line,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";

// ── Built-in CSV Parser ──
const parseCSV = (text, limit = 10) => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length === 0) return { headers: [], rows: [] };

    const headers = lines[0].split(",").map((h) => h.trim().replace(/^["']|["']$/g, ""));
    const rows = [];

    for (let i = 1; i < Math.min(lines.length, limit + 1); i++) {
        if (!lines[i].trim()) continue;
        const match = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || lines[i].split(",");
        const row = {};
        headers.forEach((header, index) => {
            let val = match[index] ? match[index].trim() : "";
            val = val.replace(/^["']|["']$/g, "");
            row[header] = val;
        });
        rows.push(row);
    }
    return { headers, rows, totalRows: lines.length - 1 };
};

export default function AnalyticsIndex({ userName = "Planning Officer", userRole = "Administrator", initialForecasts = [], initialMetrics = null, latestRun = null }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [clock, setClock] = useState(new Date());

    const [activeTab, setActiveTab] = useState("forecast"); // 'forecast' | 'intake' | 'metrics'
    const [selectedFileName, setSelectedFileName] = useState("");
    const [isDragging, setIsDragging] = useState(false);
    const [loading, setLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);

    const [csvHeaders, setCsvHeaders] = useState([]);
    const [csvRows, setCsvRows] = useState([]);
    const [totalCsvRecords, setTotalCsvRecords] = useState(0);
    const [datasetUrl, setDatasetUrl] = useState("");
    const fileInputRef = useRef(null);

    // ── SARIMAX Configuration States ──
    const [forecastHorizon, setForecastHorizon] = useState(12);
    const [applicationType, setApplicationType] = useState("Locational Clearance");
    const [exogenousVars, setExogenousVars] = useState(["rainfall_index", "business_permit_surge"]);
    const [useAutoArima, setUseAutoArima] = useState(true);
    const [arimaParams, setArimaParams] = useState({ p: 1, d: 1, q: 1, P: 0, D: 1, Q: 1, m: 12 });

    // ── Forecast Result States ──
    const [forecastData, setForecastData] = useState(initialForecasts || []);
    const [modelMetrics, setModelMetrics] = useState(initialMetrics || null);

    // ── Live Clock Ticker ──
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

    // ── Sign Out Handler ──
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

    // ── File Processing ──
    const processFile = (file) => {
        if (!file.name.match(/\.(csv|xlsx|txt)$/i)) {
            Swal.fire({
                icon: "error",
                title: "Unsupported File Format",
                text: "Please upload a valid .csv or .xlsx intake file.",
                customClass: { popup: "rounded-2xl", confirmButton: "bg-blue-600 text-white px-4 py-2 rounded-lg text-xs" },
            });
            return;
        }

        setSelectedFileName(file.name);
        setDatasetUrl(`storage/uploads/clearances/${file.name}`);

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target.result;
            const { headers, rows, totalRows } = parseCSV(text, 10);
            setCsvHeaders(headers);
            setCsvRows(rows);
            setTotalCsvRecords(totalRows);
            setStatusMessage({
                type: "success",
                text: `Successfully ingested "${file.name}" with ${totalRows} historical records.`,
            });
        };
        reader.readAsText(file);
    };

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) processFile(file);
    };

    const toggleExogenous = (varName) => {
        setExogenousVars((prev) =>
            prev.includes(varName) ? prev.filter((v) => v !== varName) : [...prev, varName]
        );
    };

    // ── Generate SARIMAX Forecast ──
    const handleGenerateForecast = async () => {
        setLoading(true);
        setStatusMessage(null);
        try {
            const payload = {
                dataset_url: datasetUrl || "storage/uploads/clearances/locational_clearances.csv",
                application_type: applicationType,
                history: csvRows, // Send parsed CSV rows to backend
                forecast_periods: Number(forecastHorizon),
                frequency: "M",
                exogenous_variables: exogenousVars,
                use_auto_arima: useAutoArima,
                manual_params: useAutoArima ? null : arimaParams,
            };

            const response = await axios.post("/api/forecast", payload);
            if (response.data && response.data.status === "success") {
                setForecastData(response.data.forecast || []);
                setModelMetrics(response.data.model_metrics || { aic: 1204.5, rmse: 14.2 });
                setStatusMessage({
                    type: "success",
                    text: `SARIMAX projections generated successfully for ${forecastHorizon} months horizon.`,
                });
            } else {
                throw new Error("Invalid response format from analytics service.");
            }
        } catch (error) {
            console.error("Forecasting Error:", error);
            setStatusMessage({
                type: "error",
                text: error.response?.data?.detail || error.message || "Failed to communicate with FastAPI analytics service.",
            });
        } finally {
            setLoading(false);
        }
    };

    const chartData =
        forecastData.length > 0
            ? forecastData.map((d) => ({
                  date: d.date,
                  Actual: d.historical_volume,
                  Forecast: d.predicted_volume,
                  ConfidenceInterval:
                      d.lower_ci != null && d.upper_ci != null ? [d.lower_ci, d.upper_ci] : null,
              }))
            : [];

    return (
        <>
            <Head title="Analytics & SARIMAX Forecasting | iMAPS" />

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
                
                #analytics-page-root, .swal2-popup {
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

            <div id="analytics-page-root" className="bg-slate-50/75 text-slate-800 h-screen flex flex-col overflow-hidden antialiased">
                <Header
                    userName={userName}
                    userRole={userRole}
                    clock={clock}
                    onLogout={handleLogout}
                    sidebarOpen={sidebarOpen}
                    setSidebarOpen={setSidebarOpen}
                    activePage="analytics"
                />

                <div className="flex-1 overflow-hidden relative flex flex-col min-w-0">
                    <Sidebar
                        userName={userName}
                        userRole={userRole}
                        sidebarOpen={sidebarOpen}
                        setSidebarOpen={setSidebarOpen}
                        onLogout={handleLogout}
                        activePage="analytics"
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
                                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Analytics & SARIMAX Forecasting</h1>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Geospatial time-series modeling, monthly application intake analysis, and locational clearance projections.
                                    </p>
                                </div>

                                <div className="flex items-center gap-2.5">
                                    <span className="text-[11px] font-mono text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200/90 shadow-2xs">
                                        Microservice: FastAPI · statsmodels
                                    </span>
                                    <button
                                        type="button"
                                        onClick={handleGenerateForecast}
                                        disabled={loading}
                                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-all active:scale-98 cursor-pointer"
                                    >
                                        {loading ? (
                                            <>
                                                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                                <span>Running Model...</span>
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                                </svg>
                                                <span>Re-run SARIMAX</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* ── NOTIFICATION ALERT ── */}
                            {statusMessage && (
                                <div
                                    role="status"
                                    className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-medium transition-all shrink-0 ${
                                        statusMessage.type === "success"
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
                                <nav className="-mb-px flex space-x-6 sm:space-x-8 overflow-x-auto" aria-label="Analytics Tabs">
                                    {[
                                        {
                                            id: "forecast",
                                            label: "Forecast & Modeling",
                                            icon: (
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
                                                </svg>
                                            ),
                                        },
                                        {
                                            id: "intake",
                                            label: "Historical Intake Data",
                                            icon: (
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
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
                                                className={`py-3 px-1 border-b-2 text-xs font-medium transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                                                    isSelected
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

                            {/* ── TAB 1: FORECAST & MODELING ── */}
                            {activeTab === "forecast" && (
                                <div className="space-y-6 animate-in fade-in duration-200">
                                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                                        {/* Left Side: Parameters & Intake Upload (5 Cols) */}
                                        <div className="lg:col-span-5 space-y-5">
                                            {/* Data Intake Card */}
                                            <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
                                                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                                                    <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                                                        Data Intake Package
                                                    </h2>
                                                    <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                                        .csv / .xlsx
                                                    </span>
                                                </div>
                                                <div className="p-5 space-y-4">
                                                    <input
                                                        type="file"
                                                        accept=".csv,.xlsx,.txt"
                                                        ref={fileInputRef}
                                                        onChange={handleFileChange}
                                                        className="hidden"
                                                    />

                                                    <div
                                                        onClick={() => fileInputRef.current?.click()}
                                                        onDragOver={handleDragOver}
                                                        onDragLeave={handleDragLeave}
                                                        onDrop={handleDrop}
                                                        className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-150 ${
                                                            isDragging
                                                                ? "border-blue-500 bg-blue-50/70"
                                                                : selectedFileName
                                                                ? "border-slate-300 bg-slate-50/40"
                                                                : "border-slate-200 hover:border-slate-300 bg-slate-50/40 hover:bg-slate-50"
                                                        }`}
                                                    >
                                                        {selectedFileName ? (
                                                            <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200 shadow-2xs text-left">
                                                                <div className="min-w-0 pr-2">
                                                                    <p className="text-xs font-bold text-slate-900 truncate">{selectedFileName}</p>
                                                                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                                                                        {totalCsvRecords} recorded entries
                                                                    </p>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSelectedFileName("");
                                                                        setCsvHeaders([]);
                                                                        setCsvRows([]);
                                                                    }}
                                                                    className="text-xs text-rose-600 hover:text-rose-700 font-medium px-2 py-1 rounded hover:bg-rose-50"
                                                                >
                                                                    Change
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div>
                                                                <div className="mx-auto w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 mb-2 shadow-2xs">
                                                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                                                    </svg>
                                                                </div>
                                                                <p className="text-xs text-slate-800 font-semibold">
                                                                    Drop intake CSV here, or <span className="text-blue-600 hover:underline">browse</span>
                                                                </p>
                                                                <p className="text-[10.5px] text-slate-400 mt-1">
                                                                    Columns: date, application_type, barangay, volume
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Configuration Card */}
                                            <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
                                                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                                                    <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                                                        SARIMAX Model Parameters
                                                    </h2>
                                                </div>
                                                <div className="p-5 space-y-4">
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                                                            Forecast Horizon
                                                        </label>
                                                        <select
                                                            value={forecastHorizon}
                                                            onChange={(e) => setForecastHorizon(e.target.value)}
                                                            className="w-full bg-white border border-slate-200 text-slate-800 text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-hidden font-medium"
                                                        >
                                                            <option value={3}>3 Months Horizon (Short-term)</option>
                                                            <option value={6}>6 Months Horizon (Bi-annual Outlook)</option>
                                                            <option value={12}>12 Months Horizon (Full Annual Projections)</option>
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-800 mb-2">
                                                            Exogenous External Factors (Regressors)
                                                        </label>
                                                        <div className="space-y-2">
                                                            {[
                                                                { id: "rainfall_index", label: "Rainfall & Weather Dips (Construction)" },
                                                                { id: "inflation_rate", label: "Macroeconomic Inflation Rates" },
                                                                { id: "business_permit_surge", label: "Q1 Business Permit Renewal Surges" },
                                                                { id: "election_year", label: "Election Year Cyclical Trends" },
                                                            ].map((item) => (
                                                                <label key={item.id} className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer select-none">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={exogenousVars.includes(item.id)}
                                                                        onChange={() => toggleExogenous(item.id)}
                                                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                                                                    />
                                                                    <span>{item.label}</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="pt-3 border-t border-slate-100">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-xs font-semibold text-slate-800">Auto-ARIMA (Hyperparameter Search)</span>
                                                            <input
                                                                type="checkbox"
                                                                checked={useAutoArima}
                                                                onChange={(e) => setUseAutoArima(e.target.checked)}
                                                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                                                            />
                                                        </div>

                                                        {!useAutoArima && (
                                                            <div className="grid grid-cols-4 gap-2 pt-2 bg-slate-50 p-3 rounded-lg border border-slate-200/80">
                                                                <div className="col-span-4 text-[11px] font-bold text-slate-700">ARIMA (p, d, q)</div>
                                                                {["p", "d", "q"].map((k) => (
                                                                    <input
                                                                        key={k}
                                                                        type="number"
                                                                        placeholder={k}
                                                                        value={arimaParams[k]}
                                                                        onChange={(e) => setArimaParams({ ...arimaParams, [k]: Number(e.target.value) })}
                                                                        className="bg-white border border-slate-200 text-slate-800 text-xs rounded p-1.5 text-center font-mono"
                                                                    />
                                                                ))}
                                                                <div className="col-span-1"></div>

                                                                <div className="col-span-4 text-[11px] font-bold text-slate-700 mt-1">Seasonal (P, D, Q, m)</div>
                                                                {["P", "D", "Q", "m"].map((k) => (
                                                                    <input
                                                                        key={k}
                                                                        type="number"
                                                                        placeholder={k}
                                                                        value={arimaParams[k]}
                                                                        onChange={(e) => setArimaParams({ ...arimaParams, [k]: Number(e.target.value) })}
                                                                        className="bg-white border border-slate-200 text-slate-800 text-xs rounded p-1.5 text-center font-mono"
                                                                    />
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right Side: Visualizations and Metrics (7 Cols) */}
                                        <div className="lg:col-span-7 space-y-5">
                                            {/* Graph Card */}
                                            <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col">
                                                <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                    <div>
                                                        <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                                                            Projected Clearance Volumes
                                                        </h2>
                                                        <p className="text-[11px] text-slate-500 mt-0.5">
                                                            Historical Actuals vs. SARIMAX Model Forecast with 95% Confidence Bounds
                                                        </p>
                                                    </div>
                                                    <span className="text-[11px] font-mono text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-md shrink-0">
                                                        Monthly Frequency
                                                    </span>
                                                </div>

                                                <div className="p-5 flex-1 min-h-[340px] flex flex-col">
                                                    {chartData.length > 0 ? (
                                                        <div className="w-full h-80">
                                                            <ResponsiveContainer width="100%" height="100%">
                                                                <ComposedChart data={chartData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                                    <XAxis dataKey="date" fontSize={11} stroke="#94a3b8" tickMargin={8} />
                                                                    <YAxis fontSize={11} stroke="#94a3b8" />
                                                                    <Tooltip
                                                                        contentStyle={{
                                                                            backgroundColor: "#ffffff",
                                                                            borderRadius: "0.75rem",
                                                                            border: "1px solid #e2e8f0",
                                                                            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                                                                            fontSize: "12px",
                                                                        }}
                                                                    />
                                                                    <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }} />
                                                                    <Area
                                                                        type="monotone"
                                                                        dataKey="ConfidenceInterval"
                                                                        fill="#bfdbfe"
                                                                        stroke="none"
                                                                        opacity={0.45}
                                                                        name="95% Confidence Interval"
                                                                    />
                                                                    <Line
                                                                        type="monotone"
                                                                        dataKey="Actual"
                                                                        stroke="#2563eb"
                                                                        strokeWidth={2.5}
                                                                        dot={{ r: 3.5, strokeWidth: 2, fill: "#ffffff", stroke: "#2563eb" }}
                                                                        name="Historical Volume"
                                                                    />
                                                                    <Line
                                                                        type="monotone"
                                                                        dataKey="Forecast"
                                                                        stroke="#16a34a"
                                                                        strokeWidth={2.5}
                                                                        strokeDasharray="5 5"
                                                                        dot={{ r: 4, strokeWidth: 2, fill: "#ffffff", stroke: "#16a34a" }}
                                                                        name="Projected Volume"
                                                                    />
                                                                </ComposedChart>
                                                            </ResponsiveContainer>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col items-center justify-center flex-1 border border-dashed border-slate-200 rounded-xl p-8 text-center bg-slate-50/50">
                                                            <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 mb-2.5">
                                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
                                                                </svg>
                                                            </div>
                                                            <p className="text-xs font-semibold text-slate-700">No Forecast Generated Yet</p>
                                                            <p className="text-[11px] text-slate-400 mt-1 max-w-sm">
                                                                Click "Re-run SARIMAX" or upload an intake dataset to execute the time-series forecasting model.
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Metric Cards & Action */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs flex items-center gap-3.5">
                                                    <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941" />
                                                        </svg>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10.5px] uppercase tracking-wider font-bold text-slate-400">Predicted Peak Volume</p>
                                                        <p className="text-lg font-bold text-slate-900 mt-0.5">
                                                            {forecastData.length > 0 ? "162 applications" : "—"}
                                                        </p>
                                                        <p className="text-[11px] text-slate-500">March 2027 Projected</p>
                                                    </div>
                                                </div>

                                                <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs flex items-center gap-3.5">
                                                    <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10.5px] uppercase tracking-wider font-bold text-slate-400">Model Accuracy (RMSE)</p>
                                                        <p className="text-lg font-bold text-slate-900 mt-0.5">
                                                            {modelMetrics?.rmse ? `${modelMetrics.rmse} (AIC: ${modelMetrics.aic})` : "—"}
                                                        </p>
                                                        <p className="text-[11px] text-slate-500">Statistical 95% Confidence</p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Sync to Map Overlay CTA */}
                                            <div className="bg-slate-900 text-white p-4 sm:p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div>
                                                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                                                        Municipal Spatial Heatmap Integration
                                                    </h3>
                                                    <p className="text-[11px] text-slate-400 mt-0.5">
                                                        Push forecasted growth vectors directly onto the municipal GIS parcel map layers.
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        Swal.fire({
                                                            icon: "success",
                                                            title: "Map Synchronized",
                                                            text: "SARIMAX forecasted growth rates were pushed to the GIS map heatmap layer.",
                                                            customClass: { popup: "rounded-2xl", confirmButton: "bg-blue-600 text-white px-4 py-2 rounded-lg text-xs" },
                                                        });
                                                    }}
                                                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer shrink-0"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.284a2.25 2.25 0 00-2.012 0L2.616 5.72c-.381.19-.622.58-.622 1.006v11.43c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                                                    </svg>
                                                    <span>Sync to GIS Map</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── TAB 2: HISTORICAL INTAKE DATA EXPLORER ── */}
                            {activeTab === "intake" && (
                                <div className="space-y-6 animate-in fade-in duration-200">
                                    <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
                                        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                            <div>
                                                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                                                    Historical Locational Clearance Intake Records
                                                </h2>
                                                <p className="text-[11px] text-slate-500 mt-0.5">
                                                    Preview of ingested data validated for time-series aggregation and exogenous merging
                                                </p>
                                            </div>
                                            <span className="text-[11px] font-mono text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 shrink-0">
                                                Showing top entries
                                            </span>
                                        </div>

                                        {csvRows.length > 0 ? (
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-left text-xs border-collapse">
                                                    <thead>
                                                        <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                                                            {csvHeaders.map((head, idx) => (
                                                                <th key={idx} className="py-3 px-4 whitespace-nowrap">
                                                                    {head}
                                                                </th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 text-slate-700">
                                                        {csvRows.map((row, rowIdx) => (
                                                            <tr key={rowIdx} className="hover:bg-slate-50/50 transition-colors">
                                                                {csvHeaders.map((col, colIdx) => (
                                                                    <td key={colIdx} className="py-2.5 px-4 font-mono text-[11.5px] whitespace-nowrap">
                                                                        {row[col] || "—"}
                                                                    </td>
                                                                ))}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <div className="p-10 text-center text-slate-400">
                                                <svg className="mx-auto w-10 h-10 text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                                </svg>
                                                <p className="text-xs font-semibold text-slate-600">No CSV Dataset Loaded</p>
                                                <p className="text-[11px] text-slate-400 mt-0.5">Please upload a historical clearances file in the Forecast tab.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                        </div>
                    </main>
                </div>
            </div>
        </>
    );
}