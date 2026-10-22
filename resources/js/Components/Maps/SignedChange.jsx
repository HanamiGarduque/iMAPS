// "+179 from Yesterday": the signed figure bold in green (more) or red (fewer),
// what it is measured against in plain grey.
export default function SignedChange({ delta, baseLabel, className = "" }) {
    if (delta === null || delta === undefined || !baseLabel) return null;
    if (delta === 0) return <span className={`text-slate-500 ${className}`}>Same as {baseLabel}</span>;
    return (
        <span className={className}>
            <span className={`font-bold tabular-nums ${delta > 0 ? "text-[#1f9d55]" : "text-[#d1342a]"}`}>{delta > 0 ? "+" : "−"}{Math.abs(delta)}</span>
            <span className="text-slate-500"> from {baseLabel}</span>
        </span>
    );
}
