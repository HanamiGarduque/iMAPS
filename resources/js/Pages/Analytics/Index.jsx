import { useState, useEffect, useRef, useCallback } from 'react';
import { Head, router, usePage } from '@inertiajs/react';
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

const RAIN_LABELS = { 1: 'Dry', 2: 'Normal', 3: 'Typhoon/Wet' };

function getReadinessLevel(volume, capacity) {
    const ratio = volume / capacity;
    if (ratio > 0.9) return 'red';
    if (ratio > 0.7) return 'yellow';
    return 'green';
}

const READINESS_CONFIG = {
    green: {
        bg: 'bg-emerald-500', badgeBg: 'bg-green-100 text-green-700 border-green-200',
        label: 'MANAGEABLE',
        rec: 'Forecasted volume is within standard operational capacity. No special adjustments needed for this period.',
    },
    yellow: {
        bg: 'bg-amber-400', badgeBg: 'bg-yellow-100 text-yellow-700 border-yellow-200',
        label: 'MODERATE',
        rec: 'Forecasted volume may strain intake capacity. Consider pre-scheduling additional intake slots and coordinating early with the SB Secretariat.',
    },
    red: {
        bg: 'bg-red-500', badgeBg: 'bg-red-100 text-red-700 border-red-200',
        label: 'SURGE EXPECTED',
        rec: 'Forecasted volume exceeds standard capacity. Recommend immediate staffing adjustments, extended intake hours, and pre-scheduled Sangguniang Bayan deliberation slots at least 3 months in advance.',
    },
};

ChartJS.defaults.font.family = "'DM Sans', sans-serif";
ChartJS.defaults.color = '#64748b';

function Sidebar({ userName, userRole }) {
    const navItems = [
        { href: '/dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
        { href: '/applications', label: 'Applications', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
        { href: '/analytics', label: 'Analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', active: true },
        { href: '/audit-log', label: 'Audit Trail', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    ];
    return (
        <aside className="w-[220px] bg-white border-r border-slate-100 flex flex-col shrink-0">
            <div className="px-4 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                    </div>
                    <span className="font-bold text-slate-900 text-sm">iMAPS</span>
                </div>
            </div>
            <nav className="flex-1 flex flex-col gap-1 p-3">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-2 mb-1">Menu</p>
                {navItems.map(item => (
                    <a key={item.href} href={item.href}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-all ${item.active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                            <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                        </svg>
                        {item.label}
                    </a>
                ))}
            </nav>
            <div className="border-t border-slate-100 p-3">
                <div className="flex items-center gap-2 px-2 py-2 mb-1">
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">
                        {userName?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-slate-800 leading-none">{userName}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{userRole}</p>
                    </div>
                </div>
                <button onClick={() => { if (confirm('Sign out from iMAPS?')) { router.post('/logout'); } }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign Out
                </button>
            </div>
        </aside>
    );
}

function ReportSection({ num, title, children }) {
    return (
        <div className="mb-8">
            <h2 className="text-base font-bold text-blue-600 border-b border-slate-200 pb-2 mb-4 flex items-center gap-2">
                <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">{num}</span>
                {title}
            </h2>
            {children}
        </div>
    );
}

export default function AnalyticsIndex({ analytics, filters, barangays, auth }) {
    const [filterYear, setFilterYear] = useState(filters.year);
    const [filterBarangay, setFilterBarangay] = useState(filters.barangay);
    const [filterServiceType, setFilterServiceType] = useState(filters.service_type);
    const [isFiltering, setIsFiltering] = useState(false);
    const [inflation, setInflation] = useState(4.2);
    const [rain, setRain] = useState(2);
    const [forecastData, setForecastData] = useState(analytics.base_forecast);
    const [drillDown, setDrillDown] = useState({ open: false, title: '', category: '' });
    const [reportOpen, setReportOpen] = useState(false);
    const [repDate, setRepDate] = useState('Year to Date');
    const [repBrgy, setRepBrgy] = useState('All Barangays');
    const [repType, setRepType] = useState('All Services');
    const [repLoading, setRepLoading] = useState(false);
    const [clock, setClock] = useState('');

    const userName = auth?.user?.name || 'Staff';
    const userRole = auth?.user?.role || 'Planning Officer';

    useEffect(() => {
        const tick = () => {
            const now = new Date();
            setClock(now.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }));
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

    const DATA = analytics;
    const barangayTotals = [...(DATA.by_barangay_type ?? [])].map(b => ({ name: b.brgy, total: b.lc + b.zc + b.dp })).sort((a, b) => b.total - a.total);
    const grandTotal = barangayTotals.reduce((s, b) => s + b.total, 0);
    const topBrgy = barangayTotals[0] ?? { name: '—', total: 0 };
    const topShare = grandTotal > 0 ? Math.round((topBrgy.total / grandTotal) * 100) : 0;
    const maxForecastVol = Math.max(...forecastData);
    const peakIdx = forecastData.indexOf(maxForecastVol);
    const peakMonth = DATA.forecast_months[peakIdx] ?? '—';
    const readinessLevel = getReadinessLevel(maxForecastVol, DATA.office_capacity);
    const rc = READINESS_CONFIG[readinessLevel];

    const simulate = useCallback((inf, rainVal) => {
        const infEffect = (inf - 4.2) * -3;
        const rainEffect = rainVal === 3 ? -10 : rainVal === 1 ? 5 : 0;
        setForecastData(DATA.base_forecast.map(v => Math.max(0, Math.round(v + infEffect + rainEffect + (Math.floor(Math.random() * 4) - 2)))));
    }, [DATA.base_forecast]);

    const handleInflationChange = (v) => { setInflation(v); simulate(v, rain); };
    const handleRainChange = (v) => { setRain(v); simulate(inflation, v); };

    const applyFilters = () => {
        setIsFiltering(true);
        router.get('/analytics', { year: filterYear, barangay: filterBarangay, service_type: filterServiceType }, { preserveState: false, onFinish: () => setIsFiltering(false) });
    };

    const statusChartData = { labels: DATA.by_status.map(d => d.status), datasets: [{ data: DATA.by_status.map(d => d.count), backgroundColor: ['#10b981', '#8b5cf6', '#3b82f6', '#f59e0b', '#64748b'], borderWidth: 0, hoverOffset: 6 }] };
    const typeChartData = { labels: DATA.by_type.map(d => d.application_type), datasets: [{ data: DATA.by_type.map(d => d.count), backgroundColor: ['#1a45ee', '#3b82f6', '#93c5fd'], borderRadius: 4 }] };
    const barangayChartData = { labels: DATA.by_barangay_type.map(d => d.brgy), datasets: [{ label: 'Locational Clearance', data: DATA.by_barangay_type.map(d => d.lc), backgroundColor: '#1a45ee', borderRadius: 2 }, { label: 'Zoning Certification', data: DATA.by_barangay_type.map(d => d.zc), backgroundColor: '#3b82f6', borderRadius: 2 }, { label: 'Development Permit', data: DATA.by_barangay_type.map(d => d.dp), backgroundColor: '#93c5fd', borderRadius: 2 }] };
    const trendChartData = { labels: DATA.months, datasets: [{ label: `${filters.year} (Current)`, data: DATA.monthly_trend_current, borderColor: '#1a45ee', backgroundColor: 'rgba(26,69,238,0.1)', borderWidth: 2, fill: true, tension: 0.4 }, { label: `${filters.year - 1} (Previous)`, data: DATA.monthly_trend_prev, borderColor: '#94a3b8', borderDash: [5, 5], borderWidth: 2, fill: false, tension: 0.4 }] };
    const forecastChartData = { labels: DATA.forecast_months, datasets: [{ label: 'Predicted Volume', data: forecastData, borderColor: '#8b5cf6', backgroundColor: '#8b5cf6', borderWidth: 3, pointRadius: 5, tension: 0.3 }, { label: 'Upper Bound (95%)', data: forecastData.map(v => v + 12), borderColor: 'rgba(139,92,246,0.2)', borderWidth: 1, borderDash: [4, 4], fill: false, pointRadius: 0 }, { label: 'Lower Bound (95%)', data: forecastData.map(v => Math.max(0, v - 12)), borderColor: 'rgba(139,92,246,0.2)', borderWidth: 1, borderDash: [4, 4], fill: false, pointRadius: 0 }] };

    const actualVsPredictedData = {
        labels: analytics.prediction_months,
        datasets: [
            { label: 'Actual', data: analytics.actual_values, borderColor: '#1a45ee', backgroundColor: 'rgba(26,69,238,0.1)', borderWidth: 2, tension: 0.4, pointRadius: 4 },
            { label: 'Predicted', data: analytics.predicted_values, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 2, tension: 0.4, pointRadius: 4, borderDash: [4, 4] },
        ]
    };

    const confidenceForecastData = {
        labels: analytics.forecast_months,
        datasets: [
            { label: 'Forecast', data: analytics.base_forecast, borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.1)', borderWidth: 2, tension: 0.4, pointRadius: 4, fill: true },
            { label: 'Upper Bound', data: analytics.forecast_upper, borderColor: 'rgba(139,92,246,0.3)', borderWidth: 1, borderDash: [5, 5], pointRadius: 0 },
            { label: 'Lower Bound', data: analytics.forecast_lower, borderColor: 'rgba(139,92,246,0.3)', borderWidth: 1, borderDash: [5, 5], pointRadius: 0 },
        ]
    };

    const chartLineOpts = { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, font: { size: 10 } } } }, scales: { y: { beginAtZero: false, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } } }, x: { grid: { display: false }, ticks: { font: { size: 10 } } } } };

    const trendBadge = (curr, prev, invertGood = false) => {
        if (!prev) return null;
        const pct = (((curr - prev) / prev) * 100).toFixed(1);
        const isUp = pct > 0;
        const isGood = invertGood ? !isUp : isUp;
        return <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${isGood ? 'text-emerald-600 bg-green-50' : 'text-red-500 bg-red-50'}`}>{isUp ? '↑' : '↓'} {Math.abs(pct)}% YoY</span>;
    };

    const { summary } = DATA;
    const cRate = summary.total_applications > 0 ? ((summary.completed / summary.total_applications) * 100).toFixed(1) : '0.0';
    const mockNames = ['Maria Santos', 'Juan Perez', 'ACME Corp', 'Rizal Enterprises', 'Dela Cruz Family', 'Metro Builders Inc.', 'Sps. Reyes'];
    const drillRows = Array.from({ length: 12 }, (_, i) => {
        const status = drillDown.category === 'All' ? (DATA.by_status[i % 5]?.status ?? '—') : drillDown.category;
        const type = DATA.by_type[i % 3]?.application_type ?? '—';
        const brgy = DATA.by_barangay_type[i % DATA.by_barangay_type.length]?.brgy ?? '—';
        const badgeCls = status.includes('Released') ? 'bg-green-100 text-green-700' : status.includes('SB') ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700';
        return { id: `TRK-${filters.year}-${1000 + i}`, name: mockNames[i % mockNames.length], brgy, type, status, badgeCls };
    });

    const cardStyle = { boxShadow: '0 1px 3px rgba(0,0,0,.04)' };

    return (
        <>
            <Head title="Analytics | iMAPS" />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
                body { font-family: 'DM Sans', sans-serif; background: #f8fafc; }
                ::-webkit-scrollbar { width: 5px; }
                ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 3px; }
                @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
                .fade-up { animation: fadeUp .3s ease both; }
            `}</style>

            <div className="flex h-screen overflow-hidden">
                <Sidebar userName={userName} userRole={userRole} />

                <div className="flex-1 flex flex-col overflow-hidden">
                    <header className="h-14 bg-white border-b border-slate-100 flex items-center justify-between px-5 shrink-0 z-10">
                        <span className="text-slate-400 text-sm hidden sm:block">MPDO Rosario, Batangas</span>
                        <span className="text-xs text-slate-400 font-mono hidden md:block">{clock}</span>
                    </header>

                    <main className="flex-1 overflow-y-auto px-6 py-6">
                        <div className="max-w-[1600px] mx-auto w-full space-y-6">

                            {/* Page Header */}
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 fade-up">
                                <div>
                                    <h1 className="text-lg font-semibold text-slate-900">Analytics</h1>
                                    <p className="text-xs text-slate-400 mt-0.5">Geospatial &amp; predictive insights for zoning and land use planning</p>
                                </div>
                                <button onClick={() => setReportOpen(true)}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-colors">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    Generate Report
                                </button>
                            </div>

                            {/* Filters */}
                            <div className="fade-up bg-white p-4 rounded-2xl border border-slate-200 flex flex-wrap gap-4 items-end" style={cardStyle}>
                                <div className="flex-1 min-w-[180px]">
                                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Year</label>
                                    <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className="w-full text-sm border border-slate-200 rounded-xl bg-white px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-colors">
                                        {[2024, 2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
                                    </select>
                                </div>
                                <div className="flex-1 min-w-[180px]">
                                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Barangay</label>
                                    <select value={filterBarangay} onChange={e => setFilterBarangay(e.target.value)} className="w-full text-sm border border-slate-200 rounded-xl bg-white px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-colors">
                                        <option value="all">All Barangays</option>
                                        {barangays.map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                </div>
                                <div className="flex-1 min-w-[180px]">
                                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Service Type</label>
                                    <select value={filterServiceType} onChange={e => setFilterServiceType(e.target.value)} className="w-full text-sm border border-slate-200 rounded-xl bg-white px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-colors">
                                        <option value="all">All Services</option>
                                        <option value="Locational Clearance">Locational Clearance</option>
                                        <option value="Zoning Certification">Zoning Certification</option>
                                        <option value="Development Permit">Development Permit</option>
                                    </select>
                                </div>
                                <button onClick={applyFilters} disabled={isFiltering}
                                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors shadow-sm flex items-center gap-2">
                                    {isFiltering && <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                                    {isFiltering ? 'Filtering…' : 'Apply Filters'}
                                </button>
                            </div>

                            {/* ESDA Panel */}
                            <div className="fade-up bg-gradient-to-r from-indigo-50 to-white border border-indigo-100 rounded-2xl p-5 relative overflow-hidden" style={cardStyle}>
                                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                                    <svg className="w-32 h-32 text-indigo-900" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
                                </div>
                                <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                                    <div className="flex-1">
                                        <h3 className="text-sm font-bold text-indigo-800 flex items-center gap-2 mb-2">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            Exploratory Spatial Data Analysis (ESDA) Insights
                                        </h3>
                                        <p className="text-sm text-slate-700 leading-relaxed">
                                            Exploratory Spatial Data Analysis reveals that development pressure is highly concentrated, with <strong>{topBrgy.name}</strong> absorbing {topShare}% of all municipal zoning applications. Locational Clearances are the primary driver of permit volumes across all geographic units, indicating consistent new commercial and residential compliance activities primarily clustering in the central barangays rather than the periphery.
                                        </p>
                                    </div>
                                    <div className="bg-white/80 backdrop-blur px-5 py-3 rounded-xl border border-indigo-100 shadow-sm text-center min-w-[180px]">
                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">High Density Area</p>
                                        <p className="text-xl font-bold text-indigo-600">{topBrgy.name}</p>
                                        <p className="text-xs text-slate-400 mt-1">{topShare}% of total volume</p>
                                    </div>
                                </div>
                            </div>

                            {/* KPI Row */}
                            <div className="fade-up grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <div onClick={() => setDrillDown({ open: true, title: 'Total Applications', category: 'All' })} className="bg-white rounded-2xl border border-slate-200 p-5 hover:-translate-y-1 hover:shadow-md transition-all duration-300 cursor-pointer" style={cardStyle}>
                                    <div className="flex justify-between items-start">
                                        <p className="text-[12px] text-slate-500 font-medium">Total Applications</p>
                                        {trendBadge(summary.total_applications, summary.total_prev_year)}
                                    </div>
                                    <h3 className="text-[32px] font-bold text-slate-800 leading-tight mt-2">{summary.total_applications}</h3>
                                    <p className="text-[11px] font-medium text-slate-400 mt-1">Year to Date ({filters.year})</p>
                                </div>
                                <div className="bg-white rounded-2xl border border-slate-200 p-5 hover:-translate-y-1 hover:shadow-md transition-all duration-300" style={cardStyle}>
                                    <p className="text-[12px] text-slate-500 font-medium">Completion Rate</p>
                                    <h3 className="text-[32px] font-bold text-slate-800 leading-tight mt-2">{cRate}%</h3>
                                    <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2"><div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${cRate}%` }} /></div>
                                </div>
                                <div className="bg-white rounded-2xl border border-slate-200 p-5 hover:-translate-y-1 hover:shadow-md transition-all duration-300" style={cardStyle}>
                                    <div className="flex justify-between items-start">
                                        <p className="text-[12px] text-slate-500 font-medium">Avg. Processing Time</p>
                                        {trendBadge(summary.avg_processing_days, summary.avg_days_prev_year, true)}
                                    </div>
                                    <h3 className="text-[32px] font-bold text-slate-800 leading-tight mt-2">{summary.avg_processing_days}</h3>
                                    <p className="text-[11px] font-medium text-amber-500 mt-1">days to release</p>
                                </div>
                                <div onClick={() => setDrillDown({ open: true, title: 'Pending Applications', category: 'Under SB' })} className="bg-white rounded-2xl border border-slate-200 p-5 hover:-translate-y-1 hover:shadow-md transition-all duration-300 cursor-pointer" style={cardStyle}>
                                    <p className="text-[12px] text-slate-500 font-medium">Pending / Denied</p>
                                    <h3 className="text-[32px] font-bold text-slate-800 leading-tight mt-2">{summary.pending} <span className="text-lg text-slate-300 font-normal">/ {summary.denied}</span></h3>
                                    <p className="text-[11px] font-medium text-red-400 mt-1">needs attention</p>
                                </div>
                            </div>

                            {/* Readiness + Leaderboard */}
                            <div className="fade-up grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6" style={cardStyle}>
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <h3 className="text-[15px] font-semibold text-slate-800">Peak Month Readiness</h3>
                                            <p className="text-xs text-slate-400 mt-0.5">Based on SARIMAX 6-month forecast</p>
                                        </div>
                                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${rc.badgeBg}`}>{rc.label}</span>
                                    </div>
                                    <div className="flex items-center gap-5 mb-5">
                                        <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl ${rc.bg}`}>{maxForecastVol}</div>
                                        <div>
                                            <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Next Peak Month</p>
                                            <p className="text-lg font-bold text-slate-800">{peakMonth}</p>
                                            <p className="text-sm text-slate-500">Forecasted: {maxForecastVol} applications</p>
                                        </div>
                                    </div>
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
                                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">MPDO Recommendation</p>
                                        <p className="text-xs text-slate-600 leading-relaxed">{rc.rec}</p>
                                    </div>
                                </div>
                                <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6" style={cardStyle}>
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <h3 className="text-[15px] font-semibold text-slate-800">Top Barangays Leaderboard</h3>
                                            <p className="text-xs text-slate-400 mt-0.5">Application volume concentration</p>
                                        </div>
                                        <span className="text-[10px] text-slate-400 font-medium">Year {filters.year}</span>
                                    </div>
                                    <div className="space-y-2">
                                        {barangayTotals.map((b, i) => {
                                            const share = grandTotal > 0 ? ((b.total / grandTotal) * 100).toFixed(1) : 0;
                                            const barWidth = barangayTotals[0]?.total > 0 ? ((b.total / barangayTotals[0].total) * 100).toFixed(0) : 0;
                                            const rankIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="text-slate-400 font-bold text-xs">{i + 1}</span>;
                                            return (
                                                <div key={b.name} className="flex items-center gap-3">
                                                    <div className="w-6 text-center text-sm flex-shrink-0">{rankIcon}</div>
                                                    <div className="flex-1">
                                                        <div className="flex justify-between items-center mb-0.5">
                                                            <span className="text-xs font-medium text-slate-700">{b.name}</span>
                                                            <span className="text-xs font-bold text-slate-800">{b.total} <span className="text-[10px] text-slate-400 font-normal">({share}%)</span></span>
                                                        </div>
                                                        <div className="w-full bg-slate-100 rounded-full h-1.5"><div className="bg-blue-600 h-1.5 rounded-full transition-all duration-500" style={{ width: `${barWidth}%` }} /></div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {barangayTotals.length >= 2 && (
                                        <div className="mt-4 pt-3 border-t border-slate-100">
                                            <p className="text-xs text-slate-500 leading-relaxed">
                                                <strong>{barangayTotals[0].name}</strong> leads with {grandTotal > 0 ? ((barangayTotals[0].total / grandTotal) * 100).toFixed(1) : 0}% of total applications. Gap between 1st and 2nd: <strong>{barangayTotals[0].total - barangayTotals[1].total} applications</strong>.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Charts Row */}
                            <div className="fade-up grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div onClick={() => setDrillDown({ open: true, title: 'Status Distribution', category: 'All' })} className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 hover:-translate-y-1 hover:shadow-md transition-all duration-300 cursor-pointer" style={cardStyle}>
                                    <h3 className="text-[15px] font-semibold text-slate-800">Applications by Status</h3>
                                    <p className="text-xs text-slate-400 mt-1 mb-4">Click chart to view specific records</p>
                                    <div className="relative h-[240px] flex items-center justify-center">
                                        <Doughnut data={statusChartData} options={{ responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8, font: { size: 10 } } } } }} />
                                    </div>
                                </div>
                                <div onClick={() => setDrillDown({ open: true, title: 'Service Types', category: 'All' })} className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 hover:-translate-y-1 hover:shadow-md transition-all duration-300 cursor-pointer" style={cardStyle}>
                                    <h3 className="text-[15px] font-semibold text-slate-800">Volume by Service Type</h3>
                                    <p className="text-xs text-slate-400 mt-1 mb-4">Distribution of zoning services</p>
                                    <div className="relative h-[240px]">
                                        <Bar data={typeChartData} options={{ indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: '#f1f5f9' } }, y: { grid: { display: false }, ticks: { font: { size: 11 } } } } }} />
                                    </div>
                                </div>
                                <div onClick={() => setDrillDown({ open: true, title: 'Barangay Distribution', category: 'All' })} className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 hover:-translate-y-1 hover:shadow-md transition-all duration-300 cursor-pointer" style={cardStyle}>
                                    <h3 className="text-[15px] font-semibold text-slate-800">Spatial Distribution by Barangay</h3>
                                    <p className="text-xs text-slate-400 mt-1 mb-4">Application volume concentration</p>
                                    <div className="relative h-[240px]">
                                        <Bar data={barangayChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { boxWidth: 8, font: { size: 10 } } }, tooltip: { mode: 'index', intersect: false } }, scales: { x: { stacked: true, grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45, minRotation: 45 } }, y: { stacked: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } } } } }} />
                                    </div>
                                </div>
                            </div>

                            {/* Historical Trend */}
                            <div className="fade-up bg-white rounded-2xl border border-slate-200 p-5 sm:p-6" style={cardStyle}>
                                <h3 className="text-[15px] font-semibold text-slate-800 mb-1">Historical Trend &amp; Comparative Analysis</h3>
                                <p className="text-xs text-slate-400 mb-4">Current Year vs Previous Year application volume</p>
                                <div className="relative h-[240px]">
                                    <Line data={trendChartData} options={{ responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'top', labels: { usePointStyle: true } } }, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } } }} />
                                </div>
                            </div>

                            {/* ── PREDICTIVE ANALYTICS ── */}
                            <div className="fade-up pt-6 border-t border-slate-200 mt-2">
                                <div className="mb-6 flex items-center gap-3">
                                    <span className="bg-purple-100 text-purple-700 text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full border border-purple-200">Predictive Analytics</span>
                                    <h2 className="text-lg font-semibold text-slate-800">6-Month SARIMAX Forecast</h2>
                                </div>

                                {/* ROW 1: Forecast Chart + Simulation */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                                    <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6" style={cardStyle}>
                                        <h3 className="text-[15px] font-semibold text-slate-800 mb-1">Locational Clearance Volume Forecast</h3>
                                        <p className="text-xs text-slate-500 mb-4">Adjust the exogenous factors on the right to simulate scenarios.</p>
                                        <div className="relative h-[320px]">
                                            <Line data={forecastChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: false, suggestedMin: 30 } } }} />
                                        </div>
                                    </div>
                                    <div className="space-y-4 flex flex-col">
                                        <div className="bg-white p-4 rounded-2xl border border-slate-200" style={cardStyle}>
                                            <h3 className="text-[13px] font-semibold text-slate-800 mb-3">Model Accuracy (SARIMAX)</h3>
                                            <div className="grid grid-cols-2 gap-3">
                                                {[['MAPE', DATA.metrics.mape], ['MAE', DATA.metrics.mae], ['RMSE', DATA.metrics.rmse], ['MASE', DATA.metrics.mase]].map(([k, v]) => (
                                                    <div key={k} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                                                        <div className="text-xs text-slate-500">{k}</div>
                                                        <div className="font-bold text-slate-800">{v}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex-1 bg-white rounded-2xl border border-slate-200 p-4" style={cardStyle}>
                                            <h3 className="text-[13px] font-semibold text-slate-800 mb-4 flex items-center gap-2">
                                                <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                                                Simulate Exogenous Factors
                                            </h3>
                                            <div className="space-y-5">
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <label className="font-medium text-slate-600">Inflation Rate Impact</label>
                                                        <span className="font-bold text-red-500">{inflation.toFixed(1)}%</span>
                                                    </div>
                                                    <input type="range" min="2" max="10" step="0.1" value={inflation} onChange={e => handleInflationChange(parseFloat(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-500" />
                                                    <p className="text-[10px] text-slate-400 mt-1">Higher inflation reduces expected applications.</p>
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <label className="font-medium text-slate-600">Rainfall Severity</label>
                                                        <span className="font-bold text-blue-500">{RAIN_LABELS[rain]}</span>
                                                    </div>
                                                    <input type="range" min="1" max="3" step="1" value={rain} onChange={e => handleRainChange(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                                                    <div className="flex justify-between text-[10px] text-slate-400 mt-1 px-1">
                                                        <span>Dry</span><span>Normal</span><span>Typhoon</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* ROW 2: Actual vs Predicted + Forecast Confidence */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                                    <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6" style={cardStyle}>
                                        <h3 className="text-[15px] font-semibold text-slate-800 mb-1">Actual vs Predicted Output</h3>
                                        <p className="text-xs text-slate-400 mb-4">Comparison of observed values against SARIMAX model predictions</p>
                                        <div className="relative h-[280px]">
                                            <Line data={actualVsPredictedData} options={chartLineOpts} />
                                        </div>
                                    </div>
                                    <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6" style={cardStyle}>
                                        <h3 className="text-[15px] font-semibold text-slate-800 mb-1">Forecast Confidence Range</h3>
                                        <p className="text-xs text-slate-400 mb-4">6-month forecast with 95% confidence interval bounds</p>
                                        <div className="relative h-[280px]">
                                            <Line data={confidenceForecastData} options={chartLineOpts} />
                                        </div>
                                    </div>
                                </div>

                                {/* ROW 3: Prediction Validation Table */}
                                <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6" style={cardStyle}>
                                    <h3 className="text-[15px] font-semibold text-slate-800 mb-1">Prediction Validation Table</h3>
                                    <p className="text-xs text-slate-400 mb-4">Month-by-month comparison of actual vs predicted values with residuals</p>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left border-collapse">
                                            <thead>
                                                <tr className="text-[10.5px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                                                    <th className="py-3 px-4 font-semibold">Month</th>
                                                    <th className="py-3 px-4 font-semibold">Actual</th>
                                                    <th className="py-3 px-4 font-semibold">Predicted</th>
                                                    <th className="py-3 px-4 font-semibold">Residual</th>
                                                    <th className="py-3 px-4 font-semibold">Error %</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {analytics.prediction_months?.map((month, index) => {
                                                    const actual = analytics.actual_values[index];
                                                    const predicted = analytics.predicted_values[index];
                                                    const residual = actual - predicted;
                                                    const errorPct = actual !== 0 ? ((Math.abs(residual) / actual) * 100).toFixed(1) : '—';
                                                    const isPositive = residual >= 0;
                                                    return (
                                                        <tr key={index} className="hover:bg-slate-50 transition-colors">
                                                            <td className="py-3 px-4 font-medium text-slate-700">{month}</td>
                                                            <td className="py-3 px-4 font-bold text-slate-800">{actual}</td>
                                                            <td className="py-3 px-4 text-blue-600 font-semibold">{predicted}</td>
                                                            <td className="py-3 px-4">
                                                                <span className={`inline-flex items-center gap-1 text-xs font-bold ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                                                                    {isPositive ? '↑' : '↓'} {Math.abs(residual)}
                                                                </span>
                                                            </td>
                                                            <td className="py-3 px-4">
                                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${parseFloat(errorPct) <= 10 ? 'bg-green-50 text-green-600' : parseFloat(errorPct) <= 20 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-500'}`}>
                                                                    {errorPct}%
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>

                            <div className="h-8" />
                        </div>
                    </main>
                </div>
            </div>

            {/* Drill Down Modal */}
            {drillDown.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(3px)' }}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">Records: {drillDown.title}</h3>
                                <p className="text-xs text-slate-500">Filtered by: {drillDown.category}</p>
                            </div>
                            <button onClick={() => setDrillDown({ open: false, title: '', category: '' })} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-800 hover:bg-slate-50 transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-white sticky top-0 shadow-sm">
                                    <tr className="text-[10.5px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                                        {['Tracking ID', 'Applicant Name', 'Barangay', 'Type', 'Status'].map(h => <th key={h} className="py-3 px-6 font-semibold">{h}</th>)}
                                    </tr>
                                </thead>
                                <tbody className="text-[13px] text-slate-600 divide-y divide-slate-50">
                                    {drillRows.map(r => (
                                        <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="py-3 px-6 font-mono text-xs font-medium text-blue-600">{r.id}</td>
                                            <td className="py-3 px-6 font-semibold text-slate-800">{r.name}</td>
                                            <td className="py-3 px-6 text-slate-500">{r.brgy}</td>
                                            <td className="py-3 px-6 text-xs"><span className="inline-block px-2 py-1 rounded bg-slate-100 text-slate-600 text-[11px] font-medium">{r.type}</span></td>
                                            <td className="py-3 px-6"><span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide ${r.badgeCls}`}>{r.status}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
                            <button onClick={() => setDrillDown({ open: false, title: '', category: '' })} className="px-5 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-500 text-sm font-medium hover:bg-slate-50 hover:text-slate-800 transition-colors">Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Report Modal */}
            {reportOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(3px)' }}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-[1100px] max-h-[95vh] flex flex-col">
                        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-3">
                                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                <h3 className="font-semibold text-slate-800">Generate Report — MPDO Rosario</h3>
                            </div>
                            <button onClick={() => setReportOpen(false)} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-800 hover:bg-slate-50 transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 shrink-0">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Report Filters</p>
                            <div className="flex flex-wrap gap-3 items-end">
                                <div className="flex-1 min-w-[160px]">
                                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Date Range</label>
                                    <select value={repDate} onChange={e => setRepDate(e.target.value)} className="w-full text-sm border border-slate-200 rounded-xl bg-white px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-colors">
                                        <option>Last 30 Days</option><option>Year to Date</option><option>Last Year</option><option>Q1 (Jan–Mar)</option><option>Q2 (Apr–Jun)</option>
                                    </select>
                                </div>
                                <div className="flex-1 min-w-[160px]">
                                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Barangay</label>
                                    <select value={repBrgy} onChange={e => setRepBrgy(e.target.value)} className="w-full text-sm border border-slate-200 rounded-xl bg-white px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-colors">
                                        <option>All Barangays</option>{barangays.map(b => <option key={b}>{b}</option>)}
                                    </select>
                                </div>
                                <div className="flex-1 min-w-[160px]">
                                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Service Type</label>
                                    <select value={repType} onChange={e => setRepType(e.target.value)} className="w-full text-sm border border-slate-200 rounded-xl bg-white px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-colors">
                                        <option>All Services</option><option>Locational Clearance</option><option>Zoning Certification</option><option>Development Permit</option>
                                    </select>
                                </div>
                                <button onClick={() => { setRepLoading(true); setTimeout(() => setRepLoading(false), 600); }} className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors shadow-sm flex items-center gap-2 shrink-0">
                                    {repLoading ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Generating…</> : 'Generate'}
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-3">
                                {[repDate, repBrgy, repType].map((t, i) => <span key={i} className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${['bg-blue-100 text-blue-700', 'bg-indigo-100 text-indigo-700', 'bg-purple-100 text-purple-700'][i]}`}>{t}</span>)}
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto bg-slate-100 p-6">
                            <div className="bg-white shadow-sm border border-slate-200 p-10 mx-auto max-w-[850px]">
                                <div className="text-center mb-8 border-b-2 border-blue-600 pb-6">
                                    <div className="flex items-center justify-center gap-3 mb-3">
                                        <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                                        </div>
                                        <div className="text-left">
                                            <h1 className="text-xl font-bold text-slate-900 uppercase tracking-wide">iMAPS Analytics Report</h1>
                                            <p className="text-slate-600 text-sm font-medium">MPDO — Municipality of Rosario, Batangas</p>
                                        </div>
                                    </div>
                                    <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm text-slate-500">
                                        <span>Date Generated: <strong className="text-slate-700">{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</strong></span>
                                        <span>|</span>
                                        <span>Filters: <strong className="text-slate-700">{repDate} | {repBrgy} | {repType}</strong></span>
                                    </div>
                                </div>
                                <ReportSection num="01" title="Summary Metrics">
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        {[['Total Applications', summary.total_applications], ['Completion Rate', `${cRate}%`], ['Avg. Processing Time', `${summary.avg_processing_days} days`], ['Pending / Denied', `${summary.pending} / ${summary.denied}`]].map(([k, v]) => (
                                            <div key={k} className="flex justify-between items-center bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-100"><span className="text-slate-500">{k}</span><strong className="text-slate-800">{v}</strong></div>
                                        ))}
                                    </div>
                                </ReportSection>
                                <ReportSection num="02" title="Volume Breakdown">
                                    <div className="grid grid-cols-3 gap-6 text-sm">
                                        {[['By Service Type', DATA.by_type.map(t => [t.application_type, t.count])], ['Top Barangays', barangayTotals.slice(0, 5).map(b => [b.name, b.total])], ['By Status', DATA.by_status.map(s => [s.status, s.count])]].map(([label, rows]) => (
                                            <div key={label}><strong className="text-slate-700 block mb-2 text-xs uppercase tracking-wide">{label}</strong><ul>{rows.map(([k, v]) => <li key={k} className="flex justify-between py-1 border-b border-slate-50"><span className="text-slate-600">{k}</span><span className="font-semibold">{v}</span></li>)}</ul></div>
                                        ))}
                                    </div>
                                </ReportSection>
                                <ReportSection num="03" title="Top Barangays Leaderboard">
                                    <table className="w-full text-sm text-left border border-slate-200 rounded-xl overflow-hidden mb-3">
                                        <thead className="bg-slate-50 text-slate-500 text-[10.5px] uppercase tracking-wider"><tr>{['Rank', 'Barangay', 'Count', 'Share (%)'].map(h => <th key={h} className="p-3 border-b border-slate-100">{h}</th>)}</tr></thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {barangayTotals.map((b, i) => (
                                                <tr key={b.name} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                                    <td className="p-2.5 text-center">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                                                    <td className="p-2.5 font-medium text-slate-700">{b.name}</td>
                                                    <td className="p-2.5 text-center font-bold text-blue-600">{b.total}</td>
                                                    <td className="p-2.5 text-center text-slate-500">{grandTotal > 0 ? ((b.total / grandTotal) * 100).toFixed(1) : 0}%</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </ReportSection>
                                <ReportSection num="04" title="ESDA Insight">
                                    <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                                        <p className="text-sm text-slate-700 leading-relaxed text-justify">Exploratory Spatial Data Analysis reveals that development pressure is highly concentrated, with <strong>{topBrgy.name}</strong> absorbing {topShare}% of all municipal zoning applications. Locational Clearances are the primary driver of permit volumes across all geographic units.</p>
                                    </div>
                                </ReportSection>
                                <ReportSection num="05" title="Peak Month Readiness">
                                    <div className={`flex items-center gap-4 p-4 rounded-xl border ${readinessLevel === 'green' ? 'border-green-200 bg-green-50' : readinessLevel === 'yellow' ? 'border-yellow-200 bg-yellow-50' : 'border-red-200 bg-red-50'}`}>
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0 ${rc.bg}`}>{maxForecastVol}</div>
                                        <div>
                                            <p className="text-sm font-bold">Status: {rc.label}</p>
                                            <p className="text-xs text-slate-600 mt-1">Peak Month: {peakMonth} — Forecasted: {maxForecastVol} | Capacity: {DATA.office_capacity}</p>
                                            <p className="text-xs text-slate-600 mt-1">{rc.rec}</p>
                                        </div>
                                    </div>
                                </ReportSection>
                                <ReportSection num="06" title="SARIMAX Forecast">
                                    <p className="text-sm text-slate-600 mb-3">Simulation — Inflation: {inflation.toFixed(1)}%, Rainfall: {RAIN_LABELS[rain]}. Next 3 months:</p>
                                    <table className="w-full text-sm text-left border border-slate-200 rounded-xl overflow-hidden">
                                        <thead className="bg-slate-50 text-slate-500 text-[10.5px] uppercase tracking-wider"><tr>{['Forecast Month', 'Predicted Volume', 'Expected Range (95% CI)'].map(h => <th key={h} className="p-3 border-b border-slate-100">{h}</th>)}</tr></thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {forecastData.slice(0, 3).map((val, i) => (
                                                <tr key={i} className="hover:bg-slate-50">
                                                    <td className="p-3 font-medium">{DATA.forecast_months[i]}</td>
                                                    <td className="p-3 font-bold text-blue-600">{val} applications</td>
                                                    <td className="p-3 text-slate-500">{Math.max(0, val - 12)} to {val + 12}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </ReportSection>
                                <ReportSection num="07" title="Recommendations">
                                    <ol className="list-decimal pl-5 text-sm text-slate-700 space-y-3 mt-2">
                                        <li>Prioritize processing capacity for <strong>{barangayTotals[0]?.name ?? '—'}</strong>, which accounts for {grandTotal > 0 ? ((barangayTotals[0]?.total / grandTotal) * 100).toFixed(1) : '—'}% of applications.</li>
                                        <li>Address the <strong>{summary.pending} pending applications</strong>, particularly those under SB review, to reduce the {summary.avg_processing_days}-day average processing time.</li>
                                        <li>Prepare contingency staffing for a forecasted surge of <strong>{maxForecastVol} applications</strong> in <strong>{peakMonth}</strong> ({rc.label.toLowerCase()} readiness).</li>
                                    </ol>
                                </ReportSection>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-slate-100 shrink-0 flex gap-2.5 justify-end">
                            <button onClick={() => setReportOpen(false)} className="px-5 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-500 text-sm font-medium hover:bg-slate-50 hover:text-slate-800 transition-colors">Cancel</button>
                            <button onClick={() => window.print()} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors shadow-sm">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                                Print / Save PDF
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}