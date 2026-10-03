// resources/js/Pages/Diagnostics/Index.jsx
import React from "react";
import { Head, router, usePage } from "@inertiajs/react";

/**
 * LOOP 9E/9F - Admin triage list for FieldSync inspector diagnostic reports.
 *
 * WHAT THIS IS
 * ------------
 * A FieldSync Site Inspector submits a support issue into the REMOTE
 * `diagnostic_reports` table. This page is the iMAPS Admin half of that path,
 * which did not exist before this loop.
 *
 * IT IS NOT DELIVERY MONITORING. There is no delivery status, no attempt count,
 * no failure category, no supersession and no queue detail here. Those belong to
 * 9D, on the Applications list, and none of it is duplicated.
 *
 * READ ONLY
 * ---------
 * There is no status control, no edit form, no delete, and no action of any kind
 * that writes remotely. The page states this rather than implying it by the
 * absence of buttons, so an operator knows the boundary is deliberate.
 *
 * FREE TEXT IS ALREADY SANITIZED SERVER-SIDE
 * ------------------------------------------
 * Every string here arrived through `DiagnosticTextSanitizer`. The one live
 * remote report contains a signed Supabase Storage URL - a bearer capability on
 * a private inspection photo - in its `summary`, so this file renders only what
 * the server deemed safe. It deliberately has no link renderer: a URL that
 * survived sanitization is displayed as inert text and is never clickable, so a
 * future change to the sanitizer cannot turn a report into a navigation vector.
 */
export default function Index({ reports = [], loadError = null, readOnly = true }) {
    const { auth } = usePage().props;
    const isAdmin = auth?.user?.role === "Admin";

    const total = reports.length;

    return (
        <>
            <Head title="Diagnostic Reports" />

            <div className="p-4 sm:p-6 space-y-4">
                <header className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-bold text-slate-900">Diagnostic Reports</h1>
                        <p className="text-[12px] text-slate-500 mt-1 max-w-3xl leading-relaxed">
                            Support issues submitted by FieldSync Site Inspectors. These are
                            reports about the FieldSync application itself. They are
                            separate from inspection delivery, which is monitored on the
                            Applications list.
                        </p>
                    </div>

                    {readOnly && (
                        <span className="shrink-0 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-300">
                            Read only
                        </span>
                    )}
                </header>

                {loadError && (
                    <div role="alert" className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                        <p className="text-[13px] font-bold text-amber-800">{loadError}</p>
                        <p className="text-[12px] text-amber-700 mt-0.5">
                            This does not indicate a problem with the reports themselves.
                        </p>
                    </div>
                )}

                {!isAdmin && (
                    <div role="alert" className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                        <p className="text-[13px] font-bold text-amber-800">
                            This area is restricted to administrators.
                        </p>
                    </div>
                )}

                {/* Sanitized remote prose is only ever rendered as inert plain
                    text. `whitespace-pre-wrap` preserves the inspector's line
                    breaks without introducing any markup surface. */}
                {isAdmin && total > 0 && !loadError && (
                    <p className="text-[11px] text-slate-400 leading-relaxed whitespace-pre-wrap">
                        Report text is sanitized server-side before it is displayed.
                        Links and credentials pasted into a report are removed.
                    </p>
                )}

                {isAdmin && total === 0 && !loadError && (
                    <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-center">
                        <p className="text-[13px] font-bold text-slate-700">No diagnostic reports</p>
                        <p className="text-[12px] text-slate-500 mt-1">
                            No FieldSync inspector has submitted a report yet.
                        </p>
                    </div>
                )}

                {isAdmin && total > 0 && (
                    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            {total} {total === 1 ? "report" : "reports"}
                        </div>

                        <ul className="divide-y divide-slate-100">
                            {reports.map((report) => (
                                <li key={report.id}>
                                    <button
                                        type="button"
                                        onClick={() => router.visit(`/diagnostics/${report.id}`)}
                                        className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
                                    >
                                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                                            <span className="text-[12px] font-bold text-slate-800">
                                                {report.reference_code || "Unreferenced"}
                                            </span>
                                            {report.module && (
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                                    {report.module}
                                                </span>
                                            )}
                                            {report.status && (
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                                                    {report.status}
                                                </span>
                                            )}
                                        </div>

                                        <p className="text-[13px] font-semibold text-slate-900 mt-1 break-words">
                                            {report.title || "(no title)"}
                                        </p>

                                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-slate-500">
                                            {/* Identity is shown only as the server
                                                resolved it. The server never guesses
                                                a person from a remote uuid. */}
                                            <span>
                                                Inspector: {report.inspector?.label || "Unresolved inspector"}
                                            </span>
                                            {report.created_at && (
                                                <span>Submitted: {formatDate(report.created_at)}</span>
                                            )}
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </>
    );
}

function formatDate(value) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}
