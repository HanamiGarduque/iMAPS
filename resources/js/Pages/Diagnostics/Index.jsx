// resources/js/Pages/Diagnostics/Index.jsx
import React, { useEffect, useState } from "react";
import { Head, router, usePage } from "@inertiajs/react";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";

/**
 * LOOP 9E/9F - read-only list of FieldSync inspector diagnostic reports.
 *
 * WHAT THIS IS
 * ------------
 * A FieldSync Site Inspector submits a support issue into the REMOTE
 * `diagnostic_reports` table. This page is the iMAPS read half of that path,
 * which did not exist before this loop.
 *
 * POST-LOOP-9 SMOKE FIX - WHO CAN BE HERE
 * --------------------------------------
 * Admin AND Planning Officer. A Planning Officer is the role that resolves
 * day-to-day operational issues inside MPDO, so they need to read the report
 * to act on it. A Site Inspector is refused by the server (`role:Admin,Planning
 * Officer`) and additionally gets no navigation entry at all, because they
 * submit through FieldSync only.
 *
 * This is READ access. It is not authorship: the report's summary, technical
 * description, reproduction steps and submitted metadata stay immutable here.
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
 * APP SHELL
 * ---------
 * This page previously rendered with no `Header` and no `Sidebar`, so it looked
 * like a separate system: no navigation, no way back, no sign-out. It now uses
 * the same `Header` + `Sidebar` composition as the other authenticated pages.
 * It does NOT introduce a second navigation system - it reuses the existing
 * components, and `activePage` is what marks the current section.
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

    // Post-Loop 9 smoke fix: READ access is shared by Admin and Planning
    // Officer, matching the server's `role:Admin,Planning Officer`. `isAdmin`
    // is retained only where the page must behave differently BY ROLE.
    //
    // This is presentation, not the boundary. A Planning Officer reaching this
    // page is a legitimate reader; the server still refuses a Site Inspector
    // and still refuses anyone trying to write.
    const userRoleValue = auth?.user?.role || "";
    const isAdmin = userRoleValue === "Admin";
    const canRead = isAdmin || userRoleValue === "Planning Officer";

    // ── Post-Loop 9 smoke fix: the shared authenticated shell ───────────────
    // Same composition as Notifications/Index.jsx and the other authenticated
    // pages. Diagnostics is reachable by Admin and Planning Officer, and both
    // are on the existing nav; a Site Inspector never receives this page.
    const [clock, setClock] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const userName = auth?.user?.name || "Planning Officer";
    const userRole = auth?.user?.role || "Planning Officer";

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

    const total = reports.length;

    return (
        <>
            <Head title="Diagnostic Reports" />

            <div id="diagnostics-page-root" className="bg-slate-50/75 text-slate-800 h-screen flex flex-col overflow-hidden antialiased">
            <Header
                userName={userName}
                userRole={userRole}
                clock={clock}
                onLogout={handleLogout}
                sidebarOpen={sidebarOpen}
                setSidebarOpen={setSidebarOpen}
                activePage="diagnostics"
            />

            <div className="flex-1 overflow-hidden relative flex flex-col min-w-0">
            <Sidebar
                userName={userName}
                userRole={userRole}
                sidebarOpen={sidebarOpen}
                setSidebarOpen={setSidebarOpen}
                onLogout={handleLogout}
                activePage="diagnostics"
            />

            {sidebarOpen && (
                <div
                    onClick={() => setSidebarOpen(false)}
                    className="absolute inset-0 bg-slate-900/20 backdrop-blur-xs z-[750] transition-opacity duration-200"
                />
            )}

            <main className="flex-1 w-full h-full flex flex-col overflow-hidden">
            <div className="p-4 sm:p-6 space-y-4 flex-1 overflow-y-auto max-w-6xl mx-auto w-full">
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

                {!canRead && (
                    <div role="alert" className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                        <p className="text-[13px] font-bold text-amber-800">
                            This area is restricted to administrators and Planning
                            Officers.
                        </p>
                    </div>
                )}

                {/* Sanitized remote prose is only ever rendered as inert plain
                    text. `whitespace-pre-wrap` preserves the inspector's line
                    breaks without introducing any markup surface. */}
                {canRead && total > 0 && !loadError && (
                    <p className="text-[11px] text-slate-400 leading-relaxed whitespace-pre-wrap">
                        Report text is sanitized server-side before it is displayed.
                        Links and credentials pasted into a report are removed.
                    </p>
                )}

                {canRead && total === 0 && !loadError && (
                    <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-center">
                        <p className="text-[13px] font-bold text-slate-700">No diagnostic reports</p>
                        <p className="text-[12px] text-slate-500 mt-1">
                            No FieldSync inspector has submitted a report yet.
                        </p>
                    </div>
                )}

                {canRead && total > 0 && (
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
            </main>
            </div>
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
