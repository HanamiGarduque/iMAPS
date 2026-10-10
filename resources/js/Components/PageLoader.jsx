import { useEffect, useRef, useState } from 'react';
import { router } from '@inertiajs/react';

// Shown only if a page change takes longer than this, so fast navigations don't flash.
const SHOW_AFTER_MS = 250;

// Full-page navigations only. Visits that keep the current page (live search, filters, partial
// reloads) or that opt out with `showProgress: false` (e.g. Login, which has its own button spinner)
// must not cover the screen.
const isPageChange = (visit) =>
    visit &&
    visit.method === 'get' &&
    !visit.preserveState &&
    visit.showProgress !== false &&
    !(visit.only && visit.only.length);

export default function PageLoader() {
    const [visible, setVisible] = useState(false);
    const timer = useRef(null);

    useEffect(() => {
        const offStart = router.on('start', (event) => {
            if (!isPageChange(event.detail.visit)) return;
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
        });
        const offFinish = router.on('finish', () => {
            clearTimeout(timer.current);
            setVisible(false);
        });
        return () => {
            clearTimeout(timer.current);
            offStart();
            offFinish();
        };
    }, []);

    if (!visible) return null;

    return (
        <div
            className="fixed inset-0 z-[10000] grid place-items-center bg-white/20 backdrop-blur-[1px] animate-in fade-in duration-150"
            role="status"
            aria-live="polite"
        >
            <span className="sr-only">Loading…</span>
            <LoadingDots />
        </div>
    );
}

/** Ring of 8 dots fading and shrinking around the circle, turning one position at a time. */
export function LoadingDots() {
    return (
        <div aria-hidden="true">
            <svg
                className="w-12 h-12 motion-reduce:!animate-none"
                viewBox="0 0 44 44"
                style={{ animation: 'spin 0.8s steps(8) infinite' }}
            >
                {Array.from({ length: 8 }).map((_, i) => {
                    // Dot 0 (largest, solid) leads at the top; the fading tail trails counter-clockwise behind it.
                    const angle = (-i * 45 - 90) * (Math.PI / 180);
                    return (
                        <circle
                            key={i}
                            cx={22 + 16 * Math.cos(angle)}
                            cy={22 + 16 * Math.sin(angle)}
                            r={3.6 - i * 0.28}
                            fill="#475569"
                            fillOpacity={1 - i * 0.115}
                        />
                    );
                })}
            </svg>
        </div>
    );
}
