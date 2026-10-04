import React, { useState } from "react";
import axios from "axios";
import { router } from "@inertiajs/react";
import { control, stamp } from "./ReportUi";

/**
 * INTERNAL MPDO/support workflow for a Technical Issue.
 *
 * Rendered only when the server produced a `developmentSupport` prop, which it
 * does only for an Admin viewing a Technical Issue. Every rule here is enforced
 * again on the server; this component never becomes the authority. It hides the
 * controls the server would refuse, and it always reloads afterwards so the
 * rendered state comes from the authoritative rows rather than from local
 * optimistic state.
 *
 * The contact block is rendered from config/imaps.php, which is documented as
 * holding only name / email / channel / instructions. There is no field here for
 * a key, token or credential, so none can be displayed even by accident.
 *
 * Deliberately NOT shown anywhere near the inspector-facing "Official response"
 * section: an escalation and its recommendation are internal, and must never be
 * reachable from, or leak into, the report the inspector reads.
 */
export default function DevelopmentSupport({ report, panel }) {
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [errors, setErrors] = useState({});
    const [recommendation, setRecommendation] = useState("");
    const [closureNote, setClosureNote] = useState("");

    const post = async (path, body) => {
        if (busy) return;
        setBusy(true); setResult(null); setErrors({});
        try {
            const reply = await axios.post(path, body, { headers: { Accept: "application/json" }, validateStatus: () => true });
            if (reply.status === 422) { setErrors(reply.data?.errors || {}); }
            else if (reply.data?.outcome) {
                setResult(reply.data);
                // The episode rows are the authority. Re-read them instead of
                // guessing the new state locally.
                router.reload({ only: ["report", "context", "canNotify", "handlingActions", "developmentSupport"], preserveScroll: true });
            } else {
                setResult({ outcome: "error", message: "The request could not be completed. Refresh to check the current state." });
            }
        } catch {
            setResult({ outcome: "error", message: "The request could not be confirmed. Refresh before taking any further action." });
        } finally { setBusy(false); }
    };

    const base = `/diagnostics/${report.id}/escalations`;
    const open = panel.open;
    const alert = (message, tone = "amber") => <p role="alert" className={`rounded-lg border p-3 text-sm ${tone === "red" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{message}</p>;
    const input = "mt-2 w-full rounded-lg border-slate-300 text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-60";

    return <section aria-labelledby="development-support-heading" className="rounded-xl border border-slate-300 bg-slate-50 p-4 sm:p-5">
        <h2 id="development-support-heading" className="text-xs font-bold uppercase tracking-wider text-slate-600">Development Support</h2>
        <p className="mt-1 text-sm text-slate-500">Internal MPDO support workflow. Not visible to the reporting inspector and not part of the official response.</p>

        {result && <div className="mt-3">{alert(result.message, result.outcome === "opened" || result.outcome === "closed" || result.outcome === "recommended" ? "amber" : "red")}</div>}

        {!panel.contactConfigured && <div className="mt-3">{alert("Development Support contact is not configured. Ask an administrator to set IMAPS_SUPPORT_CONTACT_* before opening an escalation.")}</div>}
        {panel.contactConfigured && <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[["Name", panel.contact.name], ["Email", panel.contact.email], ["Channel", panel.contact.channel], ["Instructions", panel.contact.instructions]]
                .filter(([, value]) => value).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{value}</dd></div>)}
        </dl>}

        {!panel.escalatable && <p className="mt-3 text-sm text-slate-500">This report is already final. No further escalation is possible.</p>}

        {panel.escalatable && !open && <div className="mt-4"><button type="button" className={control} disabled={busy} onClick={() => post(base, {})}>
            {busy ? "Opening…" : "Escalate to Development Support"}</button>
            <p className="mt-2 text-xs text-slate-500">While an escalation is open you can still Mark In Review, but you cannot Resolve or mark Won’t fix until it is closed.</p></div>}

        {open && <div className="mt-4 space-y-4">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><dt className="text-xs font-semibold text-slate-500">Status</dt><dd className="mt-1 text-sm text-slate-800">Open</dd></div>
                <div><dt className="text-xs font-semibold text-slate-500">Opened at</dt><dd className="mt-1 text-sm text-slate-800">{stamp(open.created_at)}</dd></div>
            </dl>

            {open.recommendation
                ? <div><dt className="text-xs font-semibold text-slate-500">Recommendation</dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800">{open.recommendation}</dd>
                    <p className="mt-1 text-xs text-slate-500">Recorded {stamp(open.recommendation_at)}. A recommendation cannot be edited; close this episode and open a new one if the guidance changes.</p></div>
                : <form onSubmit={event => { event.preventDefault(); post(`${base}/${open.id}/recommendation`, { recommendation }); }}>
                    <label htmlFor="escalation-recommendation" className="block text-sm font-semibold text-slate-700">Recommendation received</label>
                    <p className="mt-1 text-sm text-slate-500">Plain text, up to 2000 characters. Recorded once and then immutable.</p>
                    <textarea id="escalation-recommendation" value={recommendation} onChange={event => setRecommendation(event.target.value)} rows={4} disabled={busy}
                        aria-invalid={Boolean(errors.recommendation)} aria-describedby="escalation-recommendation-error" className={input} />
                    <p id="escalation-recommendation-error" role={errors.recommendation ? "alert" : undefined} className="mt-1 text-sm text-red-700">{errors.recommendation?.[0]}</p>
                    <button type="submit" className={`${control} mt-3`} disabled={busy || !recommendation.trim()}>Record recommendation</button></form>}

            <form onSubmit={event => { event.preventDefault(); post(`${base}/${open.id}/close`, { closure_note: closureNote }); }}>
                <label htmlFor="escalation-closure-note" className="block text-sm font-semibold text-slate-700">Close escalation</label>
                <p className="mt-1 text-sm text-slate-500">{open.recommendation
                    ? "Optional closure note."
                    : "A closure note is required when no recommendation was recorded, so the closure is explainable."}</p>
                <textarea id="escalation-closure-note" value={closureNote} onChange={event => setClosureNote(event.target.value)} rows={3} disabled={busy}
                    required={!open.recommendation} aria-invalid={Boolean(errors.closure_note)} aria-describedby="escalation-closure-note-error" className={input} />
                <p id="escalation-closure-note-error" role={errors.closure_note ? "alert" : undefined} className="mt-1 text-sm text-red-700">{errors.closure_note?.[0]}</p>
                <button type="submit" className={`${control} mt-3`} disabled={busy || (!open.recommendation && !closureNote.trim())}>Close escalation</button>
                <p className="mt-2 text-xs text-slate-500">Closing is final. A later consultation is a new escalation.</p>
            </form>
        </div>}

        {!!panel.closed.length && <div className="mt-5 border-t border-slate-300 pt-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Previous escalations</h3>
            <ul className="mt-2 space-y-2">{panel.closed.map(episode => <li key={episode.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                <p className="font-semibold">Closed {stamp(episode.closed_at)}</p>
                <p className="text-xs text-slate-500">Opened {stamp(episode.created_at)}</p>
                {episode.recommendation && <p className="mt-1 whitespace-pre-wrap break-words">{episode.recommendation}</p>}
            </li>)}</ul>
        </div>}
    </section>;
}