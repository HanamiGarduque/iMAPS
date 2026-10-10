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
export const statusDots = { submitted: "bg-blue-500", in_review: "bg-amber-500", resolved: "bg-emerald-500", wont_fix: "bg-slate-400" };
export function Status({ value }) {
    const tone = { submitted: "bg-blue-50 text-blue-700 border-blue-200", in_review: "bg-amber-50 text-amber-800 border-amber-200", resolved: "bg-emerald-50 text-emerald-800 border-emerald-200", wont_fix: "bg-slate-50 text-slate-600 border-slate-200" };
    const dot = statusDots;
    return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-medium ${tone[value] || tone.wont_fix}`}><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot[value] || dot.wont_fix}`} />{statuses[value] || "Unknown status"}</span>;
}
/** Text label, not colour alone, carries the meaning. */
export function BlockingBadge() {
    return <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-700 ring-1 ring-inset ring-red-200"><svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /></svg>Blocks field work</span>;
}
export const card = "overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_1px_3px_rgba(15,23,42,0.06)]";
const icons = {
    report: "M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z",
    document: "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z",
    alert: "M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z",
    device: "M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3",
    code: "M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5",
    user: "M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z",
    check: "M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    action: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z",
    list: "M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm0 5.25h.007v.008H3.75V12zm0 5.25h.007v.008H3.75v-.008z",
};
/** Card heading: icon tile + sentence-case title, the same on every report card. */
export function CardTitle({ id, icon, tone = "slate", children }) {
    const tile = tone === "emerald" ? "bg-emerald-50 text-emerald-600 ring-emerald-100" : "bg-slate-50 text-slate-500 ring-slate-200/70";
    return <h2 id={id} className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3.5 text-sm font-semibold text-slate-900 sm:px-5">
        <span aria-hidden="true" className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ring-1 ring-inset ${tile}`}><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d={icons[icon]} /></svg></span>
        {children}
    </h2>;
}
export function Section({ title, icon = "document", children }) {
    return <section className={card}><CardTitle icon={icon}>{title}</CardTitle><dl className="grid grid-cols-1 gap-x-6 gap-y-5 p-4 sm:grid-cols-2 sm:p-5">{children}</dl></section>;
}
/** An unmatched reporter reads as "Unknown inspector"; its ID shows only in the report details panel. */
export function Reporter({ report }) {
    return <>{report.inspector?.resolved ? report.inspector.label : "Unknown inspector"}</>;
}

/** `fill` turns the page into a full-width, viewport-height workspace (no page scroll on large screens). */
export function ReportShell({ title = "Support Desk", fill = false, children }) {
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
            <main className="flex-1 overflow-y-auto"><div className={fill ? "flex w-full flex-col gap-3 p-3 sm:p-4 lg:h-full" : "mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6"}>
                {flash?.success && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{flash.success}</p>}
                {flash?.error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{flash.error}</p>}
                {children}
            </div></main>
        </div></div></>;
}
