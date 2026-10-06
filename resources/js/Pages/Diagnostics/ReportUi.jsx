import React, { useEffect, useState } from "react";
import { Head, router, usePage } from "@inertiajs/react";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import Swal from "sweetalert2";

export const control = "inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50";
export const typeLabels = { technical_issue: "Technical Issues", application_support: "Application Support" };
export const statuses = { submitted: "Submitted", in_review: "In review", resolved: "Resolved", wont_fix: "Won’t fix" };
export function stamp(value) {
    const date = value && new Date(value);
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "Not provided";
}
export function Status({ value }) {
    const tone = { submitted: "bg-blue-50 text-blue-700", in_review: "bg-amber-50 text-amber-800", resolved: "bg-emerald-50 text-emerald-800", wont_fix: "bg-slate-100 text-slate-600" };
    return <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${tone[value] || tone.wont_fix}`}>{statuses[value] || "Unknown status"}</span>;
}
export function Field({ label, value }) {
    return <div className="min-w-0"><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{value ?? "Not provided"}</dd></div>;
}
export function Section({ title, children }) {
    return <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"><h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h2><dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</dl></section>;
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
    const onLogout = () => Swal.fire({ title: "Sign Out?", text: "Are you sure you want to log out of iMAPS?", icon: "warning", showCancelButton: true, confirmButtonText: "Yes, sign out" }).then(({ isConfirmed }) => {
        if (isConfirmed) { sessionStorage.removeItem("hasShownWelcome"); router.post("/logout"); }
    });
    const shell = { userName: auth?.user?.name, userRole: auth?.user?.role, sidebarOpen, setSidebarOpen, onLogout, activePage: "diagnostics" };
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
