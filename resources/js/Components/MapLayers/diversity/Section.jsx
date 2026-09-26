import React from "react";

// Structural primitive for the docked panel.
//
// The panel used to be a stack of floating rounded cards on a tinted
// background — card borders, card shadows and panel chrome all competing at
// once. Docked and opaque, the panel doesn't need cards: sections are separated
// by a single hairline rule, which is quieter and lets the data hold the
// contrast.
export default function Section({ title, meta, children, className = "" }) {
    return (
        <section className={`px-4 py-3.5 border-b border-slate-200 ${className}`}>
            {(title || meta) && (
                <header className="flex items-baseline justify-between gap-2 mb-2.5">
                    {title && (
                        <h4 className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                            {title}
                        </h4>
                    )}
                    {meta && <span className="text-[10px] text-slate-400 font-medium shrink-0">{meta}</span>}
                </header>
            )}
            {children}
        </section>
    );
}

// Label/value row. Figures use tabular numerals so columns of numbers line up
// as the selection changes.
export function Row({ label, value, accent, mono = true }) {
    return (
        <div className="flex items-center justify-between gap-3 py-1">
            <span className="text-[11px] text-slate-600">{label}</span>
            <span
                className={`text-[11px] font-bold shrink-0 ${mono ? "font-mono tabular-nums" : ""}`}
                style={accent ? { color: accent } : undefined}
            >
                {value}
            </span>
        </div>
    );
}

// Horizontal measure. Flat fill, no gradient, no glow.
export function Meter({ label, value, display, color, max = 1 }) {
    const pct = Math.min(100, Math.max(0, (Math.abs(Number(value) || 0) / max) * 100));
    return (
        <div className="mb-2.5 last:mb-0">
            <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-slate-600">{label}</span>
                <span className="text-[11px] font-mono tabular-nums font-bold text-slate-900">{display}</span>
            </div>
            <div className="h-1.5 bg-slate-150 rounded-sm overflow-hidden" style={{ backgroundColor: "#e9edf2" }}>
                <div
                    className="h-full rounded-sm transition-[width] duration-500 ease-out"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                />
            </div>
        </div>
    );
}
