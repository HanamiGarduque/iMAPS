// resources/js/Pages/Diagnostics/Show.jsx
import React from "react";
import { Head, Link, router } from "@inertiajs/react";

/**
 * LOOP 9E/9F - one FieldSync inspector diagnostic report, Admin read only.
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
 * IDENTITY
 * --------
 * The remote `inspector_id` is a Supabase Auth UUID. Whether it maps to a known
 * iMAPS person is a SEPARATE, explicitly frozen identity question, and the live
 * report points at a profile whose local identity is unresolved. This page shows
 * only what the server resolved and never infers a name.
 *
 * NO ACTIONS
 * ----------
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

export default function Show({ report, readOnly = true }) {
    if (!report) {
        return null;
    }

    return (
        <>
            <Head title={report.reference_code || "Diagnostic Report"} />

            <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
                <header className="space-y-2">
                    <Link
                        href="/diagnostics"
                        className="text-[12px] font-semibold text-blue-700 hover:text-blue-800"
                    >
                        &larr; All diagnostic reports
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

                <p className="text-[11px] text-slate-500 leading-relaxed">
                    This report was submitted from FieldSync. iMAPS displays it
                    read-only: report status cannot be changed here, and the reporter
                    identity is shown only as far as it can be verified.
                </p>
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
