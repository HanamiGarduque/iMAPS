import React, { useState } from "react";
import { router } from "@inertiajs/react";

/**
 * Work assignment — business continuity WITHOUT account sharing.
 *
 * The two responsibilities are kept visibly separate, because they belong to
 * different roles and granting one must never imply the other:
 *
 *   APPLICATION ownership  → Admin may initiate a handover.
 *   INSPECTION ROUND owner → only a Planning Officer may hand a round over.
 *
 * Nothing here lets anybody act as another employee. The receiving officer
 * always works on their own account.
 */

const inputBase =
    "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all shadow-xs";
const labelBase = "flex items-center gap-1.5 text-xs font-semibold mb-1.5 text-slate-700";

function Field({ children, required }) {
    return (
        <label className={labelBase}>
            {children}
            {required && <span className="text-rose-500 font-bold leading-none">*</span>}
        </label>
    );
}

function Notice({ tone = "info", children }) {
    const tones = {
        info: "border-slate-200 bg-slate-50/70 text-slate-600",
        warn: "border-amber-200 bg-amber-50/70 text-amber-800",
        muted: "border-slate-200 bg-slate-50/50 text-slate-500",
    };

    return (
        <div className={`rounded-xl border px-3.5 py-2.5 text-[12px] leading-relaxed ${tones[tone]}`}>
            {children}
        </div>
    );
}

function formatStamp(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * One history line: who had it, who has it, why, and who authorised it.
 * Rendered read-only — history is never editable.
 */
function HistoryLine({ entry }) {
    const from = entry.from_name || entry.from_id || "Unassigned";
    const to = entry.to_name || entry.to_id || "—";
    const isInitial = entry.assignment_type === "initial";

    return (
        <li className="flex flex-col gap-0.5 py-2 border-b border-slate-100 last:border-0">
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700">
                <span className="font-mono text-[11px] text-slate-400">{formatStamp(entry.reassigned_at)}</span>
                <span className="text-slate-300">·</span>
                <span>
                    {isInitial ? (
                        <>
                            Assigned to <span className="text-blue-700">{to}</span>
                        </>
                    ) : (
                        <>
                            <span className="text-slate-500 line-through decoration-slate-300">{from}</span>
                            <span className="mx-1 text-slate-300">→</span>
                            <span className="text-blue-700">{to}</span>
                        </>
                    )}
                </span>
            </div>
            <p className="text-[11px] text-slate-500">
                {/* An initial assignment correctly has NO reason, so the label
                    must not be rendered with nothing after it. A dangling
                    "Reason:" reads as a missing value rather than as the honest
                    answer it is. */}
                {entry.reason ? (
                    <>
                        Reason: {entry.reason}
                        {entry.reason_note ? ` — ${entry.reason_note}` : ""}
                    </>
                ) : (
                    "First assignment — no reason is recorded, because nobody is handing work over"
                )}
                {entry.actor_name ? ` · Changed by: ${entry.actor_name}` : ""}
            </p>
        </li>
    );
}

function CollapsibleHistory({ title, entries, emptyText, nameKey = "name" }) {
    const [open, setOpen] = useState(false);
    const list = Array.isArray(entries) ? entries : [];

    /**
     * Eager-loaded relations arrive as objects ({ id, name }), not as name
     * strings, so rendering one directly would crash React with "objects are
     * not valid as a React child". Accept either shape and reduce it to a
     * display name here, so the history line only ever handles strings.
     */
    const nameOf = (value) => {
        if (!value) return null;
        if (typeof value === "string") return value;
        return value.name ?? null;
    };

    return (
        <div className="mt-3 border-t border-slate-100 pt-2.5">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 transition-colors"
                aria-expanded={open}
            >
                <svg
                    className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="3"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                {title} ({list.length})
            </button>

            {open &&
                (list.length === 0 ? (
                    <p className="mt-2 text-[11px] text-slate-400">{emptyText}</p>
                ) : (
                    <ul className="mt-1.5">
                        {list.map((entry) => (
                            <HistoryLine
                                key={entry.id}
                                entry={{
                                    ...entry,
                                    from_name: nameOf(entry[`from_${nameKey}`]),
                                    to_name: nameOf(entry[`to_${nameKey}`]),
                                    actor_name: nameOf(entry.actor),
                                }}
                            />
                        ))}
                    </ul>
                ))}
        </div>
    );
}

// ── Reassign Planning Officer (Admin) ────────────────────────────────────────

export function PlanningOfficerAssignment({
    current,
    candidates = [],
    history = [],
    reasons = [],
    canReassign = false,
    applicationId,
}) {
    const [open, setOpen] = useState(false);
    const [targetId, setTargetId] = useState("");
    const [reason, setReason] = useState("");
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const noteRequired = reason === "Other";
    const options = candidates.filter((c) => String(c.id) !== String(current?.id ?? ""));
    const selectedName = options.find((c) => String(c.id) === String(targetId))?.name;

    const submit = () => {
        setSaving(true);
        setError(null);

        router.post(
            "/applications/reassign-planning-officer",
            {
                zoning_application_id: applicationId,
                to_planning_officer_id: targetId,
                // A first assignment sends NO reason at all. Sending an empty
                // string instead of null would be rejected by the closed
                // vocabulary, and inventing a reason would be a false record.
                reason: current ? reason : null,
                reason_note: current && note ? note : null,
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setOpen(false);
                    setTargetId("");
                    setReason("");
                    setNote("");
                },
                onError: (errs) => {
                    setError(Object.values(errs)[0] || "The transfer could not be completed.");
                },
                onFinish: () => setSaving(false),
            },
        );
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Work Assignment</h3>
            </div>

            <div className="px-5 py-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                            Assigned Planning Officer
                        </p>
                        {current?.name ? (
                            <p className="text-sm font-bold text-slate-900">{current.name}</p>
                        ) : (
                            <p className="text-sm font-semibold text-slate-400 italic">Not yet assigned</p>
                        )}
                    </div>

                    {canReassign &&
                        (current ? (
                            <button
                                type="button"
                                onClick={() => setOpen(true)}
                                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-[11px] font-bold hover:bg-blue-100 active:scale-98 transition-all"
                            >
                                Reassign
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setOpen(true)}
                                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-700 active:scale-98 transition-all"
                            >
                                Assign Planning Officer
                            </button>
                        ))}
                </div>

                {!canReassign && (
                    <Notice tone="muted">
                        You can see who currently owns this application. Handing it to another Planning Officer is
                        done by an Administrator; a Planning Officer does not self-reassign.
                    </Notice>
                )}

                {canReassign && (
                    <Notice tone="info">
                        Handing over application ownership does not transfer technical decision authority. The
                        receiving Planning Officer makes the decisions on their own account. Accounts are never
                        shared.
                    </Notice>
                )}

                <CollapsibleHistory
                    title="Assignment History"
                    entries={history}
                    nameKey="planning_officer"
                    emptyText="No ownership changes have been recorded for this application."
                />
            </div>

            {open && (
                <ReassignModal
                    // A first assignment is not a reassignment and is never
                    // called one. It also asks for no reason: there is nobody to
                    // take work away from, so a reason would have to be invented.
                    isInitial={!current}
                    title={current ? "Reassign Application Ownership" : "Assign Planning Officer"}
                    subtitle="Business continuity"
                    description={
                        current
                            ? "Hand this application to another active Planning Officer. The application status, its technical review history and its encoder are not changed."
                            : "Record which Planning Officer currently owns this application. The application status, its technical review history and its encoder are not changed."
                    }
                    candidates={options}
                    currentLabel={current?.name || "Not yet assigned"}
                    reasons={reasons}
                    targetId={targetId}
                    setTargetId={setTargetId}
                    reason={reason}
                    setReason={setReason}
                    note={note}
                    setNote={setNote}
                    noteRequired={noteRequired}
                    selectedName={selectedName}
                    error={error}
                    saving={saving}
                    onClose={() => {
                        setOpen(false);
                        setError(null);
                    }}
                    onSubmit={submit}
                    confirmLabel={current ? "Confirm Transfer" : "Assign Planning Officer"}
                />
            )}
        </div>
    );
}

// ── Reassign Site Inspector (Planning Officer) ───────────────────────────────

export function InspectorRoundAssignment({
    state,
    history = [],
    candidates = [],
    reasons = [],
    canReassign = false,
    applicationId,
}) {
    const [open, setOpen] = useState(false);
    const [targetId, setTargetId] = useState("");
    const [reason, setReason] = useState("");
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    if (!state) return null;

    const noteRequired = reason === "Other";
    const options = candidates.filter((c) => String(c.id) !== String(state.inspector_id ?? ""));
    const selectedName = options.find((c) => String(c.id) === String(targetId))?.name;

    const submit = () => {
        setSaving(true);
        setError(null);

        const isInitial = !state.inspector_id;

        router.post(
            "/site-inspections/reassign-inspector",
            {
                site_inspection_id: state.inspection_id,
                zoning_application_id: applicationId,
                to_inspector_id: targetId,
                // A first assignment sends NO reason: there is no previous
                // inspector to take work away from.
                reason: isInitial ? null : reason,
                reason_note: isInitial || !note ? null : note,
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setOpen(false);
                    setTargetId("");
                    setReason("");
                    setNote("");
                },
                onError: (errs) => {
                    setError(Object.values(errs)[0] || "The reassignment could not be completed.");
                },
                onFinish: () => setSaving(false),
            },
        );
    };

    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        Assigned Inspector · Round {state.round_number}
                    </p>
                    {state.inspector_name ? (
                        <p className="text-[13px] font-bold text-slate-800">{state.inspector_name}</p>
                    ) : (
                        <p className="text-[13px] font-semibold text-slate-400 italic">Not yet assigned</p>
                    )}
                </div>

                {canReassign &&
                    (state.allowed ? (
                        <button
                            type="button"
                            onClick={() => setOpen(true)}
                            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-[11px] font-bold hover:bg-blue-100 active:scale-98 transition-all"
                        >
                            Reassign Inspector
                        </button>
                    ) : (
                        <button
                            type="button"
                            disabled
                            title={state.blocked_reason || "This round cannot be reassigned."}
                            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-400 text-[11px] font-bold cursor-not-allowed"
                        >
                            Reassign Inspector
                        </button>
                    ))}
            </div>

            {canReassign && !state.allowed && (
                <div className="mt-2.5">
                    <Notice tone="warn">{state.blocked_reason}</Notice>
                </div>
            )}

            {canReassign && state.allowed && (
                <div className="mt-2.5">
                    <Notice tone="info">
                        This round has not been started in FieldSync, so it can be handed over safely. Once an
                        inspector has begun work on it, it can no longer be reassigned.
                    </Notice>
                </div>
            )}

            {!canReassign && (
                <div className="mt-2.5">
                    <Notice tone="muted">
                        Handing an inspection round to a different Site Inspector is done by a Planning Officer.
                    </Notice>
                </div>
            )}

            <CollapsibleHistory
                title="Inspector History"
                entries={history}
                nameKey="inspector"
                emptyText="No inspector changes have been recorded for this round."
            />

            {open && (
                <ReassignModal
                    title={
                        state.inspector_id
                            ? `Reassign Inspector · Round ${state.round_number}`
                            : `Assign Inspector · Round ${state.round_number}`
                    }
                    isInitial={!state.inspector_id}
                    subtitle="Field task handover"
                    description="Hand this inspection round to another active Site Inspector. The round, its status and any evidence already collected are not changed."
                    candidates={options}
                    currentLabel={state.inspector_name || "Not yet assigned"}
                    reasons={reasons}
                    targetId={targetId}
                    setTargetId={setTargetId}
                    reason={reason}
                    setReason={setReason}
                    note={note}
                    setNote={setNote}
                    noteRequired={noteRequired}
                    selectedName={selectedName}
                    error={error}
                    saving={saving}
                    onClose={() => {
                        setOpen(false);
                        setError(null);
                    }}
                    onSubmit={submit}
                    confirmLabel={state.inspector_id ? "Confirm Reassignment" : "Assign Inspector"}
                />
            )}
        </div>
    );
}

// ── Shared modal ─────────────────────────────────────────────────────────────

function ReassignModal({
    title,
    subtitle,
    description,
    isInitial = false,
    candidates,
    currentLabel,
    reasons,
    targetId,
    setTargetId,
    reason,
    setReason,
    note,
    setNote,
    noteRequired,
    selectedName,
    error,
    saving,
    onClose,
    onSubmit,
    confirmLabel,
}) {
    const ready = Boolean(targetId && reason && (!noteRequired || note.trim()));

    return (
        <div className="fixed inset-0 z-[900] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-5 border-b border-slate-100 bg-slate-50/80 flex justify-between items-start">
                    <div>
                        <span className="text-xs font-semibold text-blue-600">{subtitle}</span>
                        <h3 className="text-base font-bold text-slate-900">{title}</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                        aria-label="Close"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <div>
                        <Field>Current</Field>
                        <p className="text-xs font-semibold text-slate-700 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200">
                            {currentLabel}
                        </p>
                    </div>

                    <div>
                        <Field required>New</Field>
                        <select
                            value={targetId}
                            onChange={(e) => setTargetId(e.target.value)}
                            className={`${inputBase} cursor-pointer`}
                        >
                            <option value="">-- Choose --</option>
                            {candidates.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                        <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed">
                            {selectedName
                                ? `${selectedName} will continue on their own account. Nobody signs in on their behalf.`
                                : "Only active employees with the right role are listed."}
                        </p>
                    </div>

                    {/* A reason describes work being taken away from somebody, so
                        it is only asked for when there IS a current owner. On a
                        first assignment it would have to be invented. */}
                    {!isInitial && (
                        <>
                            <div>
                                <Field required>Reason</Field>
                                <select
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    className={`${inputBase} cursor-pointer`}
                                >
                                    <option value="">-- Choose --</option>
                                    {reasons.map((r) => (
                                        <option key={r} value={r}>
                                            {r}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <Field required={noteRequired}>
                                    {noteRequired ? "Note" : "Note (optional)"}
                                </Field>
                                <textarea
                                    rows={2}
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    placeholder={
                                        noteRequired ? "Briefly explain the reason…" : "Add any extra context…"
                                    }
                                    className={`${inputBase} resize-none`}
                                />
                            </div>
                        </>
                    )}

                    {isInitial && (
                        // Purely explanatory. Deliberately styled as a plain line
                        // of helper text with an information icon, NOT as a card,
                        // field or disabled input: a user read the earlier
                        // input-looking panel as a notes box they were meant to
                        // fill in. Nothing here is editable and nothing is sent.
                        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-500 bg-transparent">
                            <svg
                                className="w-3.5 h-3.5 mt-px shrink-0 text-slate-400"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                            <span>
                                Initial assignment — no transfer reason is required.
                            </span>
                        </p>
                    )}

                    {error && <Notice tone="warn">{error}</Notice>}
                </div>

                <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2.5 bg-slate-50/80">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-all shadow-xs"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onSubmit}
                        disabled={!ready || saving}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? "Saving..." : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
