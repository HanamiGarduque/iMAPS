import React from "react";
import { Label, Textarea } from "./FormControls";

export default function ParcelInspectionScheduler({
    index,
    parcel,
    setParcelField,
    inspectors = [],
    errors = {}
}) {
    const decision = parcel.decision || "";

    return (
        <div className={`mt-3 p-4 rounded-2xl border transition-all duration-200 ${
            decision === 'Approved' ? 'border-emerald-200 bg-emerald-50/30' :
            decision === 'Declined' ? 'border-rose-200 bg-rose-50/30' :
            decision === 'Needs Site Inspection' ? 'border-amber-300 bg-amber-50/50' :
            'border-slate-200 bg-slate-50/50'
        }`}>
            {/* 3-Way Decision Toggle */}
            <div>
                <Label hasError={!!errors[`parcels.${index}.decision`]}>Parcel Evaluation Decision</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-1">
                    {["Approved", "Needs Site Inspection", "Declined"].map((d) => {
                        const isSelected = decision === d;
                        return (
                            <button
                                type="button"
                                key={d}
                                onClick={() => setParcelField(index, "decision")({ target: { value: isSelected ? "" : d } })}
                                className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all border text-center ${
                                    isSelected
                                        ? d === "Approved"
                                            ? "bg-emerald-50 border-emerald-500 text-emerald-700 shadow-xs ring-1 ring-emerald-500"
                                            : d === "Declined"
                                            ? "bg-rose-50 border-rose-500 text-rose-700 shadow-xs ring-1 ring-rose-500"
                                            : "bg-amber-50 border-amber-500 text-amber-700 shadow-xs ring-1 ring-amber-500"
                                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                                }`}
                            >
                                {d}
                            </button>
                        );
                    })}
                </div>
                {errors[`parcels.${index}.decision`] && <p className="text-[10px] font-medium text-rose-500 mt-1">{errors[`parcels.${index}.decision`]}</p>}
            </div>

            {/* Declined Reason Block */}
            {decision === "Declined" && (
                <div className="mt-3 pt-3 border-t border-rose-200/60 animate-in fade-in slide-in-from-top-2">
                    <Label required hasError={!!errors[`parcels.${index}.decision_reason`]}>Reason for Declination</Label>
                    <Textarea
                        rows={2}
                        value={parcel.decision_reason || ""}
                        onChange={setParcelField(index, "decision_reason")}
                        placeholder="Specify the regulatory basis for declining this specific parcel..."
                        hasError={!!errors[`parcels.${index}.decision_reason`]}
                    />
                    {errors[`parcels.${index}.decision_reason`] && <p className="text-[10px] font-medium text-rose-500 mt-1">{errors[`parcels.${index}.decision_reason`]}</p>}
                </div>
            )}

            {/* Site Inspection Scheduling Block */}
            {decision === "Needs Site Inspection" && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 mt-3 border-t border-amber-200/60 animate-in fade-in slide-in-from-top-2">
                    <div>
                        <Label required hasError={!!errors[`parcels.${index}.inspector_id`]}>Select Inspector</Label>
                        <select
                            value={parcel.inspector_id || ""}
                            onChange={setParcelField(index, "inspector_id")}
                            className={`w-full rounded-xl border px-3 py-2 text-xs font-medium text-slate-700 outline-none bg-white ${errors[`parcels.${index}.inspector_id`] ? "border-rose-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10" : "border-slate-200 focus:border-blue-500"}`}
                        >
                            <option value="">-- Choose --</option>
                            {inspectors.map((i) => (
                                <option key={i.id} value={i.id}>{i.name}</option>
                            ))}
                        </select>
                        {errors[`parcels.${index}.inspector_id`] && <p className="text-[10px] font-medium text-rose-500 mt-1">{errors[`parcels.${index}.inspector_id`]}</p>}
                    </div>
                    <div>
                        <Label required hasError={!!errors[`parcels.${index}.scheduled_date`]}>Inspection Date</Label>
                        <input
                            type="date"
                            min={new Date().toISOString().split("T")[0]}
                            value={parcel.scheduled_date || ""}
                            onChange={setParcelField(index, "scheduled_date")}
                            className={`w-full rounded-xl border px-3 py-2 text-xs font-medium text-slate-700 outline-none bg-white ${errors[`parcels.${index}.scheduled_date`] ? "border-rose-300" : "border-slate-200 focus:border-blue-500"}`}
                        />
                        {errors[`parcels.${index}.scheduled_date`] && <p className="text-[10px] font-medium text-rose-500 mt-1">{errors[`parcels.${index}.scheduled_date`]}</p>}
                    </div>
                    <div>
                        <Label required hasError={!!errors[`parcels.${index}.deadline_date`]}>Deadline</Label>
                        <input
                            type="date"
                            min={parcel.scheduled_date || new Date().toISOString().split("T")[0]}
                            value={parcel.deadline_date || ""}
                            onChange={setParcelField(index, "deadline_date")}
                            className={`w-full rounded-xl border px-3 py-2 text-xs font-medium text-slate-700 outline-none bg-white ${errors[`parcels.${index}.deadline_date`] ? "border-rose-300" : "border-slate-200 focus:border-blue-500"}`}
                        />
                        {errors[`parcels.${index}.deadline_date`] && <p className="text-[10px] font-medium text-rose-500 mt-1">{errors[`parcels.${index}.deadline_date`]}</p>}
                    </div>
                    <div className="sm:col-span-3">
                        <Label hasError={!!errors[`parcels.${index}.assigned_notes`]}>Assignment Instructions</Label>
                        <Textarea
                            rows={2}
                            value={parcel.assigned_notes || ""}
                            onChange={setParcelField(index, "assigned_notes")}
                            placeholder="Add any instructions or notes for the site inspector..."
                            hasError={!!errors[`parcels.${index}.assigned_notes`]}
                        />
                        {errors[`parcels.${index}.assigned_notes`] && <p className="text-[10px] font-medium text-rose-500 mt-1">{errors[`parcels.${index}.assigned_notes`]}</p>}
                    </div>
                </div>
            )}

        </div>
    );
}