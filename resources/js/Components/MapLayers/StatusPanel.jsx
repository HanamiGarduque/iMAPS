import { Link } from '@inertiajs/react'
import StatBar from '../StatBar'

export default function StatusPanel({ total, thisMonth, review, released, processingPct, reviewPct, releasedPct, recent }) {
    return (
        <div>
            <div className="p-4 panel-section border-t-0 mt-0">
                <div className="grid grid-cols-2 gap-3">
                    <div className="metric-card bg-slate-50">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Apps</p>
                        <p className="text-2xl font-bold text-slate-800 font-mono mt-1">{total}</p>
                    </div>
                    <div className="metric-card bg-blue-50 border-blue-100">
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">This Month</p>
                        <p className="text-2xl font-bold text-blue-700 font-mono mt-1">{thisMonth}</p>
                    </div>
                    <div className="metric-card bg-amber-50 border-amber-100">
                        <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">In Review</p>
                        <p className="text-2xl font-bold text-amber-600 font-mono mt-1">{review}</p>
                    </div>
                    <div className="metric-card bg-emerald-50 border-emerald-100">
                        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Released</p>
                        <p className="text-2xl font-bold text-emerald-600 font-mono mt-1">{released}</p>
                    </div>
                </div>
            </div>

            <div className="panel-section">
                <div className="rs-section-head flex justify-between items-center">
                    <span>Status Breakdown</span>
                </div>
                <div className="px-4 pb-4 space-y-4 mt-1">
                    <StatBar label="Processing" pct={processingPct} color="#3b82f6" />
                    <StatBar label="Under Review" pct={reviewPct} color="#f59e0b" />
                    <StatBar label="Released" pct={releasedPct} color="#10b981" />
                </div>
            </div>

            <div className="panel-section pb-4">
                <div className="rs-section-head">Recent Applications</div>
                <div className="px-4">
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                        <table className="app-table">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th>App ID</th>
                                    <th>Applicant Name</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody className="bg-white">
                                {(recent ?? []).map((app) => (
                                    <tr key={app.reference_number}>
                                        <td className="font-mono text-slate-500">{app.reference_number}</td>
                                        <td className="font-medium">{app.applicant_name}</td>
                                        <td className="text-right">
                                            <a href={`/applications/${app.id}`} className="view-link text-xs">View</a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Link href="/applications">
                        <button className="w-full mt-3 py-2 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                            View All Applications
                        </button>
                    </Link>
                </div>
            </div>
        </div>
    )
}
