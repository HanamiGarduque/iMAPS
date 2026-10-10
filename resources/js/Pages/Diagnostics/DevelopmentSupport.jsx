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
 *
 * Collapsed by default (a native <details>) so it costs one row of the sidebar;
 * it starts expanded only while an escalation is open and needs attention.
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
    const alert = (message, tone = "amber") => <p role="alert" className={`rounded-lg px-3 py-2 text-xs leading-relaxed ring-1 ring-inset ${tone === "red" ? "bg-red-50 text-red-800 ring-red-200" : "bg-amber-50 text-amber-800 ring-amber-200"}`}>{message}</p>;
    const input = "mt-1.5 w-full rounded-lg border-slate-300 text-[13px] focus:border-blue-500 focus:ring-blue-500 disabled:opacity-60";
    const label = "block text-xs font-semibold text-slate-700";
    const hint = "mt-0.5 text-[11px] leading-relaxed text-slate-500";
    const chip = open
        ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-500" />Open since {stamp(open.created_at)}</span>
        : panel.escalatable
            ? <span className="text-[11px] text-slate-500">Internal · admins only</span>
            : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">Final</span>;

    return <details open={Boolean(open)} className="group rounded-xl bg-white ring-1 ring-slate-200/70 [&[open]>summary]:border-b [&[open]>summary]:border-slate-100">
        <summary className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-xl px-3.5 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="row-span-2 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-100"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" /></svg></span>
            <h2 id="development-support-heading" className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-slate-900">{open ? "With the dev team" : "Need the dev team?"}</h2>
            <svg aria-hidden="true" className="row-span-2 h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
            <span className="col-start-2 flex">{chip}</span>
        </summary>

        <section aria-labelledby="development-support-heading" className="space-y-3 px-3.5 py-3">
            <p className="text-[13px] leading-relaxed text-slate-700">Send this to the developers. <span className="text-slate-500">Inspectors won’t see it.</span></p>

            {result && alert(result.message, result.outcome === "opened" || result.outcome === "closed" || result.outcome === "recommended" ? "amber" : "red")}
            {panel.contactConfigured && <dl className="space-y-1.5 rounded-lg bg-slate-50 px-3 py-2.5 text-xs">
                {[["Name", panel.contact.name], ["Email", panel.contact.email], ["Channel", panel.contact.channel], ["Instructions", panel.contact.instructions]]
                    .filter(([, value]) => value).map(([label, value]) => <div key={label} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2"><dt className="text-slate-500">{label}</dt><dd className="whitespace-pre-wrap break-words font-medium text-slate-800">{value}</dd></div>)}
            </dl>}

            {!panel.escalatable && <p className="text-xs text-slate-500">This report is final.</p>}

            {panel.escalatable && !open && <div className="space-y-2.5">
                <p className="flex gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
                    <svg aria-hidden="true" className="mt-px h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" /></svg>
                    <span>Resolve and Won’t fix are locked until this is closed.</span></p>
                <button type="button" className={`${control} w-full`} disabled={busy} onClick={() => post(base, {})}>
                    {busy ? "Sending…" : "Send to dev team"}</button>
            </div>}

            {!panel.contactConfigured && <p role="alert" className="flex gap-1.5 text-[11px] leading-relaxed text-amber-800">
                <span aria-hidden="true">⚠</span>
                <span>No dev team contact set. Ask your system admin.</span></p>}

            {open && <div className="space-y-4">
                {open.recommendation
                    ? <dl><dt className={label}>Dev team’s advice</dt>
                        <dd className="mt-1.5 whitespace-pre-wrap break-words rounded-lg bg-slate-50 px-3 py-2.5 text-[13px] text-slate-800 ring-1 ring-inset ring-slate-200">{open.recommendation}</dd>
                        <p className={hint}>Recorded {stamp(open.recommendation_at)}. Can’t be edited.</p></dl>
                    : <form onSubmit={event => { event.preventDefault(); post(`${base}/${open.id}/recommendation`, { recommendation }); }}>
                        <label htmlFor="escalation-recommendation" className={label}>Dev team’s advice</label>
                        <p className={hint}>Can’t be edited once saved.</p>
                        <textarea id="escalation-recommendation" value={recommendation} onChange={event => setRecommendation(event.target.value)} rows={3} disabled={busy}
                            aria-invalid={Boolean(errors.recommendation)} aria-describedby="escalation-recommendation-error" className={input} />
                        <p id="escalation-recommendation-error" role={errors.recommendation ? "alert" : undefined} className="text-xs text-red-700">{errors.recommendation?.[0]}</p>
                        <button type="submit" className={`${control} mt-1.5 w-full`} disabled={busy || !recommendation.trim()}>Save advice</button></form>}

                <form onSubmit={event => { event.preventDefault(); post(`${base}/${open.id}/close`, { closure_note: closureNote }); }} className="border-t border-slate-100 pt-3">
                    <label htmlFor="escalation-closure-note" className={label}>Close request</label>
                    <p className={hint}>{open.recommendation ? "Note (optional)." : "Add a note on why you’re closing."}</p>
                    <textarea id="escalation-closure-note" value={closureNote} onChange={event => setClosureNote(event.target.value)} rows={2} disabled={busy}
                        required={!open.recommendation} aria-invalid={Boolean(errors.closure_note)} aria-describedby="escalation-closure-note-error" className={input} />
                    <p id="escalation-closure-note-error" role={errors.closure_note ? "alert" : undefined} className="text-xs text-red-700">{errors.closure_note?.[0]}</p>
                    <button type="submit" className={`${control} mt-1.5 w-full`} disabled={busy || (!open.recommendation && !closureNote.trim())}>Close request</button>
                    <p className={`${hint} mt-1.5`}>Closing is final.</p>
                </form>
            </div>}

            {!!panel.closed.length && <div className="border-t border-slate-100 pt-3">
                <h3 className="text-xs font-semibold text-slate-700">Past requests</h3>
                <ul className="mt-2 space-y-2">{panel.closed.map(episode => <li key={episode.id} className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-700 ring-1 ring-inset ring-slate-200/70">
                    <p className="flex flex-wrap items-baseline justify-between gap-x-2"><span className="font-semibold">Closed {stamp(episode.closed_at)}</span><span className="text-[11px] text-slate-500">Opened {stamp(episode.created_at)}</span></p>
                    {/* An episode can close WITH a recommendation, WITHOUT one (the
                        closure note then explains why), or with both. Each present
                        field is labelled and rendered; an absent one renders nothing,
                        so the history never implies content that was not recorded. */}
                    {episode.recommendation && <div className="mt-2">
                        <p className="text-[11px] font-semibold text-slate-500">Advice</p>
                        <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-slate-800">{episode.recommendation}</p>
                    </div>}
                    {episode.closure_note && <div className="mt-2">
                        <p className="text-[11px] font-semibold text-slate-500">Note</p>
                        <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-slate-800">{episode.closure_note}</p>
                    </div>}
                </li>)}</ul>
            </div>}
        </section>
    </details>;
}
