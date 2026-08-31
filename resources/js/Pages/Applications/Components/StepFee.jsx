// resources/js/Pages/Applications/Components/StepFee.jsx
import React from "react";
import { Label, Input } from "./FormControls";

export default function StepFee({
    form,
    set,
    feeMode = "auto",
    setFeeMode,
    calculatedFeeBreakdown = {},
    errors = {},
}) {
    return (
        <div className="space-y-4">
            {/* Calculation Mode Header */}
            <div className="flex items-center justify-between bg-slate-50 p-2 rounded-2xl border border-slate-200">
                <span className="text-xs font-bold text-slate-800 px-2">Municipal Assessment Fee</span>
                <div className="flex items-center bg-slate-200/80 p-0.5 rounded-xl text-[11px] font-semibold">
                    <button
                        type="button"
                        onClick={() => setFeeMode("auto")}
                        className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                            feeMode === "auto" 
                                ? "bg-white text-blue-700 shadow-xs font-bold" 
                                : "text-slate-600 hover:text-slate-900"
                        }`}
                    >
                        Auto-Calculate
                    </button>
                    <button
                        type="button"
                        onClick={() => setFeeMode("manual")}
                        className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                            feeMode === "manual" 
                                ? "bg-white text-blue-700 shadow-xs font-bold" 
                                : "text-slate-600 hover:text-slate-900"
                        }`}
                    >
                        Manual Override
                    </button>
                </div>
            </div>

            {/* ── AUTO-CALCULATION DISPLAY ── */}
            {feeMode === "auto" ? (
                <div className="bg-blue-50/50 rounded-2xl p-4 sm:p-5 border border-blue-200/80 space-y-3">
                    <div className="flex items-center justify-between border-b border-blue-200/60 pb-2">
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800">Official Municipal Fee Rate</span>
                            <p className="text-[11px] text-blue-900 font-medium">{calculatedFeeBreakdown.formulaDesc}</p>
                        </div>
                        <span className="text-[10px] font-mono font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md">
                            {form.application_type || "Locational Clearance"}
                        </span>
                    </div>

                    {/* Declared Bill of Materials Input (for Locational Clearance) */}
                    {form.application_type === "Locational Clearance" && (
                        <div className="bg-white p-3 rounded-xl border border-blue-100 space-y-1">
                            <div className="flex items-center justify-between">
                                <Label required>Declared Project Cost (Bill of Materials)</Label>
                                <span className="text-[10px] font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md font-semibold">HLURB 2013 Res. 912</span>
                            </div>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 font-mono text-sm font-bold pointer-events-none">₱</span>
                                <Input
                                    type="number"
                                    step="1000"
                                    min="0"
                                    value={form.project_cost || ""}
                                    onChange={set("project_cost")}
                                    placeholder="0.00"
                                    className="pl-8 font-mono text-sm font-bold bg-slate-50 text-slate-900"
                                />
                            </div>
                            <p className="text-[10px] text-slate-500">Tier bracket calculated automatically based on {form.land_use_class || "Residential"} project cost.</p>
                        </div>
                    )}

                    {/* Formula Breakdown Badges */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div className="p-2.5 bg-white rounded-xl border border-blue-100">
                            <p className="text-[10px] text-slate-400 font-medium">Rate Specification</p>
                            <p className="font-semibold text-slate-800 mt-0.5 text-[11px]">{calculatedFeeBreakdown.rateDetail}</p>
                        </div>
                        <div className="p-2.5 bg-white rounded-xl border border-blue-100">
                            <p className="text-[10px] text-slate-400 font-medium">Calculation Summary</p>
                            <p className="font-mono font-bold text-slate-900 mt-0.5 text-[11px]">{calculatedFeeBreakdown.calculationSummary}</p>
                        </div>
                    </div>

                    {/* Calculated Total Banner */}
                    <div className="pt-2.5 border-t border-blue-200/80 flex items-center justify-between">
                        <div>
                            <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Assessed Assessment Fee</span>
                            <p className="text-[10px] text-slate-500 font-medium">Total Municipal Clearance Fee</p>
                        </div>
                        <div className="text-right">
                            <span className="text-2xl font-mono font-extrabold text-blue-700 tracking-tight">
                                ₱ {(Number(calculatedFeeBreakdown.total) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>
                </div>
            ) : (
                /* ── MANUAL OVERRIDE INPUT ── */
                <div className="p-4 bg-amber-50/50 border border-amber-200 rounded-2xl space-y-3">
                    <div>
                        <div className="flex items-center justify-between">
                            <Label required hasError={!!errors.assessment_fee}>Custom Assessment Fee (₱)</Label>
                            <button
                                type="button"
                                onClick={() => {
                                    setFeeMode("auto");
                                }}
                                className="text-[11px] text-amber-800 hover:text-amber-950 font-semibold cursor-pointer underline"
                            >
                                Reset to Formula
                            </button>
                        </div>
                        <div className="relative mt-1">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 font-mono text-sm font-bold pointer-events-none">₱</span>
                            <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={form.assessment_fee || ""}
                                onChange={set("assessment_fee")}
                                placeholder="0.00"
                                className="pl-8 font-mono text-base font-bold bg-white text-slate-900"
                                hasError={!!errors.assessment_fee}
                            />
                        </div>
                        {errors.assessment_fee && <p className="text-xs font-medium text-rose-500 mt-1">{errors.assessment_fee}</p>}
                        <p className="text-xs text-amber-800/80 mt-1">Manual override enabled. Enter the exact fee as assessed by the Municipal Treasurer / Sangguniang Bayan.</p>
                    </div>
                </div>
            )}

            {/* Official Receipt (OR) Number */}
            <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200">
                <Label hasError={!!errors.or_number}>Official Receipt (OR) Number</Label>
                <Input
                    type="text"
                    value={form.or_number || ""}
                    onChange={set("or_number")}
                    placeholder="e.g. OR-2026-98124 (Leave blank if pending payment)"
                    className="font-mono bg-white uppercase mt-1"
                    hasError={!!errors.or_number}
                />
                {errors.or_number && <p className="text-xs font-medium text-rose-500 mt-1">{errors.or_number}</p>}
                <p className="text-xs text-slate-400 mt-1">Optional upon filing. Can be recorded after payment has been cleared by Municipal Treasury.</p>
            </div>
        </div>
    );
}
