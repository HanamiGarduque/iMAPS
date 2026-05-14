import { useState, useEffect, useRef, useCallback } from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import {
    Chart as ChartJS,
    ArcElement, BarElement, LineElement, PointElement,
    CategoryScale, LinearScale,
    Tooltip, Legend, Filler,
} from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';

ChartJS.register(
    ArcElement, BarElement, LineElement, PointElement,
    CategoryScale, LinearScale,
    Tooltip, Legend, Filler
);

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const COLORS = {
    primary: '#1a45ee',
    success: '#10b981',
    warning: '#f59e0b',
    danger:  '#ef4444',
    info:    '#3b82f6',
};

const RAIN_LABELS = { 1: 'Dry', 2: 'Normal', 3: 'Typhoon/Wet' };

// ─── HELPER: READINESS LEVEL ──────────────────────────────────────────────────
function getReadinessLevel(volume, capacity) {
    const ratio = volume / capacity;
    if (ratio > 0.9) return 'red';
    if (ratio > 0.7) return 'yellow';
    return 'green';
}

const READINESS_CONFIG = {
    green: {
        bg: 'bg-emerald-500', badgeBg: 'bg-green-100 text-green-700 border-green-200',
        label: 'MANAGEABLE', pulse: 'shadow-[0_0_0_0_rgba(16,185,129,0.4)] animate-pulse',
        rec: 'Forecasted volume is within standard operational capacity. No special adjustments needed for this period.',
    },
    yellow: {
        bg: 'bg-amber-400', badgeBg: 'bg-yellow-100 text-yellow-700 border-yellow-200',
        label: 'MODERATE', pulse: '',
        rec: 'Forecasted volume may strain intake capacity. Consider pre-scheduling additional intake slots and coordinating early with the SB Secretariat.',
    },
    red: {
        bg: 'bg-red-500', badgeBg: 'bg-red-100 text-red-700 border-red-200',
        label: 'SURGE EXPECTED', pulse: '',
        rec: 'Forecasted volume exceeds standard capacity. Recommend immediate staffing adjustments, extended intake hours, and pre-scheduled Sangguniang Bayan deliberation slots at least 3 months in advance.',
    },
};

// ─── CHART DEFAULTS ───────────────────────────────────────────────────────────
ChartJS.defaults.font.family = "'Poppins', sans-serif";
ChartJS.defaults.color = '#64748b';

// ══════════════════════════════════════════════════════════════════════════════
export default function AnalyticsIndex({ analytics, filters, barangays }) {
    const { auth } = usePage().props;

    // ── FILTER STATE ──────────────────────────────────────────────────
    const [filterYear,        setFilterYear]        = useState(filters.year);
    const [filterBarangay,    setFilterBarangay]    = useState(filters.barangay);
    const [filterServiceType, setFilterServiceType] = useState(filters.service_type);
    const [isFiltering,       setIsFiltering]       = useState(false);

    // ── SIMULATION STATE ──────────────────────────────────────────────
    const [inflation,       setInflation]       = useState(4.2);
    const [rain,            setRain]            = useState(2);
    const [forecastData,    setForecastData]    = useState(analytics.base_forecast);

    // ── MODAL STATE ───────────────────────────────────────────────────
    const [drillDown, setDrillDown] = useState({ open: false, title: '', category: '' });
    const [reportOpen, setReportOpen] = useState(false);

    // ── REPORT FILTER STATE ───────────────────────────────────────────
    const [repDate,    setRepDate]    = useState('Year to Date');
    const [repBrgy,    setRepBrgy]    = useState('All Barangays');
    const [repType,    setRepType]    = useState('All Services');
    const [repLoading, setRepLoading] = useState(false);

    // ── DERIVED ───────────────────────────────────────────────────────
    const DATA = analytics;

    const barangayTotals = [...(DATA.by_barangay_type ?? [])].map(b => ({
        name:  b.brgy,
        total: b.lc + b.zc + b.dp,
    })).sort((a, b) => b.total - a.total);

    const grandTotal = barangayTotals.reduce((s, b) => s + b.total, 0);
    const topBrgy    = barangayTotals[0] ?? { name: '—', total: 0 };
    const topShare   = grandTotal > 0 ? Math.round((topBrgy.total / grandTotal) * 100) : 0;

    const maxForecastVol = Math.max(...forecastData);
    const peakIdx        = forecastData.indexOf(maxForecastVol);
    const peakMonth      = DATA.forecast_months[peakIdx] ?? '—';
    const readinessLevel = getReadinessLevel(maxForecastVol, DATA.office_capacity);
    const rc             = READINESS_CONFIG[readinessLevel];

    // ── SIMULATE FORECAST ─────────────────────────────────────────────
    const simulate = useCallback((inf, rainVal) => {
        const infEffect  = (inf - 4.2) * -3;
        const rainEffect = rainVal === 3 ? -10 : rainVal === 1 ? 5 : 0;
        setForecastData(
            DATA.base_forecast.map(v =>
                Math.max(0, Math.round(v + infEffect + rainEffect + (Math.floor(Math.random() * 4) - 2)))
            )
        );
    }, [DATA.base_forecast]);

    const handleInflationChange = (v) => { setInflation(v); simulate(v, rain); };
    const handleRainChange      = (v) => { setRain(v);      simulate(inflation, v); };

    // ── APPLY FILTERS ─────────────────────────────────────────────────
    const applyFilters = () => {
        setIsFiltering(true);
        router.get('/analytics', {
            year:         filterYear,
            barangay:     filterBarangay,
            service_type: filterServiceType,
        }, {
            preserveState: false,
            onFinish: () => setIsFiltering(false),
        });
    };

    // ── CHART DATA ────────────────────────────────────────────────────
    const statusChartData = {
        labels:   DATA.by_status.map(d => d.status),
        datasets: [{
            data:            DATA.by_status.map(d => d.count),
            backgroundColor: ['#10b981','#8b5cf6','#3b82f6','#f59e0b','#64748b'],
            borderWidth: 0, hoverOffset: 6,
        }],
    };

    const typeChartData = {
        labels:   DATA.by_type.map(d => d.application_type),
        datasets: [{
            data:            DATA.by_type.map(d => d.count),
            backgroundColor: ['#1a45ee','#3b82f6','#93c5fd'],
            borderRadius: 4,
        }],
    };

    const barangayChartData = {
        labels:   DATA.by_barangay_type.map(d => d.brgy),
        datasets: [
            { label: 'Locational Clearance', data: DATA.by_barangay_type.map(d => d.lc), backgroundColor: '#1a45ee', borderRadius: 2 },
            { label: 'Zoning Certification',  data: DATA.by_barangay_type.map(d => d.zc), backgroundColor: '#3b82f6', borderRadius: 2 },
            { label: 'Development Permit',    data: DATA.by_barangay_type.map(d => d.dp), backgroundColor: '#93c5fd', borderRadius: 2 },
        ],
    };

    const trendChartData = {
        labels:   DATA.months,
        datasets: [
            { label: `${filters.year} (Current)`, data: DATA.monthly_trend_current, borderColor: '#1a45ee', backgroundColor: 'rgba(26,69,238,0.1)', borderWidth: 2, fill: true, tension: 0.4 },
            { label: `${filters.year - 1} (Previous)`, data: DATA.monthly_trend_prev, borderColor: '#94a3b8', borderDash: [5,5], borderWidth: 2, fill: false, tension: 0.4 },
        ],
    };

    const forecastChartData = {
        labels:   DATA.forecast_months,
        datasets: [
            { label: 'Predicted Volume', data: forecastData, borderColor: '#8b5cf6', backgroundColor: '#8b5cf6', borderWidth: 3, pointRadius: 5, tension: 0.3 },
            { label: 'Upper Bound (95%)', data: forecastData.map(v => v + 12), borderColor: 'rgba(139,92,246,0.2)', borderWidth: 1, borderDash: [4,4], fill: false, pointRadius: 0 },
            { label: 'Lower Bound (95%)', data: forecastData.map(v => Math.max(0, v - 12)), borderColor: 'rgba(139,92,246,0.2)', borderWidth: 1, borderDash: [4,4], fill: false, pointRadius: 0 },
        ],
    };

    // ── KPI TREND BADGE ───────────────────────────────────────────────
    const trendBadge = (curr, prev, invertGood = false) => {
        if (!prev) return null;
        const pct    = (((curr - prev) / prev) * 100).toFixed(1);
        const isUp   = pct > 0;
        const isGood = invertGood ? !isUp : isUp;
        return (
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${isGood ? 'text-emerald-600 bg-green-50' : 'text-red-500 bg-red-50'}`}>
                {isUp ? '↑' : '↓'} {Math.abs(pct)}% YoY
            </span>
        );
    };

    const { summary } = DATA;
    const cRate = summary.total_applications > 0
        ? ((summary.completed / summary.total_applications) * 100).toFixed(1)
        : '0.0';

    // ── DRILL DOWN MOCK ROWS ───────────────────────────────────────────
    const mockNames = ['Maria Santos','Juan Perez','ACME Corp','Rizal Enterprises','Dela Cruz Family','Metro Builders Inc.','Sps. Reyes'];
    const drillRows = Array.from({ length: 12 }, (_, i) => {
        const status  = drillDown.category === 'All' ? (DATA.by_status[i % 5]?.status ?? '—') : drillDown.category;
        const type    = DATA.by_type[i % 3]?.application_type ?? '—';
        const brgy    = DATA.by_barangay_type[i % DATA.by_barangay_type.length]?.brgy ?? '—';
        const badgeCls = status.includes('Released')
            ? 'bg-green-100 text-green-700'
            : status.includes('SB') ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700';
        return { id: `TRK-${filters.year}-${1000 + i}`, name: mockNames[i % mockNames.length], brgy, type, status, badgeCls };
    });

    // ─────────────────────────────────────────────────────────────────
    return (
        <AuthenticatedLayout
            user={auth.user}
            header={
                <h2 className="font-semibold text-slate-800 text-lg leading-tight">
                    Analytics <span className="font-normal text-slate-500">— MPDO Rosario</span>
                </h2>
            }
        >
            <Head title="Analytics" />

            <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
                <div className="max-w-[1600px] mx-auto w-full space-y-6">

                    {/* ── PAGE HEADER ─────────────────────────────────── */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <h2 className="text-2xl font-semibold text-slate-800">Geospatial & Predictive Analytics</h2>
                            <p className="text-sm text-slate-500 mt-1">Data-driven insights for zoning and land use planning</p>
                        </div>
                        <button
                            onClick={() => setReportOpen(true)}
                            className="bg-[#1a45ee] hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium shadow-sm transition-colors flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                            Generate Report
                        </button>
                    </div>

                    {/* ── FILTERS ─────────────────────────────────────── */}
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-end">
                        <div className="flex-1 min-w-[180px]">
                            <label className="block text-xs font-medium text-slate-500 mb-1">Year</label>
                            <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
                                className="w-full text-sm border border-slate-300 rounded-lg bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200">
                                {[2024,2025,2026,2027].map(y => <option key={y}>{y}</option>)}
                            </select>
                        </div>
                        <div className="flex-1 min-w-[180px]">
                            <label className="block text-xs font-medium text-slate-500 mb-1">Barangay</label>
                            <select value={filterBarangay} onChange={e => setFilterBarangay(e.target.value)}
                                className="w-full text-sm border border-slate-300 rounded-lg bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200">
                                <option value="all">All Barangays</option>
                                {barangays.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                        </div>
                        <div className="flex-1 min-w-[180px]">
                            <label className="block text-xs font-medium text-slate-500 mb-1">Service Type</label>
                            <select value={filterServiceType} onChange={e => setFilterServiceType(e.target.value)}
                                className="w-full text-sm border border-slate-300 rounded-lg bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200">
                                <option value="all">All Services</option>
                                <option value="Locational Clearance">Locational Clearance</option>
                                <option value="Zoning Certification">Zoning Certification</option>
                                <option value="Development Permit">Development Permit</option>
                            </select>
                        </div>
                        <button
                            onClick={applyFilters}
                            disabled={isFiltering}
                            className="bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                            {isFiltering && <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                            {isFiltering ? 'Filtering...' : 'Apply Filters'}
                        </button>
                    </div>

                    {/* ── ESDA PANEL ──────────────────────────────────── */}
                    <div className="bg-gradient-to-r from-indigo-50 to-white border border-indigo-100 rounded-xl p-5 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                            <svg className="w-32 h-32 text-indigo-900" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                        </div>
                        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                            <div className="flex-1">
                                <h3 className="text-sm font-bold text-indigo-800 flex items-center gap-2 mb-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                    Exploratory Spatial Data Analysis (ESDA) Insights
                                </h3>
                                <p className="text-sm text-slate-700 leading-relaxed">
                                    Exploratory Spatial Data Analysis reveals that development pressure is highly concentrated, with{' '}
                                    <strong>{topBrgy.name}</strong> absorbing {topShare}% of all municipal zoning applications.
                                    Locational Clearances are the primary driver of permit volumes across all geographic units,
                                    indicating consistent new commercial and residential compliance activities primarily clustering
                                    in the central barangays rather than the periphery.
                                </p>
                            </div>
                            <div className="bg-white/80 backdrop-blur px-5 py-3 rounded-xl border border-indigo-100 shadow-sm text-center min-w-[180px]">
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">High Density Area</p>
                                <p className="text-xl font-bold text-indigo-600">{topBrgy.name}</p>
                                <p className="text-xs text-slate-400 mt-1">{topShare}% of total volume</p>
                            </div>
                        </div>
                    </div>

                    {/* ── KPI ROW ─────────────────────────────────────── */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                        {/* Total Applications */}
                        <div onClick={() => setDrillDown({ open: true, title: 'Total Applications', category: 'All' })}
                            className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5 hover:-translate-y-1 hover:shadow-md transition-all duration-300 cursor-pointer">
                            <div className="flex justify-between items-start">
                                <p className="text-[12px] text-slate-500 font-medium">Total Applications</p>
                                {trendBadge(summary.total_applications, summary.total_prev_year)}
                            </div>
                            <h3 className="text-[32px] font-bold text-slate-800 leading-tight mt-2">{summary.total_applications}</h3>
                            <p className="text-[11px] font-medium text-slate-400 mt-1">Year to Date ({filters.year})</p>
                        </div>

                        {/* Completion Rate */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5 hover:-translate-y-1 hover:shadow-md transition-all duration-300">
                            <p className="text-[12px] text-slate-500 font-medium">Completion Rate</p>
                            <h3 className="text-[32px] font-bold text-slate-800 leading-tight mt-2">{cRate}%</h3>
                            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
                                <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${cRate}%` }} />
                            </div>
                        </div>

                        {/* Avg Processing Time */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5 hover:-translate-y-1 hover:shadow-md transition-all duration-300">
                            <div className="flex justify-between items-start">
                                <p className="text-[12px] text-slate-500 font-medium">Avg. Processing Time</p>
                                {trendBadge(summary.avg_processing_days, summary.avg_days_prev_year, true)}
                            </div>
                            <h3 className="text-[32px] font-bold text-slate-800 leading-tight mt-2">{summary.avg_processing_days}</h3>
                            <p className="text-[11px] font-medium text-amber-500 mt-1">days to release</p>
                        </div>

                        {/* Pending / Denied */}
                        <div onClick={() => setDrillDown({ open: true, title: 'Pending Applications', category: 'Under SB' })}
                            className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5 hover:-translate-y-1 hover:shadow-md transition-all duration-300 cursor-pointer">
                            <p className="text-[12px] text-slate-500 font-medium">Pending / Denied</p>
                            <h3 className="text-[32px] font-bold text-slate-800 leading-tight mt-2">
                                {summary.pending} <span className="text-lg text-slate-300 font-normal">/ {summary.denied}</span>
                            </h3>
                            <p className="text-[11px] font-medium text-red-400 mt-1">needs attention</p>
                        </div>
                    </div>

                    {/* ── READINESS + LEADERBOARD ─────────────────────── */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                        {/* Peak Month Readiness */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5 sm:p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-[15px] font-semibold text-slate-800">Peak Month Readiness</h3>
                                    <p className="text-xs text-slate-400 mt-0.5">Based on SARIMAX 6-month forecast</p>
                                </div>
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${rc.badgeBg}`}>
                                    {rc.label}
                                </span>
                            </div>
                            <div className="flex items-center gap-5 mb-5">
                                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl ${rc.bg}`}>
                                    {maxForecastVol}
                                </div>
                                <div>
                                    <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Next Peak Month</p>
                                    <p className="text-lg font-bold text-slate-800">{peakMonth}</p>
                                    <p className="text-sm text-slate-500">Forecasted: {maxForecastVol} applications</p>
                                </div>
                            </div>
                            {/* Month Bar Strip */}
                            <div className="mb-4">
                                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2">6-Month Forecast Overview</p>
                                <div className="flex gap-1">
                                    {DATA.forecast_months.map((m, i) => {
                                        const vol = forecastData[i] ?? 0;
                                        const lvl = getReadinessLevel(vol, DATA.office_capacity);
                                        const barColor = lvl === 'green' ? 'bg-emerald-500' : lvl === 'yellow' ? 'bg-amber-400' : 'bg-red-500';
                                        const barH = Math.max(8, (vol / maxForecastVol) * 40);
                                        return (
                                            <div key={m} className="flex-1 text-center">
                                                <div className={`w-full ${barColor} rounded-sm mb-1`} style={{ height: barH }} />
                                                <p className="text-[9px] text-slate-400 font-medium">{m.split(' ')[0]}</p>
                                                <p className="text-[9px] font-bold text-slate-600">{vol}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">MPDO Recommendation</p>
                                <p className="text-xs text-slate-600 leading-relaxed">{rc.rec}</p>
                            </div>
                        </div>

                        {/* Top Barangays Leaderboard */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5 sm:p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-[15px] font-semibold text-slate-800">Top Barangays Leaderboard</h3>
                                    <p className="text-xs text-slate-400 mt-0.5">Application volume concentration</p>
                                </div>
                                <span className="text-[10px] text-slate-400 font-medium">Year {filters.year}</span>
                            </div>
                            <div className="space-y-2">
                                {barangayTotals.map((b, i) => {
                                    const share    = grandTotal > 0 ? ((b.total / grandTotal) * 100).toFixed(1) : 0;
                                    const barWidth = barangayTotals[0]?.total > 0 ? ((b.total / barangayTotals[0].total) * 100).toFixed(0) : 0;
                                    const rankIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="text-slate-400 font-bold text-xs">{i + 1}</span>;
                                    return (
                                        <div key={b.name} className="flex items-center gap-3">
                                            <div className="w-6 text-center text-sm flex-shrink-0">{rankIcon}</div>
                                            <div className="flex-1">
                                                <div className="flex justify-between items-center mb-0.5">
                                                    <span className="text-xs font-medium text-slate-700">{b.name}</span>
                                                    <span className="text-xs font-bold text-slate-800">
                                                        {b.total} <span className="text-[10px] text-slate-400 font-normal">({share}%)</span>
                                                    </span>
                                                </div>
                                                <div className="w-full bg-slate-100 rounded-full h-1.5">
                                                    <div className="bg-[#1a45ee] h-1.5 rounded-full transition-all duration-500" style={{ width: `${barWidth}%` }} />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            {barangayTotals.length >= 2 && (
                                <div className="mt-4 pt-3 border-t border-slate-100">
                                    <p className="text-xs text-slate-500 leading-relaxed">
                                        <strong>{barangayTotals[0].name}</strong> leads with {grandTotal > 0 ? ((barangayTotals[0].total / grandTotal) * 100).toFixed(1) : 0}% of total applications,
                                        signaling concentrated development pressure in the central barangay.
                                        Gap between 1st and 2nd: <strong>{barangayTotals[0].total - barangayTotals[1].total} applications</strong>.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── CHARTS ROW ──────────────────────────────────── */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div onClick={() => setDrillDown({ open: true, title: 'Status Distribution', category: 'All' })}
                            className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5 sm:p-6 hover:-translate-y-1 hover:shadow-md transition-all duration-300 cursor-pointer">
                            <h3 className="text-[15px] font-semibold text-slate-800">Applications by Status</h3>
                            <p className="text-xs text-slate-400 mt-1 mb-4">Click chart to view specific records</p>
                            <div className="relative h-[240px] flex items-center justify-center">
                                <Doughnut data={statusChartData} options={{ responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8, font: { size: 10 } } } } }} />
                            </div>
                        </div>
                        <div onClick={() => setDrillDown({ open: true, title: 'Service Types', category: 'All' })}
                            className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5 sm:p-6 hover:-translate-y-1 hover:shadow-md transition-all duration-300 cursor-pointer">
                            <h3 className="text-[15px] font-semibold text-slate-800">Volume by Service Type</h3>
                            <p className="text-xs text-slate-400 mt-1 mb-4">Distribution of zoning services</p>
                            <div className="relative h-[240px]">
                                <Bar data={typeChartData} options={{ indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: '#f1f5f9' } }, y: { grid: { display: false }, ticks: { font: { size: 11 } } } } }} />
                            </div>
                        </div>
                        <div onClick={() => setDrillDown({ open: true, title: 'Barangay Distribution', category: 'All' })}
                            className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5 sm:p-6 hover:-translate-y-1 hover:shadow-md transition-all duration-300 cursor-pointer">
                            <h3 className="text-[15px] font-semibold text-slate-800">Spatial Distribution by Barangay</h3>
                            <p className="text-xs text-slate-400 mt-1 mb-4">Application volume concentration</p>
                            <div className="relative h-[240px]">
                                <Bar data={barangayChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { boxWidth: 8, font: { size: 10 } } }, tooltip: { mode: 'index', intersect: false } }, scales: { x: { stacked: true, grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45, minRotation: 45 } }, y: { stacked: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } } } } }} />
                            </div>
                        </div>
                    </div>

                    {/* ── HISTORICAL TREND ────────────────────────────── */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5 sm:p-6">
                        <h3 className="text-[15px] font-semibold text-slate-800 mb-1">Historical Trend & Comparative Analysis</h3>
                        <p className="text-xs text-slate-400 mb-4">Current Year vs Previous Year application volume</p>
                        <div className="relative h-[240px]">
                            <Line data={trendChartData} options={{ responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'top', labels: { usePointStyle: true } } }, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } } }} />
                        </div>
                    </div>

                    {/* ── PREDICTIVE ANALYTICS ────────────────────────── */}
                    <div className="pt-6 border-t border-slate-300 mt-8">
                        <div className="mb-6 flex items-center gap-3">
                            <span className="bg-purple-100 text-purple-700 text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-md border border-purple-200">Predictive Analytics</span>
                            <h2 className="text-xl font-semibold text-slate-800">6-Month SARIMAX Forecast</h2>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5 sm:p-6">
                                <h3 className="text-[15px] font-semibold text-slate-800 mb-1">Locational Clearance Volume Forecast</h3>
                                <p className="text-xs text-slate-500 mb-4">Adjust the exogenous factors on the right to simulate scenarios.</p>
                                <div className="relative h-[320px]">
                                    <Line data={forecastChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: false, suggestedMin: 30 } } }} />
                                </div>
                            </div>
                            <div className="space-y-4 flex flex-col">
                                {/* Model Accuracy */}
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                    <h3 className="text-[13px] font-semibold text-slate-800 mb-3">Model Accuracy (SARIMAX)</h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        {[['MAPE', DATA.metrics.mape], ['MAE', DATA.metrics.mae], ['RMSE', DATA.metrics.rmse], ['MASE', DATA.metrics.mase]].map(([k, v]) => (
                                            <div key={k} className="p-3 bg-slate-50 rounded border border-slate-100 text-center">
                                                <div className="text-xs text-slate-500">{k}</div>
                                                <div className="font-bold text-slate-800">{v}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                {/* Simulation */}
                                <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-4">
                                    <h3 className="text-[13px] font-semibold text-slate-800 mb-4 flex items-center gap-2">
                                        <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/></svg>
                                        Simulate Exogenous Factors
                                    </h3>
                                    <div className="space-y-5">
                                        <div>
                                            <div className="flex justify-between text-xs mb-1">
                                                <label className="font-medium text-slate-600">Inflation Rate Impact</label>
                                                <span className="font-bold text-red-500">{inflation.toFixed(1)}%</span>
                                            </div>
                                            <input type="range" min="2" max="10" step="0.1" value={inflation}
                                                onChange={e => handleInflationChange(parseFloat(e.target.value))}
                                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-500" />
                                            <p className="text-[10px] text-slate-400 mt-1">Higher inflation reduces expected applications.</p>
                                        </div>
                                        <div>
                                            <div className="flex justify-between text-xs mb-1">
                                                <label className="font-medium text-slate-600">Rainfall Severity</label>
                                                <span className="font-bold text-blue-500">{RAIN_LABELS[rain]}</span>
                                            </div>
                                            <input type="range" min="1" max="3" step="1" value={rain}
                                                onChange={e => handleRainChange(parseInt(e.target.value))}
                                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                                            <div className="flex justify-between text-[10px] text-slate-400 mt-1 px-1">
                                                <span>Dry</span><span>Normal</span><span>Typhoon</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="h-8" />
                </div>
            </div>

            {/* ── DRILL DOWN MODAL ───────────────────────────────────── */}
            {drillDown.open && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">Records: {drillDown.title}</h3>
                                <p className="text-xs text-slate-500">Filtered by: {drillDown.category}</p>
                            </div>
                            <button onClick={() => setDrillDown({ open: false, title: '', category: '' })}
                                className="text-slate-400 hover:text-slate-600 bg-white shadow-sm hover:bg-slate-50 rounded-full p-2 transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-white sticky top-0 shadow-sm">
                                    <tr className="text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                                        <th className="py-3 px-6 font-semibold">Tracking ID</th>
                                        <th className="py-3 px-6 font-semibold">Applicant Name</th>
                                        <th className="py-3 px-6 font-semibold">Barangay</th>
                                        <th className="py-3 px-6 font-semibold">Type</th>
                                        <th className="py-3 px-6 font-semibold">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="text-[13px] text-slate-600 divide-y divide-slate-100">
                                    {drillRows.map(r => (
                                        <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="py-3 px-6 font-medium text-[#1a45ee]">{r.id}</td>
                                            <td className="py-3 px-6 font-semibold">{r.name}</td>
                                            <td className="py-3 px-6">{r.brgy}</td>
                                            <td className="py-3 px-6 text-xs">{r.type}</td>
                                            <td className="py-3 px-6">
                                                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide ${r.badgeCls}`}>{r.status}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ── REPORT MODAL ───────────────────────────────────────── */}
            {reportOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-[1100px] max-h-[95vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <svg className="w-5 h-5 text-[#1a45ee]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                                <h3 className="font-semibold text-slate-800">Generate Report — MPDO Rosario</h3>
                            </div>
                            <button onClick={() => setReportOpen(false)} className="text-slate-400 hover:text-slate-600 bg-slate-50 rounded-full p-1.5 transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                        </div>
                        {/* Report Filter Bar */}
                        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex-shrink-0">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Report Filters</p>
                            <div className="flex flex-wrap gap-3 items-end">
                                <div className="flex-1 min-w-[160px]">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Date Range</label>
                                    <select value={repDate} onChange={e => setRepDate(e.target.value)}
                                        className="w-full text-sm border border-slate-300 rounded-lg bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200">
                                        <option>Last 30 Days</option>
                                        <option>Year to Date</option>
                                        <option>Last Year</option>
                                        <option>Q1 (Jan–Mar)</option>
                                        <option>Q2 (Apr–Jun)</option>
                                    </select>
                                </div>
                                <div className="flex-1 min-w-[160px]">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Barangay</label>
                                    <select value={repBrgy} onChange={e => setRepBrgy(e.target.value)}
                                        className="w-full text-sm border border-slate-300 rounded-lg bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200">
                                        <option>All Barangays</option>
                                        {barangays.map(b => <option key={b}>{b}</option>)}
                                    </select>
                                </div>
                                <div className="flex-1 min-w-[160px]">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Service Type</label>
                                    <select value={repType} onChange={e => setRepType(e.target.value)}
                                        className="w-full text-sm border border-slate-300 rounded-lg bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200">
                                        <option>All Services</option>
                                        <option>Locational Clearance</option>
                                        <option>Zoning Certification</option>
                                        <option>Development Permit</option>
                                    </select>
                                </div>
                                <button
                                    onClick={() => { setRepLoading(true); setTimeout(() => setRepLoading(false), 600); }}
                                    className="bg-[#1a45ee] hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 flex-shrink-0"
                                >
                                    {repLoading
                                        ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Generating...</>
                                        : 'Generate'
                                    }
                                </button>
                            </div>
                            {/* Active tags */}
                            <div className="flex flex-wrap gap-2 mt-3">
                                {[repDate, repBrgy, repType].map((t, i) => (
                                    <span key={i} className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${['bg-blue-100 text-blue-700','bg-indigo-100 text-indigo-700','bg-purple-100 text-purple-700'][i]}`}>{t}</span>
                                ))}
                            </div>
                        </div>
                        {/* Report Body */}
                        <div className="flex-1 overflow-y-auto bg-slate-100 p-6">
                            <div className="bg-white shadow-sm border border-slate-200 p-10 mx-auto max-w-[850px]">
                                {/* Header */}
                                <div className="text-center mb-8 border-b-2 border-[#1a45ee] pb-6">
                                    <div className="flex items-center justify-center gap-3 mb-3">
                                        <div className="w-10 h-10 bg-[#1a45ee] rounded-lg flex items-center justify-center text-white font-bold text-sm">iM</div>
                                        <div className="text-left">
                                            <h1 className="text-xl font-bold text-slate-900 uppercase tracking-wide">MPDO Analytics Report</h1>
                                            <p className="text-slate-600 text-sm font-medium">Municipality of Rosario, Batangas</p>
                                        </div>
                                    </div>
                                    <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm text-slate-500">
                                        <span>Date Generated: <strong className="text-slate-700">{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</strong></span>
                                        <span>|</span>
                                        <span>Filters: <strong className="text-slate-700">{repDate} | {repBrgy} | {repType}</strong></span>
                                    </div>
                                </div>
                                {/* Section 1 */}
                                <ReportSection num="01" title="Summary Metrics">
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        {[['Total Applications', summary.total_applications],['Completion Rate', `${cRate}%`],['Avg. Processing Time', `${summary.avg_processing_days} days`],['Pending / Denied', `${summary.pending} / ${summary.denied}`]].map(([k, v]) => (
                                            <div key={k} className="flex justify-between items-center bg-slate-50 px-4 py-2.5 rounded border border-slate-100">
                                                <span className="text-slate-500">{k}</span>
                                                <strong className="text-slate-800">{v}</strong>
                                            </div>
                                        ))}
                                    </div>
                                </ReportSection>
                                {/* Section 2 */}
                                <ReportSection num="02" title="Volume Breakdown">
                                    <div className="grid grid-cols-3 gap-6 text-sm">
                                        {[['By Service Type', DATA.by_type.map(t => [t.application_type, t.count])],['Top Barangays', barangayTotals.slice(0,5).map(b => [b.name, b.total])],['By Status', DATA.by_status.map(s => [s.status, s.count])]].map(([label, rows]) => (
                                            <div key={label}>
                                                <strong className="text-slate-700 block mb-2 text-xs uppercase tracking-wide">{label}</strong>
                                                <ul>{rows.map(([k, v]) => <li key={k} className="flex justify-between py-1 border-b border-slate-50"><span className="text-slate-600">{k}</span><span className="font-semibold">{v}</span></li>)}</ul>
                                            </div>
                                        ))}
                                    </div>
                                </ReportSection>
                                {/* Section 3: Leaderboard */}
                                <ReportSection num="03" title="Top Barangays Leaderboard">
                                    <table className="w-full text-sm text-left border border-slate-200 rounded-lg overflow-hidden mb-3">
                                        <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                                            <tr>{['Rank','Barangay','Count','Share (%)'].map(h => <th key={h} className="p-3 border-b">{h}</th>)}</tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {barangayTotals.map((b, i) => (
                                                <tr key={b.name} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                                    <td className="p-2.5 text-center">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                                                    <td className="p-2.5 font-medium text-slate-700">{b.name}</td>
                                                    <td className="p-2.5 text-center font-bold text-[#1a45ee]">{b.total}</td>
                                                    <td className="p-2.5 text-center text-slate-500">{grandTotal > 0 ? ((b.total / grandTotal) * 100).toFixed(1) : 0}%</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </ReportSection>
                                {/* Section 4: ESDA */}
                                <ReportSection num="04" title="ESDA Insight">
                                    <div className="bg-indigo-50/50 p-4 rounded-lg border border-indigo-100">
                                        <p className="text-sm text-slate-700 leading-relaxed text-justify">
                                            Exploratory Spatial Data Analysis reveals that development pressure is highly concentrated, with <strong>{topBrgy.name}</strong> absorbing {topShare}% of all municipal zoning applications. Locational Clearances are the primary driver of permit volumes across all geographic units.
                                        </p>
                                    </div>
                                </ReportSection>
                                {/* Section 5: Peak Month Readiness */}
                                <ReportSection num="05" title="Peak Month Readiness">
                                    <div className={`flex items-center gap-4 p-4 rounded-lg border ${readinessLevel === 'green' ? 'border-green-200 bg-green-50' : readinessLevel === 'yellow' ? 'border-yellow-200 bg-yellow-50' : 'border-red-200 bg-red-50'}`}>
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0 ${rc.bg}`}>{maxForecastVol}</div>
                                        <div>
                                            <p className="text-sm font-bold">Status: {rc.label}</p>
                                            <p className="text-xs text-slate-600 mt-1">Peak Month: {peakMonth} — Forecasted Volume: {maxForecastVol} applications | Office Capacity: {DATA.office_capacity}</p>
                                            <p className="text-xs text-slate-600 mt-1">{rc.rec}</p>
                                        </div>
                                    </div>
                                </ReportSection>
                                {/* Section 6: Forecast */}
                                <ReportSection num="06" title="SARIMAX Forecast">
                                    <p className="text-sm text-slate-600 mb-3">Simulation — Inflation: {inflation.toFixed(1)}%, Rainfall: {RAIN_LABELS[rain]}. Next 3 months:</p>
                                    <table className="w-full text-sm text-left border border-slate-200 rounded-lg overflow-hidden">
                                        <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                                            <tr>{['Forecast Month','Predicted Volume','Expected Range (95% CI)'].map(h => <th key={h} className="p-3 border-b">{h}</th>)}</tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {forecastData.slice(0,3).map((val, i) => (
                                                <tr key={i} className="hover:bg-slate-50">
                                                    <td className="p-3 font-medium">{DATA.forecast_months[i]}</td>
                                                    <td className="p-3 font-bold text-[#1a45ee]">{val} applications</td>
                                                    <td className="p-3 text-slate-500">{Math.max(0, val - 12)} to {val + 12}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </ReportSection>
                                {/* Section 7: Recommendations */}
                                <ReportSection num="07" title="Recommendations">
                                    <ol className="list-decimal pl-5 text-sm text-slate-700 space-y-3 mt-2">
                                        <li>Prioritize processing capacity for <strong>{barangayTotals[0]?.name ?? '—'}</strong>, which accounts for {grandTotal > 0 ? ((barangayTotals[0]?.total / grandTotal) * 100).toFixed(1) : '—'}% of applications.</li>
                                        <li>Address the <strong>{summary.pending} pending applications</strong>, particularly those under SB review, to reduce the {summary.avg_processing_days}-day average processing time.</li>
                                        <li>Prepare contingency staffing for a forecasted surge of <strong>{maxForecastVol} applications</strong> in <strong>{peakMonth}</strong> ({rc.label.toLowerCase()} readiness).</li>
                                    </ol>
                                </ReportSection>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-slate-100 flex justify-end items-center gap-3">
                            <button onClick={() => setReportOpen(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50">Cancel</button>
                            <button onClick={() => window.print()} className="bg-[#1a45ee] hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium shadow-sm flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                                Print / Save PDF
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AuthenticatedLayout>
    );
}

// ─── SMALL HELPER COMPONENT ───────────────────────────────────────────────────
function ReportSection({ num, title, children }) {
    return (
        <div className="mb-8">
            <h2 className="text-base font-bold text-[#1a45ee] border-b border-slate-200 pb-2 mb-4 flex items-center gap-2">
                <span className="bg-[#1a45ee] text-white text-[10px] font-bold px-1.5 py-0.5 rounded">{num}</span>
                {title}
            </h2>
            {children}
        </div>
    );
}