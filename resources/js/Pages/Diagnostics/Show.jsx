// resources/js/Pages/Diagnostics/Show.jsx
import React, { useEffect, useState } from "react";
import { Head, Link, router, usePage } from "@inertiajs/react";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";

/**
 * LOOP 9E/9F - one FieldSync inspector diagnostic report, read only.
 *
 * POST-LOOP-9 SMOKE FIX - WHO CAN BE HERE
 * --------------------------------------
 * Admin AND Planning Officer, matching the server's
 * `role:Admin,Planning Officer`. A Site Inspector is refused and gets no
 * navigation entry; they submit through FieldSync only.
 *
 * READ access only. Neither role can rewrite the report: there is no status
 * control, no edit and no delete, and the report's summary, technical
 * description, reproduction steps and submitted metadata are immutable in iMAPS.
 *
 * ESCALATION
 * ----------
 * A Planning Officer resolves the operational issue inside MPDO. If they cannot,
 * an ADMIN escalates to the development/support team, so the escalation block is
 * rendered for an Admin only. It is configuration-backed: the server sends
 * nothing until the operator sets the contact environment variables, and no
 * contact detail is invented or hardcoded here.
 *
 * SECURITY
 * --------
 * Every string on this page arrived already sanitized by
 * `DiagnosticTextSanitizer` on the server. The one live remote report contains a
 * signed Supabase Storage URL - a bearer capability granting read on a private
 * inspection photo - inside its `summary`, so this is a proven case, not a
 * hypothetical one.
 *
 * `FreeText` renders sanitized content as PLAIN TEXT inside a `<pre>`.
 * Deliberately:
 *   - no `dangerouslySetInnerHTML`, so sanitized output is never reparsed as
 *     markup by a future change;
 *   - no anchor renderer, so a URL that legitimately survives sanitization is
 *     inert and can never become a navigation or exfiltration vector.
 *
 * The escalation contact is treated the same way: inert text, never a link.
 *
 * IDENTITY
 * --------
 * The remote `inspector_id` is a Supabase Auth UUID. Whether it maps to a known
 * iMAPS person is a SEPARATE, explicitly frozen identity question, and the live
 * report points at a profile whose local identity is unresolved. This page shows
 * only what the server resolved and never infers a name.
 *
 * NO WRITE ACTIONS
 * ----------------
 * No status control, no edit, no delete, no delivery retry, no reassignment, no
 * report-status mutation. The loop contract is read-only and the remote table's
 * only writer remains the FieldSync client.
 */
const FREE_TEXT_FIELDS = [
    { key: "summary", label: "Summary" },
    { key: "technical_description", label: "Technical description" },
    { key: "repro_steps", label: "Reproduction steps" },
    { key: "recommended_action", label: "Recommended action" },
];

export default function Show({ report, readOnly = true, escalation = null }) {
    const { auth } = usePage().props;

    // ── Post-Loop 9 smoke fix: the shared authenticated shell ───────────────
    // Same Header + Sidebar composition as every other authenticated page. This
    // page previously rendered standalone with no navigation and no way back.
    const [clock, setClock] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const userName = auth?.user?.name || "Planning Officer";
    const userRole = auth?.user?.role || "Planning Officer";
    const isAdmin = auth?.user?.role === "Admin";

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

    if (!report) {
        return null;
    }

    return (
        <>
            <Head title={report.reference_code || "Diagnostic Report"} />

            <div id="diagnostic-report-page-root" className="bg-slate-50/75 text-slate-800 h-screen flex flex-col overflow-hidden antialiased">
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
            <div className="p-4 sm:p-6 space-y-4 max-w-4xl flex-1 overflow-y-auto mx-auto w-full">
                <header className="space-y-2">
                    {/* Back-to-list navigation, inside the shared shell so the
                        sidebar and this control agree on where "up" is. */}
                    <Link
                        href="/diagnostics"
                        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-blue-700 hover:text-blue-800"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Diagnostic Reports
                    </Link>

                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-xl font-bold text-slate-900">
                            {report.reference_code || "Unreferenced report"}
                        </h1>
                        {readOnly && (
                            <span className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-300">
                                Read only
                            </span>
                        )}
                    </div>

                    <p className="text-[14px] font-semibold text-slate-800 break-words">
                        {report.title || "(no title)"}
                    </p>
                </header>

                <section className="rounded-xl border border-slate-200 bg-white p-4">
                    <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                        Report metadata
                    </h2>

                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-[12px]">
                        <Field label="Reference code" value={report.reference_code} />
                        <Field label="Module" value={report.module} />
                        <Field label="Status" value={report.status} />
                        <Field
                            label="Submitted"
                            value={formatStamp(report.created_at)}
                        />
                        <Field
                            label="Last updated"
                            value={formatStamp(report.updated_at)}
                        />
                        <div>
                            <dt className="font-semibold text-slate-500">Submitted by</dt>
                            <dd className="text-slate-800 mt-0.5 break-all">
                                {report.inspector?.label || "Unresolved inspector"}
                                {report.inspector?.short_uuid && (
                                    <span className="text-slate-400"> ({report.inspector.short_uuid}…)</span>
                                )}
                            </dd>
                        </div>
                    </dl>
                </section>

                {FREE_TEXT_FIELDS.map(({ key, label }) => (
                    <section key={key} className="rounded-xl border border-slate-200 bg-white p-4">
                        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                            {label}
                        </h2>
                        {report[key] ? (
                            <FreeText value={report[key]} />
                        ) : (
                            <p className="text-[12px] text-slate-400 italic">Not provided.</p>
                        )}
                    </section>
                ))}

                {/* ── ESCALATION (Admin only) ──────────────────────────────────
                    A Planning Officer resolves the operational issue inside MPDO.
                    When they cannot, an ADMIN escalates to the development/support
                    team. So this block is Admin-only by responsibility, and the
                    server also withholds the contact from any other role.

                    The contact is CONFIGURATION-BACKED. Nothing is invented: until
                    an operator sets the matching environment variables the server
                    sends nulls and this renders an honest placeholder rather than
                    a guessed address.

                    Values are rendered as inert text, never as links, consistent
                    with the sanitized-text rule above. No password, API key,
                    service-role value or token is ever read for this block. */}
                {isAdmin && (
                    <section className="rounded-xl border border-slate-200 bg-white p-4">
                        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                            Unable to resolve within MPDO?
                        </h2>
                        <p className="text-[12px] text-slate-600 leading-relaxed mb-3">
                            Escalate this issue to the iMAPS development/support team.
                            A Planning Officer assesses the operational issue inside
                            MPDO; the Admin coordinates escalation.
                        </p>

                        {escalation?.name ||
                        escalation?.email ||
                        escalation?.channel ||
                        escalation?.instructions ? (
                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
                                <Field label="Contact name" value={escalation?.name} />
                                <Field label="Email" value={escalation?.email} />
                                <Field label="Contact channel" value={escalation?.channel} />
                                <Field label="Support instructions" value={escalation?.instructions} />
                            </dl>
                        ) : (
                            <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
                                The development/support contact has not been configured
                                for this deployment. Set the support contact
                                environment variables to display it here. No
                                placeholder address is shown, because an invented
                                contact would send an escalation nowhere.
                            </p>
                        )}
                    </section>
                )}

                <p className="text-[11px] text-slate-500 leading-relaxed">
                    This report was submitted from FieldSync. iMAPS displays it
                    read-only: report status cannot be changed here, and the reporter
                    identity is shown only as far as it can be verified.
                </p>
            </div>
            </main>
            </div>
            </div>
        </>
    );
}

/**
 * Sanitized server text, rendered as inert plain text.
 */
function FreeText({ value }) {
    return (
        <pre className="text-[12px] leading-relaxed text-slate-700 whitespace-pre-wrap break-words font-sans">
            {value}
        </pre>
    );
}

function Field({ label, value }) {
    return (
        <div>
            <dt className="font-semibold text-slate-500">{label}</dt>
            <dd className="text-slate-800 mt-0.5 break-words">{value || "—"}</dd>
        </div>
    );
}

function formatStamp(value) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return (
        d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) +
        " · " +
        d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })
    );
}
