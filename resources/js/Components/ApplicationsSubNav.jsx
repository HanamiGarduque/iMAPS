import React from "react";
import { Link } from "@inertiajs/react";

/**
 * Persistent Applications sub-navigation.
 *
 * APPLICATIONS is the parent module. All Applications, Technical Review and
 * Drafts are SIBLING SECTIONS of it, not three unrelated top-level modules:
 *
 *   APPLICATIONS
 *     |- All Applications
 *     |- Technical Review
 *     `- Drafts
 *
 * This component is the single owner of that structure so the three subsection
 * pages cannot drift apart. It is rendered by every one of them, which is what
 * lets an officer move between Technical Review and Drafts without going back
 * to All Applications first.
 *
 * Scope rules:
 *  - The parent MODULE context lives in the header badge (always APPLICATIONS).
 *    The page H1 names the SUBSECTION. They are deliberately different things.
 *  - The sections are Planning Officer workflow. A read-only role gets nothing
 *    here rather than a partial or misleading set, so Admin is never offered a
 *    Planning Officer work queue or draft records.
 *  - Page-specific actions (filters, search, print, export, New Application)
 *    stay on their own page. Only the module context and this sub-navigation
 *    are shared.
 */

const SECTIONS = [
    { key: "all", label: "All Applications", href: "/applications" },
    { key: "technical-review", label: "Technical Review", href: "/technical-review" },
    { key: "drafts", label: "Drafts", href: "/applications/drafts" },
];

export default function ApplicationsSubNav({ active = "all", userRole = "" }) {
    // Planning Officer workflow only. Backend role middleware remains the
    // security boundary; this is presentation.
    if (userRole !== "Planning Officer") {
        return null;
    }

    return (
        <nav
            aria-label="Application sections"
            className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100/70 border border-slate-200/80 shadow-2xs shrink-0"
        >
            <span className="hidden sm:inline px-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 self-center">
                Applications
            </span>
            {SECTIONS.map((section) => {
                const isActive = section.key === active;
                return (
                    <Link
                        key={section.key}
                        href={section.href}
                        aria-current={isActive ? "page" : undefined}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            isActive
                                ? "bg-white text-blue-700 shadow-2xs border border-blue-200/80"
                                : "text-slate-600 hover:text-slate-900 hover:bg-white/70 border border-transparent"
                        }`}
                    >
                        {section.label}
                    </Link>
                );
            })}
        </nav>
    );
}
