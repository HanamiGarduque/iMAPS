import React, { useState, useEffect } from "react";
import { Head, router, useForm, usePage } from "@inertiajs/react";
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
    ReferenceLine,
} from "recharts";

// ── Friendly metric definitions for government users ──
const METRIC_DEFINITIONS = [
    {
        key: "mae",
        label: "Average Deviation",
        short: "MAE",
        description: "On average, the forecast differs from actual application counts by this many applications.",
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
            </svg>
        ),
        color: "blue",
        unit: "applications",
        lowerIsBetter: true,
    },
    {
        key: "mse",
        label: "Squared Error",
        short: "MSE",
        description: "A technical measure that penalizes large prediction errors more heavily. Used internally to train the model.",
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm2.498-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zM8.25 6h7.5v2.25h-7.5V6zM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 002.25 2.25h10.5a2.25 2.25 0 002.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0012 2.25z" />
            </svg>
        ),
        color: "amber",
        unit: "apps²",
        lowerIsBetter: true,
    },
    {
        key: "rmse",
        label: "Forecast Accuracy",
        short: "RMSE",
        description: "The typical margin of error in the forecast, in the same unit as application counts. A lower number means the forecast is more reliable.",
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        ),
        color: "emerald",
        unit: "applications",
        lowerIsBetter: true,
    },
    {
        key: "mape",
        label: "Error Rate",
        short: "MAPE",
        description: "The average percentage by which the forecast misses the actual count. For example, a 10% error rate means the forecast is off by 10 out of every 100 applications.",
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941" />
            </svg>
        ),
        color: "violet",
        unit: "%",
        lowerIsBetter: true,
    },
    {
        key: "mase",
        label: "vs. Simple Estimate",
        short: "MASE",
        description: "Compares this model against a basic guess (using last month's count). A score below 1.0 means the model outperforms a simple estimate. Below 1.0 is good.",
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
            </svg>
        ),
        color: "rose",
        unit: "",
        lowerIsBetter: true,
    },
];

const COLOR_MAP = {
    blue: { bg: "bg-blue-50", border: "border-blue-100", text: "text-blue-600", badge: "bg-blue-100 text-blue-700" },
    amber: { bg: "bg-amber-50", border: "border-amber-100", text: "text-amber-600", badge: "bg-amber-100 text-amber-700" },
    emerald: { bg: "bg-emerald-50", border: "border-emerald-100", text: "text-emerald-600", badge: "bg-emerald-100 text-emerald-700" },
    violet: { bg: "bg-violet-50", border: "border-violet-100", text: "text-violet-600", badge: "bg-violet-100 text-violet-700" },
    rose: { bg: "bg-rose-50", border: "border-rose-100", text: "text-rose-600", badge: "bg-rose-100 text-rose-700" },
};

const PAGE_SIZE = 12;

// ── Custom Tooltip ──
const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        const dateObj = new Date(label);
        const formattedDate = isNaN(dateObj)
            ? label
            : dateObj.toLocaleDateString("en-US", { month: "long", year: "numeric" });

        return (
            <div className="bg-white border border-slate-200/80 shadow-xl rounded-xl p-3.5 min-w-[190px] font-sans z-50">
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-2.5 border-b border-slate-100 pb-2">
                    {formattedDate}
                </p>
                <div className="space-y-2">
                    {payload.map((entry, index) => {
                        const isCI = entry.name === "95% Confidence Band";
                        return (
                            <div key={index} className="flex items-center justify-between gap-4 text-xs">
                                <div className="flex items-center gap-2">
                                    <div
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: isCI ? "#bfdbfe" : (entry.color || "#cbd5e1") }}
                                    />
                                    <span className="text-slate-600 font-medium">
                                        {isCI ? "95% Bounds" : entry.name}
                                    </span>
                                </div>
                                <span className="text-slate-900 font-bold font-mono">
                                    {Array.isArray(entry.value)
                                        ? `${Math.round(entry.value[0])}–${Math.round(entry.value[1])}`
                                        : entry.value != null ? Math.round(entry.value) : "—"}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }
    return null;
};

export default function AnalyticsIndex({ auth = {}, initialForecasts = [], initialMetrics = null }) {
    const userName = auth?.user?.name || "Planning Officer";
    const userRole = auth?.user?.role || "Administrator";

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [clock, setClock] = useState("");
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState("forecasting");

    // ── Forecast Result States ──
    const [forecastData, setForecastData] = useState(initialForecasts || []);
    const [modelMetrics, setModelMetrics] = useState(initialMetrics || null);

    // ── Chart pagination ──
    const [chartPage, setChartPage] = useState(0);

    const { props } = usePage();
    const { data, setData, post, processing, errors } = useForm({
        cpi_file: null,
    });
    
    const handleCpiUpload = (e) => {
        e.preventDefault();
        console.log("Upload button clicked. Sending file:", data.cpi_file);
        post('/api/analytics/upload-cpi', {
            onSuccess: () => {
                Swal.fire({
                    icon: 'success',
                    title: 'CPI Data Updated',
                    text: 'The latest CPI Excel file has been securely uploaded.',
                    confirmButtonColor: '#2563eb'
                });
                setData('cpi_file', null);
                document.getElementById('cpi-file-upload').value = '';
                // Refresh forecast data if needed, or user can click generate
                handleGenerateForecast();
            },
            onError: (err) => {
                Swal.fire({
                    icon: 'error',
                    title: 'Upload Failed',
                    text: err.cpi_file || err.error || 'Something went wrong uploading the file.',
                    confirmButtonColor: '#e53e3e'
                });
            }
        });
    };


    // ── Live Clock ──
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

    // ── Sign Out ──
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
                confirmButton: "inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer",
                cancelButton: "inline-flex items-center justify-center px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-colors cursor-pointer",
            },
        }).then((result) => {
            if (result.isConfirmed) {
                sessionStorage.removeItem("hasShownWelcome");
                router.post("/logout");
            }
        });
    };

    // ── Auto-Generate Forecast on Load ──
    useEffect(() => {
        if (!forecastData || forecastData.length === 0) {
            handleGenerateForecast();
        }
    }, []);

    // ── Generate Forecast ──
    const handleGenerateForecast = async () => {
        setLoading(true);
        try {
            const payload = {
                application_type: "Locational Clearance",
                forecast_periods: 6,
                frequency: "M",
                exogenous_variables: ["rainfall_index", "inflation_rate"],
                use_auto_arima: true,
                manual_params: null,
            };
            const response = await axios.post("/api/forecast", payload);
            if (response.data && response.data.status === "success") {
                setForecastData(response.data.forecast || []);
                setModelMetrics(response.data.model_metrics || null);
                setChartPage(0);
            }
        } catch (error) {
            console.error("Forecasting Error:", error);
        } finally {
            setLoading(false);
        }
    };

    // ── Chart data with pagination ──
    const allChartData = forecastData.map((d) => ({
        date: d.date,
        Actual: d.historical_volume,
        Forecast: d.predicted_volume,
        ConfidenceInterval:
            d.lower_ci != null && d.upper_ci != null ? [d.lower_ci, d.upper_ci] : null,
    }));

    // Find where forecast starts (for reference line)
    const forecastStartIndex = allChartData.findIndex(
        (d) => d.Forecast != null && d.Actual == null
    );
    const forecastStartDate =
        forecastStartIndex >= 0 ? allChartData[forecastStartIndex]?.date : null;

    const totalPages = Math.ceil(allChartData.length / PAGE_SIZE);
    const endIndex = allChartData.length - (chartPage * PAGE_SIZE);
    const startIndex = Math.max(0, endIndex - PAGE_SIZE);
    const pagedData = allChartData.slice(startIndex, endIndex);

    // ── Last forecast value (end of forecast range) ──
    const lastForecast = [...forecastData].reverse().find((d) => d.predicted_volume != null);
    const lastForecastDate = lastForecast?.date
        ? new Date(lastForecast.date).toLocaleDateString("en-PH", { month: "long", year: "numeric" })
        : "—";

    // ── Metric badge label ──
    const getMASELabel = (val) => {
        if (val == null) return null;
        if (val < 0.8) return { text: "Excellent", color: "emerald" };
        if (val < 1.0) return { text: "Good", color: "blue" };
        if (val < 1.5) return { text: "Fair", color: "amber" };
        return { text: "Poor", color: "rose" };
    };

    const getMAPELabel = (val) => {
        if (val == null) return null;
        if (val < 10) return { text: "Highly Accurate", color: "emerald" };
        if (val < 20) return { text: "Acceptable", color: "blue" };
        if (val < 30) return { text: "Moderate", color: "amber" };
        return { text: "Low Accuracy", color: "rose" };
    };

    return (
        <>
            <Head title="Reports & Forecasting | iMAPS" />

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
                #analytics-page-root, .swal2-popup {
                    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                }
                .font-mono { font-family: 'JetBrains Mono', monospace !important; }
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
                    activePage="reports-and-forecasting"
                />

                <div className="flex-1 overflow-hidden relative flex flex-col min-w-0">
                    <Sidebar
                        userName={userName}
                        userRole={userRole}
                        sidebarOpen={sidebarOpen}
                        setSidebarOpen={setSidebarOpen}
                        onLogout={handleLogout}
                        activePage="reports-and-forecasting"
                    />

                    {sidebarOpen && (
                        <div
                            onClick={() => setSidebarOpen(false)}
                            className="absolute inset-0 bg-slate-900/20 backdrop-blur-xs z-[750] transition-opacity duration-200"
                        />
                    )}

                    <main className="flex-1 w-full h-full flex flex-col overflow-hidden">
                        <div className="p-6 sm:p-8 flex-1 flex flex-col h-full overflow-y-auto max-w-6xl mx-auto w-full gap-6">

                            {/* ── PAGE HEADER ── */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 shrink-0">
                                <div>
                                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Reports & Forecasting</h1>
                                    <p className="text-xs text-slate-500 mt-1">
                                        SARIMAX time-series model · Locational Clearance applications · Monthly frequency
                                    </p>
                                </div>
                                {loading && (
                                    <div className="flex items-center gap-2 text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-xs">
                                        <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin shrink-0" />
                                        <span>Running forecast model…</span>
                                    </div>
                                )}
                            </div>

                            
                            {/* ── TAB NAVIGATION ── */}
                            <div className="border-b border-slate-200/80 shrink-0">
                                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                                    <button
                                        onClick={() => setActiveTab("reports")}
                                        className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-xs transition-colors ${
                                            activeTab === "reports"
                                                ? "border-blue-600 text-blue-600"
                                                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            Standard Reports
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => setActiveTab("forecasting")}
                                        className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-xs transition-colors ${
                                            activeTab === "forecasting"
                                                ? "border-blue-600 text-blue-600"
                                                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13h2.626c.825 0 1.549-.54 1.76-1.334l.872-3.266A2 2 0 0110.198 7h3.604a2 2 0 011.94 1.4l.872 3.266c.21.794.935 1.334 1.76 1.334H21M7 21h10M12 17v4" />
                                            </svg>
                                            SARIMAX Forecasting
                                        </div>
                                    </button>
                                </nav>
                            </div>


                            {/* ── REPORTS TAB ── */}
                            {activeTab === "reports" && (
                                <div className="animate-in fade-in duration-300">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                        {[
                                            {
                                                title: "Monthly Clearances",
                                                desc: "Summary of locational clearances issued per month, categorized by barangay.",
                                                icon: (
                                                    <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                    </svg>
                                                ),
                                                bg: "bg-blue-50"
                                            },
                                            {
                                                title: "Zoning Classifications",
                                                desc: "Distribution of approved applications across different zoning classifications (residential, commercial, etc).",
                                                icon: (
                                                    <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                                                    </svg>
                                                ),
                                                bg: "bg-emerald-50"
                                            },
                                            {
                                                title: "Annual Revenue Estimate",
                                                desc: "Projected vs actual fees collected from zoning and locational clearance applications.",
                                                icon: (
                                                    <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                ),
                                                bg: "bg-amber-50"
                                            }
                                        ].map((report, i) => (
                                            <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col h-full hover:shadow-md transition-shadow">
                                                <div className={`w-10 h-10 rounded-lg ${report.bg} flex items-center justify-center mb-4`}>
                                                    {report.icon}
                                                </div>
                                                <h3 className="text-sm font-bold text-slate-900">{report.title}</h3>
                                                <p className="text-xs text-slate-500 mt-2 flex-1 leading-relaxed">{report.desc}</p>
                                                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                                                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">PDF / Excel</span>
                                                    <button className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                                                        Generate
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ── FORECASTING TAB ── */}
                            {activeTab === "forecasting" && (
                                <div className="space-y-6 animate-in fade-in duration-300">
                                    {/* ── CHART CARD ── */}
                            <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col shrink-0">
                                {/* Card Header */}
                                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                                            Projected Application Volume
                                        </h2>
                                        <p className="text-[11px] text-slate-500 mt-0.5">
                                            Historical actuals (blue) vs. 6-month forecast (green) with 95% confidence band
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button 
                                            onClick={handleGenerateForecast}
                                            disabled={loading}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-700 hover:bg-blue-100 hover:border-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-xs mr-2"
                                        >
                                            {loading ? (
                                                <span className="w-3.5 h-3.5 border-2 border-blue-700/30 border-t-blue-700 rounded-full animate-spin" />
                                            ) : (
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                </svg>
                                            )}
                                            Re-run Forecast (Last 60 Mos)
                                        </button>
                                        <span className="text-[11px] font-mono text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-md">
                                            Monthly
                                        </span>
                                        {forecastStartDate && (
                                            <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                                                Forecast from {new Date(forecastStartDate).toLocaleDateString("en-PH", { month: "short", year: "numeric" })}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Chart */}
                                <div className="p-5 min-h-[340px] flex flex-col gap-4">
                                    {allChartData.length > 0 ? (
                                        <>
                                            <div className="w-full h-72">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <ComposedChart data={pagedData} margin={{ top: 20, right: 20, left: -10, bottom: 10 }}>
                                                        <defs>
                                                            <linearGradient id="ciGrad" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.12} />
                                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                                                            </linearGradient>
                                                        </defs>
                                                        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" opacity={0.7} />
                                                        <XAxis
                                                            dataKey="date"
                                                            fontSize={11}
                                                            stroke="#94a3b8"
                                                            tickMargin={10}
                                                            axisLine={false}
                                                            tickLine={false}
                                                            tickFormatter={(val) => {
                                                                const d = new Date(val);
                                                                return isNaN(d) ? val : d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
                                                            }}
                                                        />
                                                        <YAxis
                                                            fontSize={11}
                                                            stroke="#94a3b8"
                                                            axisLine={false}
                                                            tickLine={false}
                                                            tickMargin={8}
                                                        />
                                                        <Tooltip
                                                            content={<CustomTooltip />}
                                                            cursor={{ stroke: "#94a3b8", strokeWidth: 1, strokeDasharray: "4 4" }}
                                                        />
                                                        <Legend
                                                            verticalAlign="top"
                                                            height={36}
                                                            iconType="circle"
                                                            wrapperStyle={{ fontSize: "11px", color: "#475569", fontWeight: 600 }}
                                                        />
                                                        {/* Reference line at forecast start */}
                                                        {forecastStartDate && pagedData.some(d => d.date === forecastStartDate) && (
                                                            <ReferenceLine
                                                                x={forecastStartDate}
                                                                stroke="#10b981"
                                                                strokeDasharray="5 3"
                                                                strokeWidth={1.5}
                                                                label={{
                                                                    value: "Forecast →",
                                                                    position: "insideTopRight",
                                                                    fontSize: 10,
                                                                    fill: "#10b981",
                                                                    fontWeight: 600,
                                                                    dy: -4,
                                                                }}
                                                            />
                                                        )}
                                                        <Area
                                                            type="monotone"
                                                            dataKey="ConfidenceInterval"
                                                            fill="url(#ciGrad)"
                                                            stroke="none"
                                                            name="95% Confidence Band"
                                                            animationDuration={1200}
                                                        />
                                                        <Line
                                                            type="monotone"
                                                            dataKey="Actual"
                                                            stroke="#2563eb"
                                                            strokeWidth={2.5}
                                                            dot={{ r: 3, strokeWidth: 1.5, fill: "#ffffff", stroke: "#2563eb" }}
                                                            activeDot={{ r: 6, fill: "#2563eb", stroke: "#ffffff", strokeWidth: 2 }}
                                                            name="Historical Volume"
                                                            animationDuration={1200}
                                                            connectNulls={false}
                                                        />
                                                        <Line
                                                            type="monotone"
                                                            dataKey="Forecast"
                                                            stroke="#10b981"
                                                            strokeWidth={2.5}
                                                            strokeDasharray="7 4"
                                                            dot={{ r: 3.5, strokeWidth: 1.5, fill: "#ffffff", stroke: "#10b981" }}
                                                            activeDot={{ r: 6, fill: "#10b981", stroke: "#ffffff", strokeWidth: 2 }}
                                                            name="Projected Volume"
                                                            animationDuration={1200}
                                                            connectNulls={false}
                                                        />
                                                    </ComposedChart>
                                                </ResponsiveContainer>
                                            </div>

                                            {/* Pagination controls */}
                                            {totalPages > 1 && (
                                                <div className="flex items-center justify-between px-1 pt-1 border-t border-slate-100">
                                                    <p className="text-[11px] text-slate-400 font-mono">
                                                        Showing records {startIndex + 1}–{endIndex} of {allChartData.length} (Oldest to Newest)
                                                    </p>
                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => setChartPage((p) => Math.min(totalPages - 1, p + 1))}
                                                            disabled={chartPage === totalPages - 1}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-xs"
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                                                            </svg>
                                                            Older Data
                                                        </button>
                                                        {/* Page dots (reversed visual logic so left = older, right = newer) */}
                                                        <div className="flex items-center gap-1">
                                                            {Array.from({ length: totalPages }).reverse().map((_, i) => {
                                                                const actualIndex = totalPages - 1 - i;
                                                                return (
                                                                <button
                                                                    key={actualIndex}
                                                                    type="button"
                                                                    onClick={() => setChartPage(actualIndex)}
                                                                    className={`w-2 h-2 rounded-full transition-all ${actualIndex === chartPage ? "bg-blue-600 w-4" : "bg-slate-300 hover:bg-slate-400"}`}
                                                                />
                                                            )})}
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => setChartPage((p) => Math.max(0, p - 1))}
                                                            disabled={chartPage === 0}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-xs"
                                                        >
                                                            Newer Data
                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        /* Loading / Empty state */
                                        <div className="flex flex-col items-center justify-center flex-1 border border-dashed border-slate-200 rounded-xl p-10 text-center bg-slate-50/50">
                                            {loading ? (
                                                <>
                                                    <span className="w-8 h-8 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin mb-3" />
                                                    <p className="text-xs font-semibold text-slate-600">Running SARIMAX model…</p>
                                                    <p className="text-[11px] text-slate-400 mt-1">This may take a few seconds.</p>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 mb-2.5">
                                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
                                                        </svg>
                                                    </div>
                                                    <p className="text-xs font-semibold text-slate-700">No forecast data available.</p>
                                                    <p className="text-[11px] text-slate-400 mt-1">The model will run automatically on page load.</p>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ── SUMMARY STAT CARDS ── */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 shrink-0">
                                {/* Peak forecast */}
                                <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs flex items-start gap-3.5">
                                    <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0 mt-0.5">
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-[10.5px] uppercase tracking-wider font-bold text-slate-400">Projected Peak Volume</p>
                                        <p className="text-lg font-bold text-slate-900 mt-0.5 font-mono">
                                            {lastForecast?.predicted_volume != null
                                                ? `${Math.round(lastForecast.predicted_volume)} applications`
                                                : "—"}
                                        </p>
                                        <p className="text-[11px] text-slate-500 mt-0.5">
                                            Expected by {lastForecastDate}
                                        </p>
                                    </div>
                                </div>

                                {/* Quick RMSE */}
                                <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs flex items-start gap-3.5">
                                    <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0 mt-0.5">
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-[10.5px] uppercase tracking-wider font-bold text-slate-400">Typical Forecast Error</p>
                                        <p className="text-lg font-bold text-slate-900 mt-0.5 font-mono">
                                            {modelMetrics?.rmse != null
                                                ? `±${modelMetrics.rmse.toFixed(1)} applications`
                                                : "—"}
                                        </p>
                                        <p className="text-[11px] text-slate-500 mt-0.5">
                                            Expected margin per month · lower is better
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* ── MODEL ACCURACY SECTION ── */}
                            <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden shrink-0">
                                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60">
                                    <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Model Performance Indicators</h2>
                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                        These figures show how accurately the forecasting model predicts application volume.
                                    </p>
                                </div>

                                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                                    {METRIC_DEFINITIONS.map((m) => {
                                        const val = modelMetrics?.[m.key];
                                        const c = COLOR_MAP[m.color];
                                        const badge =
                                            m.key === "mase"
                                                ? getMASELabel(val)
                                                : m.key === "mape"
                                                ? getMAPELabel(val)
                                                : null;

                                        const displayVal =
                                            val != null
                                                ? m.key === "mape"
                                                    ? `${val.toFixed(1)}%`
                                                    : m.key === "mase"
                                                    ? val.toFixed(2)
                                                    : `${val.toFixed(1)}`
                                                : "—";

                                        return (
                                            <div
                                                key={m.key}
                                                className="flex flex-col gap-3 p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:border-slate-200 hover:shadow-xs transition-all"
                                            >
                                                {/* Icon + badge */}
                                                <div className="flex items-center justify-between">
                                                    <div className={`w-9 h-9 rounded-lg ${c.bg} border ${c.border} flex items-center justify-center ${c.text} shrink-0`}>
                                                        {m.icon}
                                                    </div>
                                                    {badge && (
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${COLOR_MAP[badge.color].badge}`}>
                                                            {badge.text}
                                                        </span>
                                                    )}
                                                    {!badge && val != null && (
                                                        <span className="text-[10px] font-semibold text-slate-400 font-mono">
                                                            {m.short}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Value */}
                                                <div>
                                                    <p className={`text-xl font-bold font-mono ${val != null ? "text-slate-900" : "text-slate-300"}`}>
                                                        {displayVal}
                                                    </p>
                                                    {m.unit && val != null && (
                                                        <p className="text-[10px] text-slate-400 font-medium mt-0.5">{m.unit}</p>
                                                    )}
                                                </div>

                                                {/* Label + description */}
                                                <div>
                                                    <p className="text-xs font-bold text-slate-700">{m.label}</p>
                                                    <p className="text-[10.5px] text-slate-500 leading-relaxed mt-0.5">{m.description}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ── CPI EXOGENOUS DATA CARD ── */}
                            <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden shrink-0 mt-6">
                                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                                            Update Inflation Data (CPI)
                                        </h2>
                                        <p className="text-[11px] text-slate-500 mt-0.5">
                                            The SARIMAX model uses Consumer Price Index (CPI) as an exogenous variable.
                                        </p>
                                    </div>
                                    <a 
                                        href="https://openstat.psa.gov.ph:443/PXWeb/sq/411ac3f5-5844-4e30-90cd-8a4ce24748bd" 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors shadow-xs shrink-0"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                        </svg>
                                        Download from PSA OpenSTAT
                                    </a>
                                </div>
                                <div className="p-5">
                                    <form onSubmit={handleCpiUpload} className="flex items-center gap-4">
                                        <div className="flex-1">
                                            <input 
                                                type="file" 
                                                id="cpi-file-upload"
                                                accept=".xlsx,.xls"
                                                onChange={e => setData('cpi_file', e.target.files[0])}
                                                className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 border border-slate-200 rounded-lg cursor-pointer"
                                            />
                                        </div>
                                        <button 
                                            type="submit" 
                                            disabled={!data.cpi_file || processing}
                                            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            {processing ? (
                                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            ) : (
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                                </svg>
                                            )}
                                            Upload & Overwrite
                                        </button>
                                    </form>
                                    {errors.cpi_file && <p className="text-xs text-rose-500 mt-2">{errors.cpi_file}</p>}
                                </div>
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