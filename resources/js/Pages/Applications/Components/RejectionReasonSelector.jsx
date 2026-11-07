import React, { useMemo } from "react";
import {
    REJECTION_CATEGORIES,
    REJECTION_REASONS,
    REJECTION_REASONS_BY_CATEGORY,
    getReason,
    formatDecisionReason,
} from "../data/rejectionReasons";
import { Label, Select, Textarea } from "./FormControls";

/**
 * Parses an existing decision_reason into category, code, and notes if possible.
 */
function parseInitialReason(decisionReason) {
    if (!decisionReason || typeof decisionReason !== "string") {
        return { code: "", notes: "" };
    }
    const match = decisionReason.match(/^\[(.*?) - (.*?)\]\s*(.*)$/s);
    if (match) {
        const [, cat, lbl, notes] = match;
        const found = Object.values(REJECTION_REASONS).find(
            (r) => r.category === cat && r.label === lbl
        );
        if (found) {
            return { code: found.code, category: found.category, notes: notes || "" };
        }
    }
    return { code: "", notes: decisionReason };
}

export default function RejectionReasonSelector({
    category = "",
    reasonCode = "",
    notes = "",
    decisionReason = "",
    onChange,
    errors = {},
    prefix = "",
    compact = false,
}) {
    // If reasonCode is empty but decisionReason is provided, attempt smart parse
    const resolvedCode = useMemo(() => {
        if (reasonCode) return reasonCode;
        if (decisionReason) {
            const parsed = parseInitialReason(decisionReason);
            if (parsed.code) return parsed.code;
        }
        return "";
    }, [reasonCode, decisionReason]);

    const activeReason = useMemo(() => getReason(resolvedCode), [resolvedCode]);

    const resolvedCategory = useMemo(() => {
        if (category) return category;
        if (activeReason) return activeReason.category;
        return "";
    }, [category, activeReason]);

    const resolvedNotes = useMemo(() => {
        if (notes !== undefined && notes !== "") return notes;
        if (decisionReason) {
            const parsed = parseInitialReason(decisionReason);
            // If the decision reason matches the default template description, keep notes empty
            if (activeReason && parsed.notes === activeReason.description) {
                return "";
            }
            return parsed.notes;
        }
        return "";
    }, [notes, decisionReason, activeReason]);

    const handleCategoryChange = (e) => {
        const newCat = e.target.value;
        let newCode = resolvedCode;
        // If current code doesn't belong to the newly selected category, reset it
        if (activeReason && activeReason.category !== newCat) {
            newCode = "";
        }
        const updatedReason = getReason(newCode);
        const composite = formatDecisionReason(newCode, resolvedNotes);

        onChange?.({
            rejection_category: newCat,
            rejection_code: newCode,
            decision_reason: composite,
            notes: resolvedNotes,
        });
    };

    const handleReasonChange = (e) => {
        const newCode = e.target.value;
        const item = getReason(newCode);
        const newCat = item ? item.category : resolvedCategory;
        const composite = formatDecisionReason(newCode, resolvedNotes);

        onChange?.({
            rejection_category: newCat,
            rejection_code: newCode,
            decision_reason: composite,
            notes: resolvedNotes,
        });
    };

    const handleNotesChange = (e) => {
        const newNotes = e.target.value;
        const composite = formatDecisionReason(resolvedCode, newNotes);

        onChange?.({
            rejection_category: resolvedCategory,
            rejection_code: resolvedCode,
            decision_reason: composite,
            notes: newNotes,
        });
    };

    // Filtered reasons list based on category if selected, otherwise all grouped
    const availableReasons = useMemo(() => {
        if (resolvedCategory && REJECTION_REASONS_BY_CATEGORY[resolvedCategory]) {
            return REJECTION_REASONS_BY_CATEGORY[resolvedCategory];
        }
        return Object.values(REJECTION_REASONS);
    }, [resolvedCategory]);

    const categoryErrorKey = prefix ? `${prefix}.rejection_category` : "rejection_category";
    const codeErrorKey = prefix ? `${prefix}.rejection_code` : "rejection_code";
    const reasonErrorKey = prefix ? `${prefix}.decision_reason` : "decision_reason";

    const hasCategoryError = !!errors[categoryErrorKey];
    const hasCodeError = !!errors[codeErrorKey];
    const hasReasonError = !!errors[reasonErrorKey];

    const isNotesRequired = activeReason?.requires_notes || resolvedCode === "OTHER_REGULATORY_GROUND";

    return (
        <div className="space-y-3 bg-white/60 p-3 rounded-xl border border-rose-200/80 shadow-xs">
            {/* Category and Specific Reason Grid */}
            <div className={`grid ${compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"} gap-3`}>
                {/* 1. Category Selector */}
                <div>
                    <Label required hasError={hasCategoryError}>
                        Rejection Category
                    </Label>
                    <Select
                        value={resolvedCategory}
                        onChange={handleCategoryChange}
                        hasError={hasCategoryError}
                        className="text-xs"
                    >
                        <option value="">-- Select Regulatory Category --</option>
                        {REJECTION_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                                {cat}
                            </option>
                        ))}
                    </Select>
                    {errors[categoryErrorKey] && (
                        <p className="text-[10px] font-medium text-rose-500 mt-1">
                            {errors[categoryErrorKey]}
                        </p>
                    )}
                </div>

                {/* 2. Specific Reason Selector */}
                <div>
                    <Label required hasError={hasCodeError || hasReasonError}>
                        Specific Cause / Basis
                    </Label>
                    <Select
                        value={resolvedCode}
                        onChange={handleReasonChange}
                        hasError={hasCodeError || hasReasonError}
                        className="text-xs"
                    >
                        <option value="">-- Select Specific Rejection Ground --</option>
                        {resolvedCategory ? (
                            availableReasons.map((r) => (
                                <option key={r.code} value={r.code}>
                                    {r.label}
                                </option>
                            ))
                        ) : (
                            REJECTION_CATEGORIES.map((cat) => (
                                <optgroup key={cat} label={cat}>
                                    {(REJECTION_REASONS_BY_CATEGORY[cat] || []).map((r) => (
                                        <option key={r.code} value={r.code}>
                                            {r.label}
                                        </option>
                                    ))}
                                </optgroup>
                            ))
                        )}
                    </Select>
                    {(errors[codeErrorKey] || errors[reasonErrorKey]) && (
                        <p className="text-[10px] font-medium text-rose-500 mt-1">
                            {errors[codeErrorKey] || errors[reasonErrorKey]}
                        </p>
                    )}
                </div>
            </div>

            {/* Regulatory Basis & Citation Callout */}
            {activeReason && (
                <div className="p-2.5 rounded-lg bg-rose-50/70 border border-rose-200/60 text-xs text-rose-950 space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-bold bg-rose-200/80 text-rose-800 tracking-wide uppercase">
                            Legal Basis
                        </span>
                        <span className="font-semibold text-rose-900">
                            {activeReason.regulatory_basis}
                        </span>
                    </div>
                    <p className="text-slate-700 text-[11.5px] leading-relaxed">
                        {activeReason.description}
                    </p>
                </div>
            )}

            {/* Explanatory / Supplemental Notes Textarea */}
            <div>
                <Label required={isNotesRequired} hasError={hasReasonError}>
                    {isNotesRequired ? "Detailed Regulatory Explanation" : "Supplemental Findings & Recommendations (Optional)"}
                </Label>
                <Textarea
                    rows={compact ? 2 : 3}
                    value={resolvedNotes}
                    onChange={handleNotesChange}
                    placeholder={
                        isNotesRequired
                            ? "Mandatory: detail the specific municipal ordinance, resolution, or statutory ground..."
                            : "Add specific lot findings, setback measurements, or recommendations for compliance..."
                    }
                    hasError={hasReasonError && isNotesRequired && !resolvedNotes}
                />
            </div>

            {/* Composite Reason Preview Badge */}
            {resolvedCode && (
                <div className="text-[11px] text-slate-500 flex items-start gap-1.5 pt-1">
                    <span className="font-semibold text-slate-600 shrink-0">Official Notice Text:</span>
                    <span className="italic text-slate-700 bg-slate-100/90 px-2 py-1 rounded-md border border-slate-200 leading-snug break-words flex-1">
                        {formatDecisionReason(resolvedCode, resolvedNotes)}
                    </span>
                </div>
            )}
        </div>
    );
}
