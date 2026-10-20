import { useEffect, useRef, useState } from 'react';
import { router } from '@inertiajs/react';
import symbolSvg from '../../svg/imaps-symbol.svg?raw';

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
            className="fixed inset-0 z-[10000] grid place-items-center bg-white/65 backdrop-blur-[3px] animate-in fade-in duration-150"
            role="status"
            aria-live="polite"
        >
            <span className="sr-only">Loading…</span>
            <LoadingDots />
        </div>
    );
}

// The logo's fingerprint + parcel symbol (no lettering), inlined so its ridges can be animated.
const MARK = symbolSvg
    .replace(/<\?xml.*?\?>/s, '')
    .replace(/<title.*?<\/title>/s, '')
    .replace(/<desc.*?<\/desc>/s, '')
    .replace(/<svg [^>]*>/, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" aria-hidden="true">')
    .replace(/<path /g, '<path pathLength="1" ');

const CYCLE = '2.8s';

const LOGO_LOADER_CSS = `
@property --ll-a { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
.ll-mark svg { display: block; width: 100%; height: 100%; overflow: visible; }
/* The whole mark is revealed by a clockwise sweep around its centre, then fades and starts again. */
.ll-draw svg {
    -webkit-mask-image: conic-gradient(from 0deg at 50% 50%, #000 var(--ll-a), transparent calc(var(--ll-a) + 2deg));
    mask-image: conic-gradient(from 0deg at 50% 50%, #000 var(--ll-a), transparent calc(var(--ll-a) + 2deg));
    animation: ll-wipe ${CYCLE} cubic-bezier(.45,0,.3,1) infinite;
}
.ll-ghost { opacity: .12; }
/* Ridges trace as outlines while the sweep passes, fill in navy, hold, then fade. */
.ll-draw #fingerprint path { fill: rgba(37,99,235,.08); stroke: #2563eb; stroke-width: 5; stroke-linejoin: round; stroke-dasharray: 1; stroke-dashoffset: 1; animation: ll-ridge ${CYCLE} cubic-bezier(.45,0,.3,1) infinite; }
.ll-draw #parcel-overlays path { opacity: 0; animation: ll-parcel ${CYCLE} ease infinite; }
/* The pin dot, the same red as the launch splash's comet, pulses throughout. */
.ll-mark #pin-eye { fill: #ef4444; transform-box: fill-box; transform-origin: center; animation: ll-pin 1.1s ease-in-out infinite; }
@keyframes ll-wipe {
    0%   { --ll-a: 0deg; opacity: 1; }
    58%  { --ll-a: 360deg; opacity: 1; }
    84%  { --ll-a: 360deg; opacity: 1; }
    100% { --ll-a: 360deg; opacity: 0; }
}
@keyframes ll-ridge {
    0%   { stroke-dashoffset: 1; fill: rgba(37,99,235,.08); stroke-opacity: 1; }
    56%  { stroke-dashoffset: 0; fill: rgba(37,99,235,.08); stroke-opacity: 1; }
    70%  { stroke-dashoffset: 0; fill: #102D50; stroke-opacity: 0; }
    100% { stroke-dashoffset: 0; fill: #102D50; stroke-opacity: 0; }
}
@keyframes ll-parcel { 0%, 56% { opacity: 0; } 72%, 100% { opacity: 1; } }
@keyframes ll-pin { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.7); } }
@media (prefers-reduced-motion: reduce) {
    .ll-draw svg { animation: none; -webkit-mask-image: none; mask-image: none; }
    .ll-draw #fingerprint path { animation: none; fill: #102D50; stroke-opacity: 0; stroke-dashoffset: 0; }
    .ll-draw #parcel-overlays path { animation: none; opacity: 1; }
    .ll-mark #pin-eye { animation: none; }
}`;

/**
 * The iMAPS fingerprint on its own as the loading mark: a clockwise sweep reveals its ridges (tracing, then
 * filling), with the red pin dot pulsing at the centre. Also used by in-page loading states.
 */
export function LoadingDots({ size = 92 }) {
    return (
        <span aria-hidden="true" className="relative block" style={{ width: size, height: size }}>
            <style>{LOGO_LOADER_CSS}</style>
            <span className="ll-mark ll-ghost absolute inset-0" dangerouslySetInnerHTML={{ __html: MARK }} />
            <span className="ll-mark ll-draw absolute inset-0" dangerouslySetInnerHTML={{ __html: MARK }} />
        </span>
    );
}
