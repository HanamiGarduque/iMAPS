import React, { useEffect, useState } from "react";
import { Head, usePage } from "@inertiajs/react";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import { confirmSignOut } from "@/utils/signOut";

export const control = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50";
export const primary = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-blue-700 bg-blue-700 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50";
export const typeLabels = { technical_issue: "Technical Issues", application_support: "Application Support" };
export const statuses = { submitted: "Submitted", in_review: "In review", resolved: "Resolved", wont_fix: "Won’t fix" };
export function stamp(value) {
    const date = value && new Date(value);
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "Not provided";
}
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const units = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
/** Relative time ("2 hours ago"); the full timestamp stays available as the tooltip. */
export function Ago({ value, label }) {
    const date = value && new Date(value);
    if (!date || Number.isNaN(date.getTime())) return <span className="text-slate-400">Not provided</span>;
    const seconds = (date.getTime() - Date.now()) / 1000;
    const [unit, size] = units.find(([, n]) => Math.abs(seconds) >= n) || units[units.length - 1];
    return <time dateTime={value} title={`${label ? `${label}: ` : ""}${stamp(value)}`}>{relative.format(Math.round(seconds / size), unit)}</time>;
}
export function Status({ value }) {
    const tone = { submitted: "bg-blue-50 text-blue-700 ring-blue-200", in_review: "bg-amber-50 text-amber-800 ring-amber-200", resolved: "bg-emerald-50 text-emerald-800 ring-emerald-200", wont_fix: "bg-slate-100 text-slate-600 ring-slate-200" };
    const dot = { submitted: "bg-blue-500", in_review: "bg-amber-500", resolved: "bg-emerald-500", wont_fix: "bg-slate-400" };
    return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${tone[value] || tone.wont_fix}`}><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot[value] || dot.wont_fix}`} />{statuses[value] || "Unknown status"}</span>;
}
/** Text label, not colour alone, carries the meaning. */
export function BlockingBadge() {
    return <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-700 ring-1 ring-inset ring-red-200"><svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /></svg>Blocks field work</span>;
}
export function Field({ label, value }) {
    return <div className="min-w-0"><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className={`mt-1 whitespace-pre-wrap break-words text-sm ${value == null || value === "" ? "text-slate-400" : "text-slate-900"}`}>{value == null || value === "" ? "Not provided" : value}</dd></div>;
}
export function Section({ title, children }) {
    return <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><h2 className="border-b border-slate-100 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 sm:px-5">{title}</h2><dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 sm:grid-cols-2 sm:p-5">{children}</dl></section>;
}
export function Reporter({ report }) {
    return <>{report.inspector?.label || "Unresolved inspector"}{report.inspector?.short_uuid ? ` (${report.inspector.short_uuid}…)` : ""}</>;
}
export function Blocks({ value }) { return value === true ? "Yes" : value === false ? "No" : "Not provided"; }

export function ReportShell({ title = "Reports & Support", children }) {
    const { auth, flash } = usePage().props;
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [clock, setClock] = useState("");
    useEffect(() => {
        const tick = () => setClock(new Date().toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }));
        tick(); const timer = setInterval(tick, 60000); return () => clearInterval(timer);
    }, []);
    const shell = { userName: auth?.user?.name, userRole: auth?.user?.role, sidebarOpen, setSidebarOpen, onLogout: confirmSignOut, activePage: "diagnostics" };
    return <><Head title={title} /><div className="flex h-screen flex-col overflow-hidden bg-slate-50/75 text-slate-800 antialiased">
        <Header {...shell} clock={clock} /><div className="relative flex min-h-0 flex-1 flex-col overflow-hidden"><Sidebar {...shell} />
            {sidebarOpen && <button aria-label="Close navigation" onClick={() => setSidebarOpen(false)} className="absolute inset-0 z-[750] bg-slate-900/20" />}
            <main className="flex-1 overflow-y-auto"><div className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
                {flash?.success && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{flash.success}</p>}
                {flash?.error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{flash.error}</p>}
                {children}
            </div></main>
        </div></div></>;
}
