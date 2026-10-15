// resources/js/Pages/Applications/Components/PermitPdfPreview.jsx
// Zoomable permit preview. Renders the PDF with pdf.js onto canvases (the browser's own viewer in an
// iframe can't be zoomed or panned from here). 100% = page fits the panel width; zoom with the
// buttons, Ctrl/⌘ + scroll, a trackpad pinch, +/−/0 keys or a double-click, and pan by dragging.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
// Bundled by Vite as a .js worker, so servers that don't know the .mjs MIME type still serve it
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?worker&url";

// In dev the page is served by Laravel (:8000) but Vite serves the worker from :5173, and browsers
// refuse `new Worker(<other origin>)`. Start it from a same-origin blob that imports the Vite URL
// (Vite sends CORS headers). Production builds are same-origin, so they use the bundled worker.
const createPdfWorker = () =>
    import.meta.env.DEV
        ? new Worker(
              URL.createObjectURL(new Blob([`import ${JSON.stringify(new URL(pdfWorkerUrl, import.meta.url).href)};`], { type: "text/javascript" })),
              { type: "module" }
          )
        : new PdfWorker();

GlobalWorkerOptions.workerPort ??= createPdfWorker();

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4];
const PAD = 20; // canvas margin around the page(s), px
const MAX_PIXELS = 16_000_000; // keep each canvas under browser canvas limits

const clamp = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

function PdfPage({ page, scale, dimmed }) {
    const canvasRef = useRef(null);
    const base = page.getViewport({ scale: 1 });
    const cssWidth = base.width * scale;
    const cssHeight = base.height * scale;

    useEffect(() => {
        let task = null;
        let cancelled = false;
        // Short wait so a burst of zoom steps renders once; the old bitmap stretches meanwhile
        const timer = setTimeout(() => {
            const dpr = window.devicePixelRatio || 1;
            let renderScale = scale * dpr;
            const pixels = base.width * base.height * renderScale * renderScale;
            if (pixels > MAX_PIXELS) renderScale *= Math.sqrt(MAX_PIXELS / pixels);
            const viewport = page.getViewport({ scale: renderScale });

            // Render off-screen, then copy in one go so the page never flashes blank
            const off = document.createElement("canvas");
            off.width = Math.floor(viewport.width);
            off.height = Math.floor(viewport.height);
            task = page.render({ canvasContext: off.getContext("2d"), viewport });
            task.promise
                .then(() => {
                    const canvas = canvasRef.current;
                    if (cancelled || !canvas) return;
                    canvas.width = off.width;
                    canvas.height = off.height;
                    canvas.getContext("2d").drawImage(off, 0, 0);
                })
                .catch(() => {
                    /* cancelled or document replaced */
                });
        }, 80);
        return () => {
            cancelled = true;
            clearTimeout(timer);
            task?.cancel();
        };
    }, [page, scale]);

    return (
        <canvas
            ref={canvasRef}
            style={{ width: cssWidth, height: cssHeight }}
            className={`block shrink-0 bg-white rounded-sm shadow-[0_1px_3px_rgba(15,23,42,0.08),0_12px_32px_-8px_rgba(15,23,42,0.18)] transition-opacity ${
                dimmed ? "opacity-70" : ""
            }`}
        />
    );
}

export default function PermitPdfPreview({ url, title, dimmed = false }) {
    const scrollRef = useRef(null);
    const docRef = useRef(null);
    const [doc, setDoc] = useState(null); // { pdf, pages }
    const [loadError, setLoadError] = useState(null);
    const [fitWidth, setFitWidth] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [dragging, setDragging] = useState(false);
    const zoomRef = useRef(1); // latest requested zoom
    const shownZoom = useRef(1); // zoom currently laid out
    const anchor = useRef(null); // point to keep still across a zoom
    const drag = useRef(null);

    // Load each new PDF; keep the previous one on screen until the new one is ready
    useEffect(() => {
        if (!url) return;
        let cancelled = false;
        let loaded = false;
        const task = getDocument(url);
        task.promise
            .then(async (pdf) => {
                loaded = true;
                const pages = await Promise.all(Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1)));
                if (cancelled) return pdf.destroy();
                const prev = docRef.current;
                docRef.current = { pdf, pages };
                setDoc(docRef.current);
                setLoadError(null);
                prev?.pdf.destroy();
            })
            .catch((err) => {
                if (!cancelled) setLoadError(err?.message || "Could not display the preview.");
            });
        return () => {
            cancelled = true;
            if (!loaded) task.destroy();
        };
    }, [url]);

    useEffect(() => () => docRef.current?.pdf.destroy(), []);

    // 100% = first page as wide as the panel
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const measure = () => setFitWidth(Math.max(0, el.clientWidth - PAD * 2));
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const zoomTo = (next, clientX, clientY) => {
        const el = scrollRef.current;
        next = clamp(Math.round(next * 100) / 100);
        if (!el || Math.abs(next - zoomRef.current) < 0.001) return;
        // Remember the content point under the cursor (or the panel centre) once per layout
        if (!anchor.current) {
            const rect = el.getBoundingClientRect();
            const ox = clientX != null ? clientX - rect.left : el.clientWidth / 2;
            const oy = clientY != null ? clientY - rect.top : el.clientHeight / 2;
            anchor.current = { x: el.scrollLeft + ox, y: el.scrollTop + oy, ox, oy, from: shownZoom.current };
        }
        zoomRef.current = next;
        setZoom(next);
    };

    const stepZoom = (dir) => {
        const z = zoomRef.current;
        const next = dir > 0 ? STEPS.find((s) => s > z + 0.001) : [...STEPS].reverse().find((s) => s < z - 0.001);
        zoomTo(next ?? (dir > 0 ? MAX_ZOOM : MIN_ZOOM));
    };

    // Keep the anchored point under the cursor after the new size is laid out
    useLayoutEffect(() => {
        const el = scrollRef.current;
        const a = anchor.current;
        anchor.current = null;
        if (el && a) {
            const r = zoom / a.from;
            el.scrollLeft = (a.x - PAD) * r + PAD - a.ox;
            el.scrollTop = (a.y - PAD) * r + PAD - a.oy;
        }
        shownZoom.current = zoom;
    }, [zoom]);

    // Ctrl/⌘ + wheel (and trackpad pinch, which arrives as ctrl + wheel) zooms; needs a non-passive listener
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const onWheel = (e) => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
            zoomTo(zoomRef.current * Math.exp(-delta * 0.002), e.clientX, e.clientY);
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, []);

    const onPointerDown = (e) => {
        if (e.pointerType !== "mouse" || e.button !== 0) return; // touch/pen scroll natively
        const el = scrollRef.current;
        drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
        el.setPointerCapture(e.pointerId);
        setDragging(true);
    };
    const onPointerMove = (e) => {
        const d = drag.current;
        if (!d) return;
        const el = scrollRef.current;
        el.scrollLeft = d.left - (e.clientX - d.x);
        el.scrollTop = d.top - (e.clientY - d.y);
    };
    const endDrag = () => {
        drag.current = null;
        setDragging(false);
    };

    const onKeyDown = (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === "+" || e.key === "=") stepZoom(1);
        else if (e.key === "-" || e.key === "_") stepZoom(-1);
        else if (e.key === "0") zoomTo(1);
        else return;
        e.preventDefault();
    };

    const pages = doc?.pages || [];
    const firstWidth = pages[0]?.getViewport({ scale: 1 }).width || 1;
    const scale = (fitWidth * zoom) / firstWidth;

    const btn =
        "w-7 h-7 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

    return (
        <div className="relative flex-1 min-h-0 flex flex-col">
            <div
                ref={scrollRef}
                role="region"
                aria-label={`${title} — use + and − to zoom, drag or scroll to move around`}
                tabIndex={0}
                onKeyDown={onKeyDown}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onDoubleClick={(e) => zoomTo(zoomRef.current < 1.5 ? 2 : 1, e.clientX, e.clientY)}
                style={{ scrollbarGutter: "stable" }}
                className={`flex-1 min-h-0 overflow-auto overscroll-contain select-none focus:outline-none ${
                    dragging ? "cursor-grabbing" : "cursor-grab"
                }`}
            >
                <div className="w-max min-w-full flex flex-col items-center gap-4" style={{ padding: `${PAD / 2}px ${PAD}px ${PAD * 3}px` }}>
                    {fitWidth > 0 && pages.map((page, i) => <PdfPage key={i} page={page} scale={scale} dimmed={dimmed} />)}
                    {!doc && !loadError && (
                        <div
                            style={{ width: fitWidth || undefined }}
                            className="aspect-[1/1.414] rounded-sm bg-white shadow-sm animate-pulse"
                            aria-hidden="true"
                        />
                    )}
                    {loadError && !doc && (
                        <div role="alert" className="mt-16 max-w-sm text-center text-[12.5px] text-red-600 font-medium">
                            {loadError}
                        </div>
                    )}
                </div>
            </div>

            {/* Zoom controls float over the bottom of the canvas */}
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                <div className="pointer-events-auto flex items-center gap-0.5 rounded-lg bg-white/95 backdrop-blur px-1 py-1 shadow-md ring-1 ring-slate-200">
                    <button type="button" className={btn} onClick={() => stepZoom(-1)} disabled={zoom <= MIN_ZOOM} title="Zoom out (−)" aria-label="Zoom out">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path strokeLinecap="round" d="M5 12h14" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        onClick={() => zoomTo(1)}
                        title="Fit to width (0)"
                        aria-label={`Zoom ${Math.round(zoom * 100)}%, reset to fit width`}
                        className="min-w-[3.25rem] h-7 px-1.5 rounded-md text-[11.5px] font-medium tabular-nums text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                        {Math.round(zoom * 100)}%
                    </button>
                    <button type="button" className={btn} onClick={() => stepZoom(1)} disabled={zoom >= MAX_ZOOM} title="Zoom in (+)" aria-label="Zoom in">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
                        </svg>
                    </button>
                    <span className="w-px h-4 bg-slate-200 mx-0.5" aria-hidden="true" />
                    <button type="button" className={btn} onClick={() => zoomTo(1)} disabled={zoom === 1} title="Fit to width (0)" aria-label="Fit to width">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
}
