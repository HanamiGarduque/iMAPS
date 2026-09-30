// resources/js/Components/InspectionDeliveryStatusPanel.jsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { router, usePage } from "@inertiajs/react";

/**
 * Loop 9C-2 / 9C-4 - FieldSync Delivery status panel.
 *
 * WHAT THIS IS
 * ------------
 * Per INSPECTION ROUND, whether that round reached FieldSync. This component is
 * the only UI for the Loop 9C-1 reader contract
 * (`GET /applications/{id}/delivery-status`).
 *
 * 9C-2 made it read-only. 9C-4 adds ONE action per round: the Planning Officer
 * delivery retry, which posts to the 9C-3 endpoint. Everything else here is
 * unchanged.
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
 * ── RETRY ELIGIBILITY IS NOT COMPUTED HERE (9C-4) ───────────────────────────
 * The retry button is gated on the server's per-round `delivery.can_retry` and
 * on NOTHING else. This file does not check `delivery.state`, the viewer's role,
 * `assigned_planning_officer_id`, the inspector's role, the handshake key, round
 * ordering, `parcel_id` or the failure category.
 *
 * That is deliberate, not a shortcut. `can_retry` is the output of the ONE
 * shared eligibility contract that the 9C-3 retry service also enforces, so a
 * browser can never offer a control the POST would refuse. Re-deriving any of
 * those rules here would fork that single authority and could show a button the
 * server rejects, or hide one the server would accept.
 *
 * The application-level `retry_actor_unavailable_reason` is deliberately NOT
 * used to gate the button. It answers a different question (may this person act
 * on this application at all) and it is null for Admin by design, so using it
 * would produce a control that depends on the wrong flag. It is rendered once,
 * as guidance, when the server offers it.
 *
 * ── "QUEUEING" IS NOT "DELIVERED" (9C-4) ────────────────────────────────────
 * An accepted retry means the request was ACCEPTED and QUEUED. It says nothing
 * about whether FieldSync ever received anything. The button therefore says
 * "Queueing…" while in flight, and the post-refresh state comes from the reader,
 * never from an optimistic local guess. This UI never claims delivery happened.
 *
 * ── THE REQUEST CARRIES NO BUSINESS DATA (9C-4) ─────────────────────────────
 * `router.post` sends an EMPTY object. The server derives the actor, the
 * application, the parcel, the inspector, the source and the delivery state
 * itself. Sending any of them from the browser would let the client assert
 * facts about a business record, and the server would still ignore it.
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
 * The 9C-4 retry control.
 *
 * Rendered ONLY when the server said `delivery.can_retry` is true, and for no
 * other reason. An Admin, a non-owning Planning Officer, a Site Inspector and a
 * guest all receive the SAME `can_retry: false` from the reader, so none of them
 * ever sees this control - there is no client-side role check to get wrong, and
 * no disabled placeholder advertising an authority the viewer does not have.
 *
 * While a request is in flight the button is disabled and reads "Queueing…",
 * which is deliberately not "Retrying…" or "Sending…": a 200 means ACCEPTED AND
 * QUEUED, and this control must never imply that FieldSync has been reached.
 */
function RetryDeliveryButton({ inspectionId, round, queueing, onRetry }) {
    return (
        <button
            type="button"
            onClick={() => onRetry(inspectionId)}
            disabled={queueing}
            aria-busy={queueing}
            aria-label={`Retry FieldSync delivery for Inspection Round ${round}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 min-h-[28px] rounded-[6px] text-[10px] font-bold uppercase tracking-wider border transition-colors disabled:opacity-60 disabled:cursor-not-allowed border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-700 disabled:hover:border-slate-300 disabled:hover:text-slate-600"
        >
            {queueing ? (
                <>
                    <span
                        className="w-2.5 h-2.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"
                        aria-hidden="true"
                    />
                    Queueing…
                </>
            ) : (
                "Retry Delivery"
            )}
        </button>
    );
}

/**
 * One inspection round.
 *
 * Every value below is read from the server response. Nothing is derived, and
 * nothing diagnostic is surfaced: no failure category token, no queue
 * correlation, no attempt detail, no remote task lifecycle, and no internal
 * retry blocker enum.
 */
function DeliveryRoundRow({ inspection, queueingId, onRetry }) {
    const delivery = inspection?.delivery;
    if (!delivery) return null;

    const lastAttempt = formatStamp(delivery.last_attempt_at);
    const deliveredAt = formatStamp(delivery.delivered_at);
    const attempts = Number(delivery.attempt_count) || 0;
    const inspectorName = inspection.inspector?.name;

    // THE AUTHORITATIVE GATE. Read straight from the server and used as-is.
    const canRetry = delivery.can_retry === true;
    const isQueueing = queueingId === inspection.inspection_id;

    return (
        <li className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 space-y-1.5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <p className="text-[12px] font-bold text-slate-700">
                    Inspection Round {inspection.round}
                </p>
                <div className="flex items-center gap-2 shrink-0">
                    {canRetry && (
                        <RetryDeliveryButton
                            inspectionId={inspection.inspection_id}
                            round={inspection.round}
                            queueing={isQueueing}
                            onRetry={onRetry}
                        />
                    )}
                    <DeliveryBadge label={delivery.label} state={delivery.state} />
                </div>
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

    // 9C-4. Exactly ONE round can be queueing at a time, so this is a scalar
    // inspection id rather than a Set. The server refuses a second retry for the
    // same round, and the disabled button already prevents a double click.
    const [queueingId, setQueueingId] = useState(null);
    const [actionError, setActionError] = useState(null);

    // The 9C-3 success flash, consumed here so Applications/Show.jsx does not
    // have to change. Show.jsx renders no flash consumer, and the message is
    // authored SERVER prose, never text composed here.
    const flashSuccess = usePage().props?.flash?.success ?? null;
    const [toast, setToast] = useState(null);
    const seenFlash = useRef(null);

    const load = useCallback(() => {
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

    useEffect(() => load(), [load]);

    useEffect(() => {
        if (!flashSuccess || seenFlash.current === flashSuccess) return;
        seenFlash.current = flashSuccess;
        setToast(flashSuccess);
        const timer = setTimeout(() => setToast(null), 4000);
        return () => clearTimeout(timer);
    }, [flashSuccess]);

    /**
     * 9C-4 retry.
     *
     * The request body is deliberately EMPTY. The server derives the actor, the
     * application, the parcel, the inspector, the source and the delivery state
     * itself, and it re-runs the same eligibility contract that produced
     * `can_retry`. Nothing about the business record may be asserted by a
     * browser.
     *
     * `router.post` is used because it is the established convention in every
     * Component in this repository (WorkAssignment.jsx, Header.jsx) and it
     * inherits the Inertia CSRF and redirect behaviour. No manual CSRF header is
     * constructed, and no optimistic `pending_delivery` is rendered: the new
     * state always comes from a fresh authoritative read.
     *
     * The refusal branch deliberately shows a GENERIC message. The server
     * already sends safe authored prose (403/404/409/503 with
     * `InspectionDeliveryRetryResult::message()`), but Inertia's `onError`
     * callback is not a reliable channel for an abort() body, so relying on it
     * would risk showing either nothing or an internal token. The specific
     * reason is not the officer's to act on here, and the re-fetch below lets
     * the reader re-state the truth.
     */
    const retry = (inspectionId) => {
        if (queueingId !== null) return;

        setQueueingId(inspectionId);
        setActionError(null);

        router.post(
            `/site-inspections/${encodeURIComponent(inspectionId)}/retry-delivery`,
            {},
            {
                preserveScroll: true,
                preserveState: true,
                onSuccess: () => {
                    // Accepted and queued. The flash toast carries the server's
                    // own wording; the panel does not compose a success message.
                    load();
                },
                onError: () => {
                    setActionError("Delivery retry could not be queued.");
                    // 409 in particular means the server state moved on, so the
                    // panel MUST re-read: a stale enabled button must not survive
                    // a refusal.
                    load();
                },
                onFinish: () => setQueueingId(null),
            },
        );
    };

    const rounds = data?.inspections ?? [];

    // Server-authored, application-level guidance. Shown only when the server
    // offers it, and never used to decide whether a button appears.
    const actorReason = data?.retry_actor_unavailable_reason ?? null;

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
                    <>
                        {actorReason && (
                            <p className="text-[11px] leading-relaxed text-slate-500 mb-2.5">
                                {actorReason}
                            </p>
                        )}

                        {/* A retry that was refused. Generic by design: no blocker
                            token, no status code, no server internals. */}
                        {actionError && (
                            <div
                                role="alert"
                                className="p-3 mb-2.5 bg-amber-50 border border-amber-200 rounded-xl"
                            >
                                <p className="text-[12px] font-bold text-amber-800">
                                    {actionError}
                                </p>
                                <p className="text-[11px] text-amber-700 mt-0.5">
                                    This does not indicate a problem with the delivery itself.
                                </p>
                            </div>
                        )}

                        <ul className="space-y-2">
                            {rounds.map((inspection) => (
                                <DeliveryRoundRow
                                    key={inspection.inspection_id}
                                    inspection={inspection}
                                    queueingId={queueingId}
                                    onRetry={retry}
                                />
                            ))}
                        </ul>
                    </>
                )}
            </div>

            {/* 9C-4. The server's own success wording, in the Show.jsx toast
                shape. It always says QUEUED, never delivered. */}
            {toast && (
                <div
                    className="flex items-center gap-2.5 px-4 py-3 rounded-2xl border shadow-xl max-w-sm pointer-events-none transition-all bg-slate-900 text-white border-slate-800"
                    role="status"
                    aria-live="polite"
                >
                    <span>{toast}</span>
                </div>
            )}
        </section>
    );
}
