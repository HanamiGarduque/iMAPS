// Placeholder shown while a map layer loads: a pale municipal silhouette with a
// soft shimmer, faded out (not popped) once the real layer is ready.
export default function MapSkeleton({ visible, label = "Loading map…", tone = "#f2f3f5" }) {
    return (
        <div
            className={`imaps-skeleton absolute inset-0 z-[460] flex items-center justify-center transition-opacity duration-500 ${
                visible ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            style={{ backgroundColor: tone }}
            aria-hidden={!visible}
        >
            <style>{SKELETON_CSS}</style>
            <svg viewBox="0 0 200 200" className="w-[46%] max-w-[420px] h-auto" aria-hidden="true">
                <defs>
                    <linearGradient id="imaps-skel-sheen" x1="0" x2="1" y1="0" y2="0">
                        <stop offset="0%" stopColor="#e3e7ec" />
                        <stop offset="50%" stopColor="#eef1f4" />
                        <stop offset="100%" stopColor="#e3e7ec" />
                    </linearGradient>
                </defs>
                {/* Rough Rosario outline, split into a few "barangay" cells. */}
                <path
                    className="imaps-skel-shape"
                    d="M58 22 L92 18 L100 34 L138 30 L176 38 L170 58 L150 64 L146 96 L132 104 L138 128 L150 150 L140 176 L112 184 L96 172 L98 146 L84 120 L60 118 L34 110 L28 86 L40 70 L36 44 Z"
                    fill="url(#imaps-skel-sheen)"
                    stroke="#d5dbe3"
                    strokeWidth="1.5"
                />
                <path d="M40 70 L84 72 L100 34 M84 72 L98 110 L146 96 M98 110 L84 120 M150 64 L112 70 L100 34 M98 146 L132 128" fill="none" stroke="#d5dbe3" strokeWidth="1.2" />
            </svg>
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-300 rounded-[3px] shadow-sm">
                <span className="imaps-skel-dot w-1.5 h-1.5 rounded-full bg-[#0b2a5b]" />
                <span className="text-[11.5px] text-slate-600">{label}</span>
            </div>
        </div>
    );
}

const SKELETON_CSS = `
@keyframes imaps-skel-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
@keyframes imaps-loading-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
.imaps-skel-shape, .imaps-skel-dot { animation: imaps-skel-pulse 1.4s ease-in-out infinite; }
.imaps-loading-bar { animation: imaps-loading-slide 1.1s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .imaps-skel-shape, .imaps-skel-dot, .imaps-loading-bar { animation: none; }
}
`;
