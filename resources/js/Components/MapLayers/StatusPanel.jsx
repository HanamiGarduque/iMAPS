import { Link } from '@inertiajs/react';

export default function StatusPanel({
    total = 0,
    thisMonth = 0,
    review = 0,
    released = 0,
    processingPct = 0,
    reviewPct = 0,
    releasedPct = 0,
    recent = [],
    selectedBgy,
    onClearBgy,
}) {
    const processingCount = Math.max(0, Number(total) - Number(review) - Number(released));

    return (
        <div className="flex flex-col gap-3.5 p-3.5">
            {/* 1. Selected Barangay Spotlight Card (Dynamic on Map Click) */}
            {selectedBgy && (
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 p-4 text-white shadow-md ring-1 ring-white/15 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-blue-500/10 rounded-full blur-xl pointer-events-none" />
                    
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                            <span className="flex h-2 w-2 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400" />
                            </span>
                            <span className="text-[9px] font-bold uppercase tracking-widest text-blue-300">
                                Selected Barangay
                            </span>
                        </div>
                        {onClearBgy && (
                            <button
                                onClick={onClearBgy}
                                className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
                                title="Clear Selection"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>

                    <h3 className="text-base font-black tracking-tight mt-1 text-white">
                        {selectedBgy.name}
                    </h3>

                    {/* Compact Metric Pills */}
                    <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                        <div className="bg-white/10 rounded-xl py-1.5 px-1 border border-white/10">
                            <span className="block text-[8px] font-bold uppercase tracking-wider text-slate-300">Total</span>
                            <span className="text-sm font-black font-mono text-white">{selectedBgy.data?.total || 0}</span>
                        </div>
                        <div className="bg-amber-500/15 rounded-xl py-1.5 px-1 border border-amber-400/20">
                            <span className="block text-[8px] font-bold uppercase tracking-wider text-amber-300">Review</span>
                            <span className="text-sm font-black font-mono text-amber-300">{selectedBgy.data?.review || 0}</span>
                        </div>
                        <div className="bg-emerald-500/15 rounded-xl py-1.5 px-1 border border-emerald-400/20">
                            <span className="block text-[8px] font-bold uppercase tracking-wider text-emerald-300">Released</span>
                            <span className="text-sm font-black font-mono text-emerald-300">{selectedBgy.data?.released || 0}</span>
                        </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between">
                        <span className="text-[10px] text-slate-300">
                            Primary Zone: <strong className="text-white">{selectedBgy.data?.landUse || 'Residential'}</strong>
                        </span>
                        <Link
                            href={`/applications?barangay=${encodeURIComponent(selectedBgy.name)}`}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-200 hover:text-white bg-white/10 hover:bg-white/20 px-2 py-1 rounded-lg transition-all"
                        >
                            <span>Applications</span>
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                        </Link>
                    </div>
                </div>
            )}

            {/* 2. Unified Master KPI & Workload Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
                {/* Top Summary Banner */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">
                            Total Applications
                        </span>
                        <div className="flex items-baseline gap-2 mt-0.5">
                            <span className="text-2xl font-black text-slate-900 font-mono tracking-tight leading-none">
                                {total}
                            </span>
                            <span className="text-[10px] font-semibold text-slate-500">
                                recorded applications
                            </span>
                        </div>
                    </div>

                    <div className="text-right bg-blue-50/80 border border-blue-100 px-2.5 py-1.5 rounded-xl">
                        <span className="text-[8px] font-bold uppercase tracking-wider text-blue-600 block">
                            This Month
                        </span>
                        <span className="text-sm font-black font-mono text-blue-700 leading-none block mt-0.5">
                            {thisMonth}
                        </span>
                    </div>
                </div>

                {/* Status Breakdown Segmented Bar */}
                <div className="mt-3.5">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 mb-1.5">
                        <span className="uppercase tracking-wider">Application Status</span>
                        <span className="font-mono text-slate-400">100%</span>
                    </div>

                    {/* Multi-segment Progress Bar */}
                    <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                        <div
                            className="h-full bg-blue-500 transition-all duration-700 ease-out"
                            style={{ width: `${processingPct || (total > 0 ? (processingCount / total) * 100 : 100)}%` }}
                            title={`In Process: ${processingPct}%`}
                        />
                        <div
                            className="h-full bg-amber-500 transition-all duration-700 ease-out"
                            style={{ width: `${reviewPct}%` }}
                            title={`Under Review: ${reviewPct}%`}
                        />
                        <div
                            className="h-full bg-emerald-500 transition-all duration-700 ease-out"
                            style={{ width: `${releasedPct}%` }}
                            title={`Released: ${releasedPct}%`}
                        />
                    </div>

                    {/* Integrated 3-Column Status Legend & Counts */}
                    <div className="grid grid-cols-3 gap-2 mt-3">
                        <div className="bg-slate-50 border border-slate-100 p-2 rounded-xl text-center">
                            <div className="flex items-center justify-center gap-1.5 mb-1">
                                <span className="w-2 h-2 rounded-full bg-blue-500" />
                                <span className="text-[9px] font-bold text-slate-600 uppercase">In Process</span>
                            </div>
                            <p className="text-sm font-black text-slate-800 font-mono leading-none">
                                {processingCount}
                            </p>
                            <span className="text-[9px] text-slate-400 font-mono mt-0.5 block">{processingPct}%</span>
                        </div>

                        <div className="bg-amber-50/50 border border-amber-100/80 p-2 rounded-xl text-center">
                            <div className="flex items-center justify-center gap-1.5 mb-1">
                                <span className="w-2 h-2 rounded-full bg-amber-500" />
                                <span className="text-[9px] font-bold text-amber-700 uppercase">Review</span>
                            </div>
                            <p className="text-sm font-black text-amber-700 font-mono leading-none">
                                {review}
                            </p>
                            <span className="text-[9px] text-amber-600/80 font-mono mt-0.5 block">{reviewPct}%</span>
                        </div>

                        <div className="bg-emerald-50/50 border border-emerald-100/80 p-2 rounded-xl text-center">
                            <div className="flex items-center justify-center gap-1.5 mb-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                <span className="text-[9px] font-bold text-emerald-700 uppercase">Released</span>
                            </div>
                            <p className="text-sm font-black text-emerald-700 font-mono leading-none">
                                {released}
                            </p>
                            <span className="text-[9px] text-emerald-600/80 font-mono mt-0.5 block">{releasedPct}%</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. Recent Applications Feed */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-600" />
                        <h4 className="text-xs font-bold text-slate-800">
                            Recent Applications
                        </h4>
                    </div>
                    <span className="text-[9px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                        Latest Filings
                    </span>
                </div>

                {(!recent || recent.length === 0) ? (
                    <div className="py-5 px-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
                        <div className="w-8 h-8 rounded-full bg-slate-200/60 text-slate-400 mx-auto flex items-center justify-center mb-1.5">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <p className="text-xs font-semibold text-slate-600">No recent applications found</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">New zoning applications will appear here</p>
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        {recent.slice(0, 4).map((app) => (
                            <div
                                key={app.reference_number || app.id}
                                className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 border border-slate-100 transition-colors"
                            >
                                <div className="min-w-0 flex-1 pr-2">
                                    <p className="text-xs font-bold text-slate-800 truncate">
                                        {app.applicant_name}
                                    </p>
                                    <p className="text-[10px] font-mono text-slate-400 truncate">
                                        {app.reference_number}
                                    </p>
                                </div>
                                <Link
                                    href={`/applications/${app.id}`}
                                    className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors"
                                >
                                    <span>View</span>
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                    </svg>
                                </Link>
                            </div>
                        ))}
                    </div>
                )}

                <Link
                    href="/applications"
                    className="w-full mt-3 flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-blue-700 bg-blue-50/80 hover:bg-blue-100 rounded-xl transition-all"
                >
                    <span>View All Applications</span>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                </Link>
            </div>
        </div>
    );
}
