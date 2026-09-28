// resources/js/Components/InspectionDeliveryStatusPanel.jsx
import React, { useState, useEffect } from "react";

/**
 * Loop 9C-2 - FieldSync Delivery status panel (READ ONLY).
 *
 * WHAT THIS IS
 * ------------
 * A Planning Officer or Admin can now see, per INSPECTION ROUND, whether that
 * round reached FieldSync. This component is the only UI for the Loop 9C-1
 * reader contract (`GET /applications/{id}/delivery-status`).
 *
 * It is deliberately inert. It dispatches nothing, writes nothing, and offers
 * no control of any kind. Retry is a later phase and the response deliberately
 * carries retry fields this component does not reference at all.
 *
 * ── THE SERVER IS THE SEMANTIC AUTHORITY ────────────────────────────────────
 * Every user-facing string is rendered from a server field: `delivery.label`,
 * `delivery.message` and `delivery.failure_message`. This file contains NO
 * business-label mapping. It never turns a state token into wording, and it
 * never re-derives what a state means. `delivery.state` is read for VISUAL
 * styling only.
 *
 * That is the single most important rule in this file. A Planning Officer must
 * see exactly what the server concluded, and a future change to the server's
 * vocabulary must change this UI with no edit here.
 *
 * ── NULL IS NOT A PROBLEM ───────────────────────────────────────────────────
 * `no_delivery_record` is the ABSENCE of a Loop 9 delivery record, and nothing
 * more. Two very different populations land there - rounds that predate Loop 9
 * monitoring, and genuinely DELIVERED FieldSync jobs that intentionally carry no
 * fabricated local history - so this component adds no wording of its own that
 * could make either of them read as a failure or as a missing task.
 *
 * ── A READER FAILURE IS NOT A DELIVERY FAILURE ─────────────────────────────
 * If the request itself fails, this shows that the status could not be loaded.
 * It never shows "Delivery Failed". Those are entirely different facts, and
 * conflating them would invent an operational incident that did not happen.
 *
 * ── ROUND LABEL ────────────────────────────────────────────────────────────
 * `Inspection Round N` uses the server's `round` value, which is presentation
 * chronology. This component does NOT infer "Original Inspection" or
 * "Reinspection": the server does not send that distinction, and deriving it
 * here from array position would be a client-side business inference.
 * `inspection_id` remains the stable persisted identity.
 *
 * ── TASK LIFECYCLE IS A DIFFERENT THING ────────────────────────────────────
 * `assigned` / `in_progress` / `completed` are FieldSync TASK lifecycle values.
 * They are never used as delivery labels, and delivery state never implies field
 * progression. iMAPS cannot prove field progression, so this UI must not claim
 * it.
 *
 * See docs/FIELDSYNC_BRIDGE_ARCHITECTURE.md for the recorded Loop 9 contract.
 */

// ── Visual treatment only. No business meaning lives in this map. ──────────
// The shape deliberately follows the ParcelInspectionStatus badge (rounded
// square, small, uppercase) rather than the page's rounded-full application
// status badge, so a delivery state is not mistaken for an application status.
//
// Colours are also chosen to avoid impersonating an INSPECTION status, because
// those already occupy blue/amber/emerald in the existing report card. Colour
// is never the only signal: the server's textual label is always rendered.
const DELIVERY_TONE = {
    no_delivery_record: { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200" },
    pending_delivery:  { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200" },
    delivered:         { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
    delivery_failed:   { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
};

const NEUTRAL_TONE = { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200" };

/**
 * The server's own label, styled by tone. `label` is passed straight through -
 * this component never authors it.
 */
function DeliveryBadge({ label, state }) {
    if (!label) return null;
    const tone = DELIVERY_TONE[state] || NEUTRAL_TONE;

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[10px] font-bold uppercase tracking-wider shrink-0 ${tone.bg} ${tone.text} border ${tone.border}`}>
            {/* Decorative only: the textual label beside it carries the state. */}
            <span className="w-1.5 h-1.5 rounded-full inline-block bg-current" aria-hidden="true" />
            {label}
        </span>
    );
}

/**
 * Existing repository date convention (ParcelInspectionStatus.jsx), with an
 * invalid-date guard in the style of WorkAssignment.jsx. No timezone option is
 * specified, matching every other timestamp in this application.
 */
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

/**
 * One inspection round.
 *
 * Every value below is read from the server response. Nothing is derived, and
 * nothing diagnostic is surfaced: no failure category token, no queue
 * correlation, no attempt detail, no remote task lifecycle.
 */
function DeliveryRoundRow({ inspection }) {
    const delivery = inspection?.delivery;
    if (!delivery) return null;

    const lastAttempt = formatStamp(delivery.last_attempt_at);
    const deliveredAt = formatStamp(delivery.delivered_at);
    const attempts = Number(delivery.attempt_count) || 0;
    const inspectorName = inspection.inspector?.name;

    return (
        <li className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 space-y-1.5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <p className="text-[12px] font-bold text-slate-700">
                    Inspection Round {inspection.round}
                </p>
                <DeliveryBadge label={delivery.label} state={delivery.state} />
            </div>

            {delivery.message && (
                <p className="text-[12px] leading-relaxed text-slate-500">
                    {delivery.message}
                </p>
            )}

            {/* Server-authored failure prose only. The raw category token is a
                diagnostic detail for 9D Admin monitoring and is never shown. */}
            {delivery.failure_message && (
                <p className="text-[12px] leading-relaxed text-rose-700">
                    {delivery.failure_message}
                </p>
            )}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                {lastAttempt && (
                    <span className="text-[11px] text-slate-500">
                        Last delivery attempt: {lastAttempt}
                    </span>
                )}

                {/* Rendered only when it happened, and always worded as DELIVERY
                    attempts so it cannot be read as FieldSync task starts. */}
                {attempts > 0 && (
                    <span className="text-[11px] text-slate-500">
                        {attempts} {attempts === 1 ? "delivery attempt" : "delivery attempts"}
                    </span>
                )}

                {deliveredAt && (
                    <span className="text-[11px] text-slate-500">
                        Delivered: {deliveredAt}
                    </span>
                )}

                {inspectorName && (
                    <span className="text-[11px] text-slate-500">
                        Inspector: {inspectorName}
                    </span>
                )}
            </div>
        </li>
    );
}

export default function InspectionDeliveryStatusPanel({ applicationId }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);

    useEffect(() => {
        if (!applicationId) {
            setData(null);
            setLoading(false);
            return;
        }

        // Stale-response guard, in the style of PhotoLightbox.jsx. A single
        // request does not justify AbortController here, and the repository uses
        // AbortController only for the autosave in Create.jsx.
        let cancelled = false;

        setLoading(true);
        setLoadError(false);

        fetch(`/applications/${encodeURIComponent(applicationId)}/delivery-status`, {
            credentials: "same-origin",
            headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
        })
            .then((res) => {
                if (!res.ok) throw new Error("delivery-status request failed");
                return res.json();
            })
            .then((payload) => {
                if (cancelled) return;
                setData(Array.isArray(payload?.inspections) ? payload : { inspections: [] });
            })
            .catch(() => {
                if (cancelled) return;
                // A READER failure. Deliberately not a delivery failure.
                setData(null);
                setLoadError(true);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [applicationId]);

    const rounds = data?.inspections ?? [];

    return (
        <section
            className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
            role="status"
            aria-live="polite"
        >
            <div className="px-4 py-3 border-b border-slate-100">
                <h4 className="text-[13px] font-bold text-slate-800">FieldSync Delivery</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                    Whether each inspection round was delivered to FieldSync. These are
                    delivery states, not the inspection result, the application result, or
                    a zoning decision.
                </p>
            </div>

            <div className="px-4 py-3.5">
                {loading && (
                    <div className="flex flex-col items-center justify-center py-6 bg-slate-50 border border-slate-200 rounded-xl animate-pulse">
                        <div className="w-6 h-6 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-2.5" />
                        <span className="text-[12px] font-bold uppercase tracking-widest text-slate-400">
                            Loading delivery status...
                        </span>
                    </div>
                )}

                {/* READER FAILURE. This is a failure to LOAD, and is worded so it
                    can never be read as a delivery that failed. */}
                {!loading && loadError && (
                    <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
                        <p className="text-[13px] font-bold text-amber-800">
                            Delivery status could not be loaded.
                        </p>
                        <p className="text-[12px] text-amber-700 mt-0.5">
                            This does not indicate a problem with the delivery itself.
                            Reload the page to try again.
                        </p>
                    </div>
                )}

                {!loading && !loadError && rounds.length === 0 && (
                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                        <p className="text-[13px] font-bold text-slate-700">
                            No inspection delivery records are available.
                        </p>
                        <p className="text-[12px] text-slate-500 mt-0.5">
                            This application has no site inspection rounds to report on yet.
                        </p>
                    </div>
                )}

                {!loading && !loadError && rounds.length > 0 && (
                    <ul className="space-y-2">
                        {rounds.map((inspection) => (
                            <DeliveryRoundRow
                                key={inspection.inspection_id}
                                inspection={inspection}
                            />
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}
