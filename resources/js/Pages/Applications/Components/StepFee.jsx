// resources/js/Pages/Applications/Components/StepFee.jsx
import React, { useEffect } from "react";
import { Label, Input } from "./FormControls";

export default function StepFee({
    form,
    set,
    errors = {},
}) {
    // Automatically sum all inputs (including penalties) to update the total assessment fee in real-time
    useEffect(() => {
        const zc = parseFloat(form.zoning_certificate_fee) || 0;
        const lc = parseFloat(form.locational_clearance_fee) || 0;
        const dp = parseFloat(form.development_permit_fee) || 0;
        const ot = parseFloat(form.other_fees) || 0;
        const pen = parseFloat(form.penalty_fee) || 0;

        const total = zc + lc + dp + ot + pen;
        
        if (total.toFixed(2) !== form.assessment_fee) {
            set("assessment_fee")({ target: { value: total.toFixed(2) } });
        }
    }, [form.zoning_certificate_fee, form.locational_clearance_fee, form.development_permit_fee, form.other_fees, form.penalty_fee]);

    // Custom handler to block leading zeros (e.g. "05" -> "5", but allows "0.50")
    const handleFeeInput = (field) => (e) => {
        let val = e.target.value;
        
        // If the user types a leading zero followed by a digit without a decimal point (e.g., "05"), strip the zero
        if (/^0[0-9]/.test(val)) {
            val = val.replace(/^0+/, "");
        }

        set(field)({ target: { value: val } });
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <div>
                    <span className="text-xs font-bold text-slate-800">Itemized Municipal Assessment Fees</span>
                    <p className="text-[11px] text-slate-500">Totals reflect all itemized inputs and penalties combined.</p>
                </div>
                <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Computed Total Fee</span>
                    <span className="text-lg font-mono font-bold text-blue-700">
                        ₱ {Number(form.assessment_fee || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                    <Label>Zoning Certificate Fee (₱)</Label>
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 font-mono text-xs font-bold pointer-events-none">₱</span>
                        <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={form.zoning_certificate_fee || ""}
                            onChange={handleFeeInput("zoning_certificate_fee")}
                            placeholder="0.00"
                            className="pl-8 font-mono text-xs font-semibold bg-white"
                        />
                    </div>
                </div>

                <div>
                    <Label>Locational Clearance Fee (₱)</Label>
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 font-mono text-xs font-bold pointer-events-none">₱</span>
                        <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={form.locational_clearance_fee || ""}
                            onChange={handleFeeInput("locational_clearance_fee")}
                            placeholder="0.00"
                            className="pl-8 font-mono text-xs font-semibold bg-white"
                        />
                    </div>
                </div>

                <div>
                    <Label>Development Permit Fee (₱)</Label>
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 font-mono text-xs font-bold pointer-events-none">₱</span>
                        <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={form.development_permit_fee || ""}
                            onChange={handleFeeInput("development_permit_fee")}
                            placeholder="0.00"
                            className="pl-8 font-mono text-xs font-semibold bg-white"
                        />
                    </div>
                </div>

                <div>
                    <Label>Other Fees (₱)</Label>
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 font-mono text-xs font-bold pointer-events-none">₱</span>
                        <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={form.other_fees || ""}
                            onChange={handleFeeInput("other_fees")}
                            placeholder="0.00"
                            className="pl-8 font-mono text-xs font-semibold bg-white"
                        />
                    </div>
                </div>

                <div>
                    <Label>Penalty Fee (₱)</Label>
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 font-mono text-xs font-bold pointer-events-none">₱</span>
                        <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={form.penalty_fee || ""}
                            onChange={handleFeeInput("penalty_fee")}
                            placeholder="0.00"
                            className="pl-8 font-mono text-xs font-semibold bg-white"
                        />
                    </div>
                </div>

                <div>
                    <Label required hasError={!!errors.date_of_receipt}>Date of Receipt</Label>
                    <Input
                        type="date"
                        value={form.date_of_receipt || ""}
                        onChange={set("date_of_receipt")}
                        className="bg-white text-xs font-semibold"
                        hasError={!!errors.date_of_receipt}
                    />
                    {errors.date_of_receipt && <p className="text-xs font-medium text-rose-500 mt-1">{errors.date_of_receipt}</p>}
                </div>
            </div>

            {/* Official Receipt (OR) Number */}
            <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200 mt-2">
                <Label hasError={!!errors.or_number}>Official Receipt (OR) Number</Label>
                <Input
                    type="text"
                    value={form.or_number || ""}
                    onChange={set("or_number")}
                    placeholder="e.g. OR-2026-98124"
                    className="font-mono bg-white uppercase mt-1"
                    hasError={!!errors.or_number}
                />
                {errors.or_number && <p className="text-xs font-medium text-rose-500 mt-1">{errors.or_number}</p>}
            </div>
        </div>
    );
}