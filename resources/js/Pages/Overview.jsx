import { Component, Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Head, Link, usePage } from "@inertiajs/react";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import MapSkeleton from "@/Components/Dashboard/MapSkeleton";
import { STATUS_MARKER_CONFIG, getStatusMarkerConfig } from "@/Components/MapLayers/StatusPanel";
import { DIVERSITY_TIERS, getDiversityTheme } from "@/utils/diversityTheme";
import { confirmSignOut } from "@/utils/signOut";

// The same 3D diversity view the GIS dashboard uses; its own chunk (maplibre-gl).
const MapLibre3DView = lazy(() => import("@/Components/MapLayers/MapLibre3DView"));

// Rosario's own clock, whatever the viewer's machine is set to.
const TZ = "Asia/Manila";

// The preview is far smaller than the dashboard canvas: centre Rosario rather
// than leaving room for the dashboard's side panels, and pull the camera back
// one zoom level for every halving of the canvas height.
const MAP_FRAME = { top: 0, bottom: 80, left: 10, right: 10 };
const zoomForHeight = (h) => Math.min(11, Math.max(9.4, 10.5 + Math.log2(Math.max(160, h) / 440)));

const ICONS = {
    plus: "M12 4.5v15m7.5-7.5h-15",
    search: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
    draft: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10",
    registry: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
    inspect: "M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z",
    bell: "M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0",
    check: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    inbox: "M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M2.25 13.5V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.5M2.25 13.5l2.4-7.2A2.25 2.25 0 016.79 4.5h10.42a2.25 2.25 0 012.14 1.8l2.4 7.2",
    calendar: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
    cube: "M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9",
    alert: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
    trend: "M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941",
    spark: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z",
    arrow: "M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3",
    chevron: "M8.25 4.5l7.5 7.5-7.5 7.5",
    close: "M6 18L18 6M6 6l12 12",
};

function Icon({ name, className = "w-4 h-4", strokeWidth = 1.8 }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={strokeWidth} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[name]} />
        </svg>
    );
}

const fmt = (date, opts) => new Intl.DateTimeFormat("en-PH", { timeZone: TZ, ...opts }).format(date);
const num = (n) => Number(n || 0).toLocaleString("en-PH");
const plural = (n, word) => `${num(n)} ${word}${n === 1 ? "" : "s"}`;

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white";
// Inner tiles: white and bordered like the header's own pills and panels.
const TILE = "rounded-2xl bg-white/80 border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(30,58,138,0.25)]";

// A WebGL failure in the 3D view must not take the rest of the overview down.
class MapBoundary extends Component {
    state = { failed: false };
    static getDerivedStateFromError() {
        return { failed: true };
    }
    render() {
        if (this.state.failed) {
            return (
                <p className="absolute inset-0 grid place-items-center px-6 text-center text-[12px] text-slate-500">
                    The 3D preview isn't available on this device.
                </p>
            );
        }
        return this.props.children;
    }
}

function MiniTile({ icon, title, chip, href, children }) {
    const Box = href ? Link : "div";
    return (
        <Box href={href} className={`${TILE} p-3.5 flex flex-col min-w-0 ${href ? `hover:bg-white hover:border-blue-200 transition-colors ${FOCUS}` : ""}`}>
            <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 min-w-0">
                    <Icon name={icon} className="w-3.5 h-3.5 text-blue-600 shrink-0" strokeWidth={2} />
                    <span className="text-[11.5px] font-semibold text-slate-600 truncate">{title}</span>
                </span>
                {chip && <span className="hidden sm:inline shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-slate-500">{chip}</span>}
            </div>
            <div className="mt-3">{children}</div>
        </Box>
    );
}

export default function Overview({
    statusCounts = {},
    thisMonth = 0,
    lastMonth = 0,
    bgyStats = {},
    municipalDiversity = 0,
    unreadCount = 0,
    latestUnread = null,
    draftCount = null,
    upcomingInspections = null,
    pastSla = 0,
    ageing = 0,
}) {
    const { auth } = usePage().props;
    const userName = auth?.user?.name || "Staff";
    const userRole = auth?.user?.role || "Planning Officer";
    const isAdmin = userRole === "Admin";
    const firstName = userName.trim().split(/\s+/)[0];

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [selectedBgy, setSelectedBgy] = useState(null);
    const [hoveredBgy, setHoveredBgy] = useState(null);
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 30000);
        return () => clearInterval(id);
    }, []);
    const headerClock = `${fmt(now, { month: "short", day: "numeric", year: "numeric" })} · ${fmt(now, { hour: "2-digit", minute: "2-digit" })}`;

    // The preview's zoom depends on its height, so measure the box before the
    // lazy 3D view mounts into it.
    const mapBoxRef = useRef(null);
    const [mapZoom, setMapZoom] = useState(null);
    useLayoutEffect(() => {
        if (mapBoxRef.current) setMapZoom(zoomForHeight(mapBoxRef.current.clientHeight));
    }, []);

    // Escape steps back out of a barangay the preview flew into.
    useEffect(() => {
        if (!selectedBgy) return;
        const onKey = (e) => e.key === "Escape" && !sidebarOpen && setSelectedBgy(null);
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [selectedBgy, sidebarOpen]);

    // Raw status strings grouped the same way the map and registry colour them.
    const pipeline = useMemo(() => {
        const keyByConfig = new Map(Object.entries(STATUS_MARKER_CONFIG).map(([k, v]) => [v, k]));
        const counts = {};
        Object.entries(statusCounts || {}).forEach(([status, n]) => {
            const key = keyByConfig.get(getStatusMarkerConfig(status));
            counts[key] = (counts[key] || 0) + Number(n || 0);
        });
        return Object.keys(STATUS_MARKER_CONFIG).map((key) => ({ key, ...STATUS_MARKER_CONFIG[key], count: counts[key] || 0 }));
    }, [statusCounts]);

    const total = pipeline.reduce((sum, s) => sum + s.count, 0);
    const reviewCount = pipeline.find((s) => s.key === "Technical Review")?.count || 0;
    const delta = thisMonth - lastMonth;
    const lastMonthShort = fmt(new Date(now.getFullYear(), now.getMonth() - 1, 15), { month: "short" });

    const municipalTier = getDiversityTheme(municipalDiversity);
    const selectedStat = selectedBgy ? bgyStats?.[selectedBgy.name] : null;
    const selectedTier = selectedStat ? getDiversityTheme(selectedStat.diversity) : null;

    const actions = isAdmin
        ? [
              { href: "/applications", icon: "registry", label: "Open the registry", meta: `${plural(total, "record")} on file` },
              { href: "/technical-review", icon: "search", label: "Technical review queue", meta: reviewCount ? `${num(reviewCount)} awaiting evaluation` : "Queue is clear" },
              { href: "/site-inspections", icon: "inspect", label: "Site inspections", meta: upcomingInspections ? `${num(upcomingInspections)} scheduled ahead` : "None scheduled ahead" },
          ]
        : [
              { href: "/applications/encode", icon: "plus", label: "Encode a new application", meta: "Start a zoning clearance record" },
              { href: "/technical-review", icon: "search", label: "Technical review queue", meta: reviewCount ? `${num(reviewCount)} awaiting evaluation` : "Queue is clear" },
              { href: "/applications/drafts", icon: "draft", label: "Resume saved drafts", meta: draftCount ? `${plural(draftCount, "draft")} in progress` : "No drafts saved" },
          ];

    return (
        <>
            <Head title="Overview | iMAPS" />
            <style>{`@keyframes wave { 0%, 60%, 100% { transform: rotate(0deg); } 15%, 45% { transform: rotate(14deg); } 30% { transform: rotate(-8deg); } }`}</style>

            <div className="h-screen flex flex-col overflow-hidden bg-[#f5f7fb] text-slate-800 antialiased">
                <Header
                    userName={userName}
                    userRole={userRole}
                    clock={headerClock}
                    onLogout={confirmSignOut}
                    sidebarOpen={sidebarOpen}
                    setSidebarOpen={setSidebarOpen}
                    activePage="overview"
                />

                <div className="flex-1 relative overflow-hidden flex flex-col min-w-0">
                    <Sidebar
                        userName={userName}
                        userRole={userRole}
                        sidebarOpen={sidebarOpen}
                        setSidebarOpen={setSidebarOpen}
                        onLogout={confirmSignOut}
                        activePage="overview"
                    />
                    {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="absolute inset-0 bg-slate-900/20 z-[750]" aria-hidden="true" />}

<main className="relative flex-1 overflow-y-auto bg-gradient-to-br from-[#fbfcff] via-[#f5f8fd] to-[#edf2fb]">
                        {/* Faint depth behind the tiles: the header's blue, diffused */}
                        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                            <div className="absolute -top-48 -left-40 w-[640px] h-[640px] rounded-full bg-sky-100/80 blur-[120px]" />
                            <div className="absolute top-[20%] right-[-10%] w-[560px] h-[560px] rounded-full bg-indigo-100/70 blur-[120px]" />
                        </div>

                        <section aria-labelledby="overview-greeting" className="relative min-h-full flex flex-col animate-in fade-in duration-500">
                            <div className="flex-1 w-full max-w-[1600px] mx-auto flex flex-col gap-5 px-4 sm:px-6 lg:px-8 py-5 lg:py-6">
                                <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-5 lg:gap-8">
                                    {/* ── Welcome: centred against the map so neither column ends in empty space ── */}
                                    <div className="min-w-0 flex flex-col lg:justify-center lg:pb-6">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200/70 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" aria-hidden="true" />
                                                MPDO Rosario, Batangas
                                            </span>
                                            <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                                                {userRole}
                                            </span>
                                        </div>

                                        <p className="mt-5 inline-flex items-center gap-1.5 text-[12px] text-slate-500">
                                            <Icon name="calendar" className="w-3.5 h-3.5" />
                                            {fmt(now, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                                        </p>

                                        <h1 id="overview-greeting" className="mt-2 text-[34px] sm:text-[42px] 2xl:text-[54px] leading-[1.06] font-extrabold tracking-tight text-slate-800">
                                            Welcome back,
                                            <span className="block">
                                                <span className="bg-gradient-to-r from-blue-600 via-indigo-500 to-sky-500 bg-clip-text text-transparent">{firstName}</span>{" "}
                                                <span className="inline-block origin-[70%_70%] motion-safe:animate-[wave_1.8s_ease-in-out_1]" aria-hidden="true">👋</span>
                                            </span>
                                        </h1>

                                        {/* ── Today's briefing: what this page is showing, in a sentence or three ── */}
                                        <section aria-label="Today's briefing" className="mt-5 2xl:mt-7 max-w-xl rounded-2xl bg-gradient-to-br from-blue-50/90 to-indigo-50/70 border border-blue-100/80 px-4 py-3.5 2xl:px-5 2xl:py-4">
                                            <div className="flex items-start gap-3">
                                                <span className="grid place-items-center w-8 h-8 shrink-0 rounded-lg bg-white text-blue-600 border border-blue-100 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
                                                    <Icon name="spark" className="w-4 h-4" strokeWidth={1.9} />
                                                </span>
                                                <div className="min-w-0 text-[13px] 2xl:text-[14px] leading-relaxed text-slate-600">
                                                    <p className="font-semibold text-slate-800">Here's Rosario at a glance today.</p>
                                                    <p className="mt-1">
                                                        {pastSla > 0 ? (
                                                            <>
                                                                <b className="font-semibold text-rose-600">{plural(pastSla, "application")}</b> {pastSla === 1 ? "is" : "are"} past the 14-day processing window
                                                            </>
                                                        ) : (
                                                            "Every open application is within the 14-day processing window"
                                                        )}
                                                        {reviewCount > 0 ? (
                                                            <>
                                                                , and <b className="font-semibold text-slate-800">{num(reviewCount)}</b> {reviewCount === 1 ? "waits" : "wait"} in technical review.
                                                            </>
                                                        ) : (
                                                            "."
                                                        )}{" "}
                                                        <b className="font-semibold text-slate-800">{num(thisMonth)}</b> {thisMonth === 1 ? "was" : "were"} filed this month, and the municipality's land-use mix stands at{" "}
                                                        <b className="font-semibold text-slate-800">{Number(municipalDiversity).toFixed(2)}</b> ({municipalTier.shortLabel.toLowerCase()}) — explore it barangay by barangay on the map.
                                                    </p>
                                                </div>
                                            </div>
                                        </section>

                                        <nav aria-label="Quick actions" className="mt-4 2xl:mt-5 max-w-xl">
                                            <ul className="flex flex-col gap-2">
                                                {actions.map((a) => (
                                                    <li key={a.href}>
                                                        <Link
                                                            href={a.href}
                                                            className={`group flex items-center gap-3 w-full rounded-xl bg-white/80 border border-slate-200/70 pl-2 pr-3.5 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:bg-white hover:border-blue-200 hover:shadow-[0_8px_20px_-12px_rgba(37,99,235,0.45)] ${FOCUS}`}
                                                        >
                                                            <span className="grid place-items-center w-8 h-8 shrink-0 rounded-lg bg-blue-600 text-white shadow-[0_4px_10px_-4px_rgba(37,99,235,0.7)]">
                                                                <Icon name={a.icon} className="w-4 h-4" strokeWidth={2} />
                                                            </span>
                                                            <span className="min-w-0 flex-1">
                                                                <span className="block text-[13px] font-semibold text-slate-800 leading-tight">{a.label}</span>
                                                                <span className="block mt-0.5 text-[11.5px] text-slate-500 leading-tight truncate">{a.meta}</span>
                                                            </span>
                                                            <Icon name="arrow" className="w-4 h-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600" strokeWidth={2} />
                                                        </Link>
                                                    </li>
                                                ))}
                                            </ul>
                                        </nav>


                                    </div>

                                    {/* ── Today + Rosario preview ── */}
                                    <div className="min-w-0 flex flex-col gap-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <MiniTile icon="alert" title="Needs attention" chip="SLA" href="/applications">
                                                <p className={`text-[22px] leading-none font-bold tracking-tight tabular-nums ${pastSla > 0 ? "text-rose-600" : "text-slate-900"}`}>{num(pastSla)}</p>
                                                <p className="mt-1 text-[11px] text-slate-500">
                                                    Past the 14-day SLA
                                                    <span className="text-slate-400"> · {num(ageing)} ageing</span>
                                                </p>
                                            </MiniTile>
                                            <MiniTile icon="trend" title="Filed this month" chip={fmt(now, { month: "short" })} href="/applications">
                                                <p className="text-[22px] leading-none font-bold tracking-tight tabular-nums text-slate-900">{num(thisMonth)}</p>
                                                <p className={`mt-1 text-[11px] ${delta > 0 ? "text-emerald-700" : "text-slate-500"}`}>
                                                    {delta === 0 ? `Same as ${lastMonthShort}` : `${delta > 0 ? "▲" : "▼"} ${num(Math.abs(delta))} vs ${lastMonthShort}`}
                                                    <span className="text-slate-400"> · {num(total)} total</span>
                                                </p>
                                            </MiniTile>
                                        </div>

                                        <div className={`${TILE} flex-1 p-3.5 flex flex-col min-h-[300px]`}>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="flex items-center gap-1.5 min-w-0">
                                                    <Icon name="cube" className="w-3.5 h-3.5 text-blue-600 shrink-0" strokeWidth={2} />
                                                    <h2 className="text-[11.5px] font-semibold text-slate-600 truncate">Land-use diversity</h2>
                                                    <span className="hidden sm:inline text-[11px] text-slate-400 truncate">
                                                        · Rosario <b className="font-bold text-slate-800 tabular-nums">{Number(municipalDiversity).toFixed(2)}</b> {municipalTier.shortLabel}
                                                    </span>
                                                </span>
                                                <Link href="/dashboard" className={`shrink-0 inline-flex items-center gap-0.5 rounded-md text-[11.5px] font-semibold text-blue-600 hover:text-blue-700 ${FOCUS}`}>
                                                    Open GIS map
                                                    <Icon name="chevron" className="w-3 h-3" strokeWidth={2.4} />
                                                </Link>
                                            </div>

                                            <div ref={mapBoxRef} className="relative mt-2.5 flex-1 min-h-[200px] rounded-xl overflow-hidden bg-[#f8f9fa] border border-slate-200/60">
                                                {mapZoom !== null && (
                                                    <MapBoundary>
                                                        <Suspense fallback={<MapSkeleton visible label="Loading 3D view…" tone="#f8f9fa" />}>
                                                            <MapLibre3DView
                                                                active
                                                                controls={false}
                                                                bgyStats={bgyStats}
                                                                selectedBgy={selectedBgy}
                                                                onFeatureClick={(name) => setSelectedBgy(name ? { name } : null)}
                                                                onMapClick={() => setSelectedBgy(null)}
                                                                rightPanelOpen={false}
                                                                hoveredBgy={hoveredBgy}
                                                                onHoverBgy={setHoveredBgy}
                                                                baseZoom={mapZoom}
                                                                framePadding={MAP_FRAME}
                                                            />
                                                        </Suspense>
                                                    </MapBoundary>
                                                )}

                                                {selectedBgy ? (
                                                    <div className="absolute top-2 left-2 right-2 z-[460] flex items-center gap-2 rounded-lg bg-white/95 border border-slate-200/70 shadow-sm px-2.5 py-1.5 text-[11.5px]" aria-live="polite">
                                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: selectedTier?.fill || "#94a3b8" }} aria-hidden="true" />
                                                        <b className="font-semibold text-slate-900 truncate">{selectedBgy.name}</b>
                                                        <span className="text-slate-500 truncate">
                                                            {selectedStat ? `${Number(selectedStat.diversity).toFixed(2)} · ${selectedTier.shortLabel} · ${plural(selectedStat.Total, "application")}` : "No zoning data"}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedBgy(null)}
                                                            aria-label="Back to all of Rosario"
                                                            className={`ml-auto grid place-items-center w-5 h-5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0 ${FOCUS}`}
                                                        >
                                                            <Icon name="close" className="w-3 h-3" strokeWidth={2.4} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <p className="absolute bottom-2 left-2 z-[460] rounded-md bg-white/85 px-2 py-1 text-[10.5px] text-slate-500 pointer-events-none">
                                                        Drag to orbit · click a barangay
                                                    </p>
                                                )}

                                                {/* Legend */}
                                                <div className="absolute bottom-2 right-2 z-[460] rounded-md bg-white/90 px-2 py-1.5 pointer-events-none">
                                                    <div className="flex h-1.5 w-28 rounded-full overflow-hidden" aria-hidden="true">
                                                        {[...DIVERSITY_TIERS].reverse().map((t) => (
                                                            <span key={t.id} className="flex-1" style={{ background: t.fill }} />
                                                        ))}
                                                    </div>
                                                    <div className="mt-0.5 flex justify-between text-[9.5px] font-medium text-slate-500">
                                                        <span>Low mix</span>
                                                        <span>High mix</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ── Notification bar ── */}
                            <Link
                                href="/notifications"
                                className={`border-t text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/60 ${
                                    unreadCount > 0 ? "border-blue-100 bg-blue-50/70 text-slate-700 hover:bg-blue-50" : "border-slate-200/70 bg-white/60 text-slate-600 hover:bg-white"
                                }`}
                            >
                                <span className="w-full max-w-[1600px] mx-auto flex items-center gap-2.5 px-4 sm:px-6 lg:px-8 py-2.5">
                                    <span className="relative shrink-0 text-blue-600">
                                        <Icon name={unreadCount > 0 ? "bell" : "check"} className="w-4 h-4" strokeWidth={2} />
                                        {unreadCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-rose-500" aria-hidden="true" />}
                                    </span>
                                    <span className="min-w-0 truncate">
                                        {unreadCount > 0 ? (
                                            <>
                                                <b className="font-semibold text-slate-900">{plural(unreadCount, "unread notification")}</b>
                                                {latestUnread && <span className="text-slate-500"> — {latestUnread}</span>}
                                            </>
                                        ) : (
                                            "You're all caught up. No unread notifications."
                                        )}
                                    </span>
                                    <span className="ml-auto shrink-0 inline-flex items-center gap-0.5 font-semibold text-blue-600">
                                        Open inbox
                                        <Icon name="chevron" className="w-3 h-3" strokeWidth={2.4} />
                                    </span>
                                </span>
                            </Link>
                        </section>
                    </main>
                </div>
            </div>
        </>
    );
}
