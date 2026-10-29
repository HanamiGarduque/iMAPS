import React, { useState, useEffect } from "react";
import { Head, router, Link } from "@inertiajs/react";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import { confirmSignOut } from "@/utils/signOut";

const formatDateTime = (value) =>
    value
        ? new Date(value).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
        : "—";

export default function Index({ logs, actions = [], filters = {}, auth = {} }) {
    const [clock, setClock] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [search, setSearch] = useState(filters.search || "");
    const userName = auth?.user?.name || "Administrator";
    const userRole = auth?.user?.role || "Admin";

    useEffect(() => {
        const tick = () => setClock(new Date().toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }));
        tick();
        const timer = setInterval(tick, 60000);
        return () => clearInterval(timer);
    }, []);

    const apply = (next) =>
        router.get("/audit-trail", { search, action: filters.action, ...next }, { preserveState: true, replace: true });

    return (
        <>
            <Head title="Audit Trail | iMAPS" />
            <div className="bg-slate-50/75 text-slate-800 h-screen flex flex-col overflow-hidden antialiased">
                <Header
                    userName={userName}
                    userRole={userRole}
                    clock={clock}
                    onLogout={confirmSignOut}
                    sidebarOpen={sidebarOpen}
                    setSidebarOpen={setSidebarOpen}
                    activePage="audit-log"
                />
                <div className="flex-1 overflow-hidden relative flex flex-col min-w-0">
                    <Sidebar
                        userName={userName}
                        userRole={userRole}
                        sidebarOpen={sidebarOpen}
                        setSidebarOpen={setSidebarOpen}
                        onLogout={confirmSignOut}
                        activePage="audit-log"
                    />
                    {sidebarOpen && (
                        <div onClick={() => setSidebarOpen(false)} className="absolute inset-0 bg-slate-900/20 backdrop-blur-xs z-[750]" />
                    )}

                    <main className="flex-1 w-full h-full flex flex-col overflow-hidden">
                        <div className="p-4 sm:p-6 flex-1 flex flex-col h-full min-h-0 max-w-[1580px] mx-auto w-full">
                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col flex-1 min-h-0">
                                {/* Title band, same as the other modules */}
                                <div className="bg-slate-100/80 border-b border-slate-200 shrink-0 px-5 py-3 flex items-center gap-3 min-w-0">
                                    <div className="flex items-baseline gap-2.5 min-w-0">
                                        <h1 className="text-[16px] font-bold text-slate-900 tracking-tight">Audit Trail</h1>
                                        <p className="text-[12px] text-slate-500 truncate">Every recorded action on applications and accounts</p>
                                    </div>
                                    <Link
                                        href="/users"
                                        className="ml-auto inline-flex items-center h-9 px-3.5 rounded-lg border border-slate-300 bg-white shadow-sm shadow-slate-900/5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                                    >
                                        ← User Management
                                    </Link>
                                </div>

                                {/* Toolbar */}
                                <form
                                    onSubmit={(e) => { e.preventDefault(); apply({}); }}
                                    className="px-4 py-3 border-b border-slate-200/80 flex flex-wrap items-center gap-2 shrink-0"
                                >
                                    <input
                                        type="search"
                                        value={search}
                                        maxLength={100}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Search reference, applicant or user…"
                                        aria-label="Search audit trail"
                                        className="w-full sm:w-72 h-9 rounded-lg border border-slate-200 bg-slate-50/60 px-3 text-[13px] text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 placeholder:text-slate-400"
                                    />
                                    <select
                                        value={filters.action || ""}
                                        onChange={(e) => apply({ action: e.target.value })}
                                        aria-label="Filter by action"
                                        className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-700 focus:outline-none focus:border-blue-500"
                                    >
                                        <option value="">All actions</option>
                                        {actions.map((a) => <option key={a} value={a}>{a}</option>)}
                                    </select>
                                </form>

                                {/* Table */}
                                <div className="flex-1 min-h-0 overflow-auto bg-slate-50/70">
                                    {logs.data.length === 0 ? (
                                        <p className="p-12 text-center text-sm text-slate-500">No audit entries match your search.</p>
                                    ) : (
                                        <table className="w-full min-w-[800px] text-left border-collapse bg-white text-[13px]">
                                            <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                                                <tr>
                                                    <th className="px-5 py-2.5 font-semibold">When</th>
                                                    <th className="px-3 py-2.5 font-semibold">Action</th>
                                                    <th className="px-3 py-2.5 font-semibold">Performed by</th>
                                                    <th className="px-3 py-2.5 font-semibold">Application</th>
                                                    <th className="px-3 py-2.5 font-semibold">Note</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {logs.data.map((log) => (
                                                    <tr key={log.id} className="align-top hover:bg-slate-50/60">
                                                        <td className="px-5 py-2.5 whitespace-nowrap text-slate-600">{formatDateTime(log.performed_at)}</td>
                                                        <td className="px-3 py-2.5 whitespace-nowrap font-medium text-slate-900">{log.action}</td>
                                                        <td className="px-3 py-2.5 whitespace-nowrap text-slate-700">{log.performed_by_name || "—"}</td>
                                                        <td className="px-3 py-2.5">
                                                            {log.reference_number ? (
                                                                <>
                                                                    <p className="font-medium text-slate-800">{log.reference_number}</p>
                                                                    <p className="text-xs text-slate-500">Form No. {log.form_number || "—"}</p>
                                                                    <p className="text-xs text-slate-500">{log.applicant_name}</p>
                                                                </>
                                                            ) : "—"}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-slate-600 max-w-md break-words">{log.note || "—"}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>

                                {/* Pagination */}
                                <div className="shrink-0 border-t border-slate-200 px-4 py-2.5 flex items-center justify-between gap-3">
                                    <p className="text-xs text-slate-500">
                                        Showing <span className="font-semibold text-slate-800">{logs.from ?? 0}–{logs.to ?? 0}</span> of{" "}
                                        <span className="font-semibold text-slate-800">{logs.total}</span> entries
                                    </p>
                                    <div className="flex items-center gap-1">
                                        {logs.links.map((link, i) => (
                                            <button
                                                key={i}
                                                disabled={!link.url || link.active}
                                                onClick={() => link.url && router.get(link.url, {}, { preserveState: true })}
                                                className={`inline-flex items-center justify-center min-w-[32px] h-8 px-2 rounded-lg text-xs font-medium border cursor-pointer ${link.active
                                                    ? "bg-blue-600 border-blue-600 text-white font-semibold"
                                                    : !link.url
                                                        ? "opacity-30 cursor-not-allowed border-slate-200 bg-white text-slate-400"
                                                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                                            >
                                                {link.label.replace("&laquo;", "«").replace("&raquo;", "»")}
                                            </button>
                                        ))}
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
