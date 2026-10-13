import { useState } from "react";
import { router } from "@inertiajs/react";

// Re-queues a failed FieldSync delivery. Render it only where the server said
// this viewer may resend the round; the server re-checks every rule, so the
// request body is empty and the page re-reads its props afterwards.
export default function RetryDeliveryButton({ inspectionId, className = "" }) {
    const [queueing, setQueueing] = useState(false);

    const retry = (e) => {
        e.stopPropagation();
        if (queueing) return;
        setQueueing(true);
        router.post(`/site-inspections/${encodeURIComponent(inspectionId)}/retry-delivery`, {}, {
            preserveScroll: true,
            onFinish: () => setQueueing(false),
        });
    };

    return (
        <button
            type="button"
            onClick={retry}
            // Rows that host this button open on click and Enter; keep both here.
            onKeyDown={(e) => e.stopPropagation()}
            disabled={queueing}
            aria-busy={queueing}
            aria-label={`Retry FieldSync delivery for inspection ${inspectionId}`}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 min-h-[28px] rounded-[6px] text-[10px] font-bold uppercase tracking-wider border transition-colors border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
        >
            {queueing ? "Queueing…" : "Retry Delivery"}
        </button>
    );
}
