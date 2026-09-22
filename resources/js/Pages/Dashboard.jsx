import React, { useState, useEffect } from "react";
import { Head, Link, router } from "@inertiajs/react";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell,
    PieChart,
    Pie,
} from "recharts";

/* ── Helpers ── */
const STATUS_CFG = {
    Received:                   { bg: "bg-slate-100", text: "text-slate-600", dot: "#64748b" },
    "Technical Review":         { bg: "bg-blue-50",   text: "text-blue-700",  dot: "#2563eb" },
    "Under Sangguniang Bayan":  { bg: "bg-violet-50", text: "text-violet-700",dot: "#7c3aed" },
    "For Release":              { bg: "bg-amber-50",  text: "text-amber-700", dot: "#d97706" },
    Released:                   { bg: "bg-emerald-50",text: "text-emerald-700",dot:"#059669" },
    Denied:                     { bg: "bg-rose-50",   text: "text-rose-700",  dot: "#e11d48" },
};

function StatusPill({ status }) {
    const c = STATUS_CFG[status] || STATUS_CFG.Received;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-full text-[10px] font-bold tracking-wide ${c.bg} ${c.text}`}>
            <span className="w-[5px] h-[5px] rounded-full" style={{ background: c.dot }} />
            {status || "—"}
        </span>
    );
}

function initials(name) {
    if (!name) return "?";
    const p = name.trim().split(/\s+/);
    return p.length === 1 ? p[0].substring(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

const ChartTip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-slate-900 text-white rounded-lg shadow-xl px-3.5 py-2.5 text-xs font-semibold border border-slate-700">
            {label && <p className="text-slate-400 text-[10px] uppercase tracking-wider mb-1">{label}</p>}
            {payload.map((e, i) => (
                <div key={i} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: e.color || e.fill || '#fff' }} />
                    <span>{e.name}: <strong className="text-white">{e.value}</strong></span>
                </div>
            ))}
        </div>
    );
};

/* ── Donut for status breakdown (like the reference "Project Progress") ── */
function StatusDonut({ kpis }) {
    const released = kpis.released ?? 0;
    const pending  = kpis.pending ?? 0;
    const denied   = kpis.denied ?? 0;
    const total    = released + pending + denied || 1;
    const pct      = Math.round((released / total) * 100);

    const data = [
        { name: "Released",  value: released, fill: "#2563eb" },
        { name: "Pending",   value: pending,  fill: "#93c5fd" },
        { name: "Denied",    value: denied,   fill: "#e2e8f0" },
    ].filter(d => d.value > 0);

    if (data.length === 0) data.push({ name: "None", value: 1, fill: "#e2e8f0" });

    return (
        <div className="flex flex-col items-center justify-center flex-1">
            <div className="relative w-[160px] h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={52}
                            outerRadius={72}
                            paddingAngle={3}
                            dataKey="value"
                            strokeWidth={0}
                            startAngle={90}
                            endAngle={-270}
                        >
                            {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
                {/* Center label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-extrabold text-slate-900 leading-none">{pct}%</span>
                    <span className="text-[10px] font-semibold text-slate-400 mt-1">Approved</span>
                </div>
            </div>
            <div className="flex items-center justify-center gap-4 mt-4 text-[11px] font-semibold">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-600" /> Released</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-300" /> Pending</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-200" /> Denied</span>
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════════════════ */
export default function Dashboard({
    userName = "Staff",
    userRole = "User",
    kpis = {},
    monthlyTrend = [],
    topBarangays = [],
    recent = [],
    forecastPreview = [],
    hasForecast = false,
}) {
    const [clock, setClock] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const isPlanningOfficer = userRole === "Planning Officer";

    useEffect(() => {
        const tick = () => setClock(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

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
                popup: "rounded-2xl shadow-2xl p-6 bg-white font-sans",
                title: "text-base font-bold text-slate-900",
                htmlContainer: "text-sm text-slate-500",
                actions: "flex items-center justify-center gap-3 mt-5",
                confirmButton: "px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors cursor-pointer",
                cancelButton: "px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition-colors cursor-pointer",
            },
        }).then((r) => {
            if (r.isConfirmed) { sessionStorage.removeItem("hasShownWelcome"); router.post("/logout"); }
        });
    };

    const moM = kpis.monthOverMonthPct ?? 0;
    const trendUp = moM >= 0;

    const metrics = [
        { label: "Total Applications", value: kpis.total ?? 0, sub: "All-time filings", accent: true },
        { label: "Pending Review",     value: kpis.pending ?? 0, sub: "Awaiting action" },
        { label: "Released",           value: kpis.released ?? 0, sub: "Approved & issued" },
        { label: "Inspections",        value: kpis.inspectionsInProgress ?? 0, sub: "Active schedule" },
    ];

    const maxBrgy = Math.max(1, ...topBarangays.map(b => b.count));

    const AVATAR_COLORS = [
        "bg-blue-100 text-blue-700",
        "bg-violet-100 text-violet-700",
        "bg-amber-100 text-amber-700",
        "bg-emerald-100 text-emerald-700",
        "bg-rose-100 text-rose-700",
    ];

    return (
        <>
            <Head title="Dashboard | iMAPS" />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
                
                #dash-root, .swal2-popup {
                    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                }
                .font-mono {
                    font-family: 'JetBrains Mono', monospace !important;
                }

                #dash-root ::-webkit-scrollbar { width: 6px; height: 6px; }
                #dash-root ::-webkit-scrollbar-track { background: transparent; }
                #dash-root ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 6px; }
                #dash-root ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            `}</style>

            <div id="dash-root" className="bg-[#f8f9fb] text-slate-900 h-screen flex flex-col overflow-hidden antialiased font-sans">
                <Header userName={userName} userRole={userRole} clock={clock} onLogout={handleLogout} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} activePage="dashboard" />

                <div className="flex-1 overflow-hidden relative flex flex-col min-w-0">
                    <Sidebar userName={userName} userRole={userRole} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} onLogout={handleLogout} activePage="dashboard" />
                    {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="absolute inset-0 bg-black/20 backdrop-blur-[2px] z-[750] md:hidden" />}

                    <main className="flex-1 w-full h-full overflow-y-auto">
                        <div className="px-5 sm:px-8 lg:px-10 py-7 max-w-[1520px] mx-auto w-full space-y-6">

                            {/* ━━ PAGE HEADER ━━ */}
                            {(() => {
                                const hour = new Date().getHours();
                                const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
                                const firstName = (userName || "").split(" ")[0] || "there";
                                return (
                                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                                        <div>
                                            <h1 className="text-[22px] font-extrabold text-slate-900 tracking-tight leading-tight">
                                                {greeting}, {firstName} 👋
                                            </h1>
                                            <p className="text-[13px] text-slate-500 font-medium mt-0.5">
                                                Here's what's happening with your zoning applications today.
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2.5">
                                            {isPlanningOfficer && (
                                                <Link href="/applications/encode" className="inline-flex items-center gap-1.5 h-9 px-4 bg-blue-600 text-white rounded-lg text-[13px] font-bold hover:bg-blue-700 shadow-sm shadow-blue-600/20 transition-all active:scale-[0.97]">
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                                    New Application
                                                </Link>
                                            )}
                                            <Link href="/maps" className="inline-flex items-center gap-1.5 h-9 px-4 bg-white text-slate-700 border border-slate-200 rounded-lg text-[13px] font-bold hover:bg-slate-50 shadow-sm transition-all active:scale-[0.97]">
                                                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                                                Maps
                                            </Link>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* ━━ KPI STRIP ━━ */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                {metrics.map((m, i) => (
                                    <div key={i} className={`relative rounded-xl p-4 overflow-hidden transition-all hover:shadow-md ${m.accent ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-md shadow-blue-600/25' : 'bg-white border border-slate-200/80 shadow-sm'}`}>
                                        {m.accent && <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/[0.07]" />}
                                        {m.accent && <div className="absolute -bottom-4 -left-4 w-16 h-16 rounded-full bg-white/[0.05]" />}
                                        <div className="relative z-10">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className={`text-[11px] font-bold uppercase tracking-wider ${m.accent ? 'text-blue-100' : 'text-slate-400'}`}>{m.label}</span>
                                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${m.accent ? 'bg-white/20' : 'bg-slate-50 border border-slate-100'}`}>
                                                    <svg className={`w-3.5 h-3.5 ${m.accent ? 'text-white' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" /></svg>
                                                </div>
                                            </div>
                                            <div className={`text-[28px] font-extrabold tracking-tight leading-none ${m.accent ? '' : 'text-slate-900'}`}>{m.value.toLocaleString()}</div>
                                            <div className="flex items-center gap-1.5 mt-2">
                                                {i === 0 && (
                                                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${m.accent ? 'bg-white/20 text-white' : trendUp ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d={trendUp ? "M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" : "M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3"} /></svg>
                                                        {trendUp ? "+" : ""}{moM}%
                                                    </span>
                                                )}
                                                <span className={`text-[11px] font-medium ${m.accent ? 'text-blue-200' : 'text-slate-400'}`}>{m.sub}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* ━━ MIDDLE ROW: Chart + Reminders + Locations ━━ */}
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

                                {/* Application Volume — Pill Bar Chart */}
                                <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 flex flex-col">
                                    <h2 className="text-[14px] font-extrabold text-slate-900 mb-5">Application Volume</h2>
                                    <div className="flex-1 min-h-[200px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={monthlyTrend} margin={{ top: 5, right: 5, left: -15, bottom: 0 }} barGap={4}>
                                                <defs>
                                                    <pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                                                        <line x1="0" y1="0" x2="0" y2="6" stroke="#cbd5e1" strokeWidth="2" />
                                                    </pattern>
                                                </defs>
                                                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }} dy={8} />
                                                <YAxis hide />
                                                <Tooltip content={<ChartTip />} cursor={false} />
                                                <Bar dataKey="count" name="Filings" radius={[99, 99, 99, 99]} barSize={20}>
                                                    {monthlyTrend.map((_, i) => (
                                                        <Cell key={i} fill={[
                                                            "url(#hatch)", "#2563eb", "#60a5fa", "#1e40af", "#93c5fd", "#2563eb", "#3b82f6"
                                                        ][i % 7]} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Approval Progress — Donut */}
                                <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 flex flex-col">
                                    <h2 className="text-[14px] font-extrabold text-slate-900 mb-2">Approval Progress</h2>
                                    <StatusDonut kpis={kpis} />
                                </div>

                                {/* Top Locations — Ranked list */}
                                <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 flex flex-col">
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="text-[14px] font-extrabold text-slate-900">Top Locations</h2>
                                        <Link href="/maps" className="text-[11px] font-bold text-blue-600 hover:text-blue-800 transition-colors">View &rarr;</Link>
                                    </div>
                                    <div className="flex flex-col gap-3.5 flex-1">
                                        {topBarangays.length === 0 ? (
                                            <p className="text-xs text-slate-400 italic text-center mt-4">No data.</p>
                                        ) : (
                                            topBarangays.slice(0, 5).map((b, i) => (
                                                <div key={i} className="flex items-center gap-3">
                                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-extrabold text-white shrink-0 ${
                                                        i === 0 ? 'bg-blue-600' : i === 1 ? 'bg-blue-500' : i === 2 ? 'bg-blue-400' : 'bg-slate-300'
                                                    }`}>{i + 1}</div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-baseline justify-between gap-2 mb-1">
                                                            <span className="text-[12px] font-bold text-slate-800 truncate">{b.barangay}</span>
                                                            <span className="text-[11px] font-extrabold text-slate-900 tabular-nums shrink-0">{b.count}</span>
                                                        </div>
                                                        <div className="h-[4px] rounded-full bg-slate-100 overflow-hidden">
                                                            <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${(b.count / maxBrgy) * 100}%` }} />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* ━━ BOTTOM ROW: Recent Applications + Forecast Card ━━ */}
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pb-6">

                                {/* Recent Applications Table */}
                                <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col">
                                    <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100">
                                        <h2 className="text-[14px] font-extrabold text-slate-900">Recent Applications</h2>
                                        <Link href="/applications" className="h-7 px-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-100 inline-flex items-center transition-colors">
                                            View All
                                        </Link>
                                    </div>
                                    {recent.length === 0 ? (
                                        <div className="p-8 text-center text-[13px] text-slate-400 italic">No applications filed yet.</div>
                                    ) : (
                                        <div className="divide-y divide-slate-50">
                                            {recent.map((app, idx) => (
                                                <Link
                                                    key={app.id}
                                                    href={`/applications/${app.id}`}
                                                    className="flex items-center justify-between px-5 py-3 hover:bg-blue-50/40 transition-colors group"
                                                >
                                                    <div className="flex items-center gap-3.5 min-w-0">
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-extrabold shrink-0 ${AVATAR_COLORS[idx % AVATAR_COLORS.length]}`}>
                                                            {initials(app.applicant_name)}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-[13px] font-bold text-slate-900 truncate group-hover:text-blue-700 transition-colors">
                                                                {app.applicant_name || "Unknown"}
                                                            </p>
                                                            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                                                                Ref No. <span className="font-bold text-slate-600">{app.reference_number || `APP-${app.id}`}</span>
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <StatusPill status={app.status} />
                                                </Link>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Forecast — Premium Dark Card */}
                                <div className="lg:col-span-4 rounded-xl overflow-hidden relative min-h-[260px] shadow-sm">
                                    {/* Layered dark background with texture */}
                                    <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900" />
                                    <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")', backgroundSize: '30px' }} />
                                    {/* Decorative gradient blobs */}
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 rounded-full blur-2xl" />
                                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-400/10 rounded-full blur-2xl" />

                                    <div className="relative z-10 p-5 flex flex-col h-full text-white">
                                        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-300/80 mb-3">Application Forecast</span>

                                        <div className="flex-1 flex flex-col justify-center">
                                            {hasForecast && forecastPreview.length > 0 ? (
                                                <>
                                                    <div className="text-[40px] font-extrabold tracking-tight leading-none">
                                                        {forecastPreview[forecastPreview.length - 1]?.forecast ?? "—"}
                                                    </div>
                                                    <p className="text-[12px] text-slate-400 font-semibold mt-1 mb-4">Projected filings next month</p>
                                                    <div className="h-16">
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <BarChart data={forecastPreview} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                                                <Bar dataKey="historical" name="Historical" fill="rgba(255,255,255,0.15)" radius={[4, 4, 0, 0]} barSize={10} />
                                                                <Bar dataKey="forecast" name="Forecast" fill="#60a5fa" radius={[4, 4, 0, 0]} barSize={10} />
                                                            </BarChart>
                                                        </ResponsiveContainer>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <p className="text-[15px] font-bold text-white/90">Forecast Engine</p>
                                                    <p className="text-[12px] text-slate-400 font-medium mt-1 mb-5">See what's coming next — generate smart predictions for upcoming zoning application trends.</p>
                                                    <Link href="/analytics" className="inline-flex items-center gap-2 w-fit h-9 px-5 rounded-lg bg-blue-600 text-white text-[12px] font-bold hover:bg-blue-500 transition-colors shadow-lg shadow-blue-600/30">
                                                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                                        Run Forecast
                                                    </Link>
                                                </>
                                            )}
                                        </div>

                                        <div className="mt-auto pt-4 border-t border-white/10 flex items-center justify-between text-[11px]">
                                            <span className="text-slate-500 font-semibold">Powered by SARIMAX AI</span>
                                            <Link href="/analytics" className="text-blue-400 font-bold hover:text-blue-300 transition-colors">Analytics &rarr;</Link>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </main>
                </div>
            </div>
        </>
    );
}
