// resources/js/Pages/Applications/Components/PreviousRecordSearch.jsx
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useDebouncedLookup from "@/utils/useDebouncedLookup";

const formatDate = (d) => (d ? new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "");
const formatArea = (a) => (a != null && a !== "" ? `${Number(a).toLocaleString("en-PH", { maximumFractionDigits: 2 })} sqm` : "");

// Finds a returning applicant's or corporation's previous application and hands its
// details, with the lots chosen here, to onApply(record, lots)
export default function PreviousRecordSearch({ open, onClose, onApply }) {
    const [query, setQuery] = useState("");
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState(null);
    const [checkedPins, setCheckedPins] = useState(new Set());
    const inputRef = useRef(null);

    const search = useDebouncedLookup("/applications/previous-records", (data) => {
        setRows(data);
        setLoading(false);
    });

    // Fresh search each time; Escape reads the latest onClose through a ref (the parent passes a new function each render)
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    useEffect(() => {
        if (!open) return;
        setQuery("");
        setRows([]);
        setSelected(null);
        inputRef.current?.focus();
        const onKey = (e) => e.key === "Escape" && onCloseRef.current();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open]);

    if (!open) return null;

    const onQueryChange = (e) => {
        const val = e.target.value;
        setQuery(val);
        setLoading(val.trim().length >= 3);
        search(val);
    };

    const choose = (record) => {
        setSelected(record);
        // Every lot that can be verified again is chosen by default
        setCheckedPins(new Set(record.parcels.map((p) => p.property_index_number?.trim()).filter(Boolean)));
    };

    const togglePin = (pin) =>
        setCheckedPins((prev) => {
            const next = new Set(prev);
            next.has(pin) ? next.delete(pin) : next.add(pin);
            return next;
        });

    const apply = () => onApply(selected, selected.parcels.filter((p) => checkedPins.has(p.property_index_number?.trim())));

    return createPortal(
        <div
            className="fixed inset-0 z-[2000] bg-slate-900/60 flex items-start justify-center p-4 sm:pt-20 overflow-auto animate-fade-in duration-150"
            role="dialog"
            aria-modal="true"
            aria-label="Retrieve existing applicant record"
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
                <div className="px-5 pt-4 pb-3 border-b border-slate-100">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h2 className="text-base font-bold text-slate-900">Retrieve existing applicant record</h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Search by applicant name, corporation, email address, or contact number. The applicant details and selected lots from the chosen record will be applied to this application.
                            </p>
                        </div>
                        <button type="button" onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer" aria-label="Close">
                            ✕
                        </button>
                    </div>
                    {!selected && (
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={onQueryChange}
                            onKeyDown={(e) => e.key === "Enter" && !loading && rows[0] && choose(rows[0])}
                            data-no-advance
                            placeholder="e.g. Juan Reyes, Rosario Realty Corp., 0917…"
                            className="mt-3 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-500"
                        />
                    )}
                </div>

                {!selected ? (
                    <div className="max-h-[60vh] overflow-y-auto">
                        {loading && <p className="px-5 py-4 text-xs text-slate-500">Searching…</p>}
                        {!loading && query.trim().length >= 3 && rows.length === 0 && (
                            <p className="px-5 py-4 text-xs text-slate-500">No previous application matches “{query.trim()}”.</p>
                        )}
                        {!loading && query.trim().length < 3 && <p className="px-5 py-4 text-xs text-slate-400">Type at least 3 characters.</p>}
                        {!loading &&
                            rows.map((r) => (
                                <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => choose(r)}
                                    className="w-full text-left px-5 py-3 border-b border-slate-100 last:border-b-0 hover:bg-blue-50/60 cursor-pointer"
                                >
                                    <p className="text-sm font-semibold text-slate-900 truncate">{r.corporation_name || r.applicant_name}</p>
                                    {r.corporation_name && <p className="text-xs text-slate-600 truncate">Applicant: {r.applicant_name}</p>}
                                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                                        <span className="font-mono">{r.reference_number}</span>
                                        {r.application_type ? ` · ${r.application_type}` : ""}
                                        {r.date ? ` · ${formatDate(r.date)}` : ""}
                                        {` · ${r.parcels.length} lot${r.parcels.length === 1 ? "" : "s"}`}
                                    </p>
                                </button>
                            ))}
                    </div>
                ) : (
                    <div className="px-5 py-4 space-y-4 max-h-[65vh] overflow-y-auto">
                        <div className="text-xs space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                From <span className="font-mono">{selected.reference_number}</span>
                                {selected.date ? ` · ${formatDate(selected.date)}` : ""}
                            </p>
                            <p className="text-sm font-semibold text-slate-900">{selected.applicant_name}</p>
                            {(selected.applicant_street || selected.applicant_barangay) && (
                                <p className="text-slate-600">{[selected.applicant_street, selected.applicant_barangay].filter(Boolean).join(", ")}</p>
                            )}
                            <p className="text-slate-600 font-mono">{[selected.contact_number, selected.email].filter(Boolean).join(" · ")}</p>
                            {selected.corporation_name && (
                                <p className="text-slate-600">
                                    Corporation: <span className="font-semibold text-slate-800">{selected.corporation_name}</span>
                                </p>
                            )}
                            {selected.representative_name && <p className="text-slate-600">Representative: {selected.representative_name}</p>}
                        </div>

                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Lots in that application</p>
                            {selected.parcels.length === 0 && <p className="text-xs text-slate-500">This application has no lots on record.</p>}
                            <div className="space-y-1.5">
                                {selected.parcels.map((p, i) => {
                                    const pin = p.property_index_number?.trim();
                                    return (
                                        <label
                                            key={pin || `lot-${i}`}
                                            className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 text-xs ${pin ? "border-slate-200 cursor-pointer hover:bg-slate-50" : "border-dashed border-slate-200 text-slate-400"}`}
                                        >
                                            <input
                                                type="checkbox"
                                                className="mt-0.5"
                                                data-no-advance
                                                disabled={!pin}
                                                checked={Boolean(pin) && checkedPins.has(pin)}
                                                onChange={() => togglePin(pin)}
                                            />
                                            <span className="min-w-0">
                                                <span className="font-mono font-semibold text-slate-800">{pin || "No PIN"}</span>
                                                <span className="block text-slate-500 truncate">
                                                    {[p.lot_number && `Lot ${p.lot_number}`, p.barangay, formatArea(p.lot_area_sqm)].filter(Boolean).join(" · ")}
                                                </span>
                                                {!pin && <span className="block">Encode this lot by hand on the Property step.</span>}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                            {selected.parcels.some((p) => p.property_index_number?.trim()) && (
                                <p className="text-[11px] text-slate-500 mt-2">
                                    Chosen lots are checked again against the current tax map, so a change of owner or zoning shows on the Property step.
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {selected && (
                    <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-2">
                        <button type="button" onClick={() => setSelected(null)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 cursor-pointer">
                            ← Back to results
                        </button>
                        <button
                            type="button"
                            onClick={apply}
                            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs active:scale-95 cursor-pointer"
                        >
                            Fill form{checkedPins.size ? ` with ${checkedPins.size} lot${checkedPins.size === 1 ? "" : "s"}` : ""}
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
