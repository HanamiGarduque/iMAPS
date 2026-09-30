import React, { useCallback, useEffect, useState } from "react";

/**
 * Inspection photo lightbox.
 *
 * WHY THIS RE-FETCHES INSTEAD OF REUSING THE THUMBNAIL URL
 *
 * The authorized photo URL is a short-lived signed URL, deliberately not a
 * permanent object URL and never a public bucket URL. The server signs each one
 * with a short expiry, so a URL captured when the page loaded can already be
 * dead by the time somebody opens a photo. Reusing a stale URL would show a
 * broken image and look like a delivery failure.
 *
 * So opening the viewer asks the server for FRESH signed URLs through the same
 * authorized endpoint the thumbnails came from, and only renders once they have
 * arrived. The signed-URL contract is unchanged: this component never sees a raw
 * storage path, never constructs a URL itself, and never widens who can read a
 * photo. The browser's own cache is bypassed on the refresh so a re-signed URL
 * is genuinely re-fetched.
 *
 * A photo that still fails to load is reported honestly as unavailable. A broken
 * image is never substituted, and a photo is never invented.
 */
export default function PhotoLightbox({ photos = [], index, onClose, onIndexChange }) {
    const [urls, setUrls] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [imageError, setImageError] = useState(false);

    const inspectionId = photos?.[0]?.inspectionId ?? null;
    const current = index != null && photos[index] ? photos[index] : null;

    // Ask the server for freshly signed URLs every time the viewer opens.
    useEffect(() => {
        if (index == null || !inspectionId) return;

        let cancelled = false;
        setUrls(null);
        setLoadError(null);
        setImageError(false);

        fetch(`/api/inspections/${inspectionId}/supabase-data`, { cache: "no-store" })
            .then((res) => {
                if (!res.ok) throw new Error("unavailable");
                return res.json();
            })
            .then((data) => {
                if (cancelled) return;
                const list = Array.isArray(data?.field_job_photos) ? data.field_job_photos : [];
                setUrls(list.map((p) => p.signed_url || null));
            })
            .catch(() => {
                if (!cancelled) setLoadError("This photo could not be loaded.");
            });

        return () => {
            cancelled = true;
        };
    }, [index, inspectionId]);

    const showPrev = useCallback(() => {
        if (index == null || index <= 0) return;
        onIndexChange(index - 1);
    }, [index, onIndexChange]);

    const showNext = useCallback(() => {
        if (index == null || index >= photos.length - 1) return;
        onIndexChange(index + 1);
    }, [index, photos.length, onIndexChange]);

    // Escape closes. Arrow keys move between photos when there is more than one.
    useEffect(() => {
        if (index == null) return;
        const onKey = (e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowLeft") showPrev();
            if (e.key === "ArrowRight") showNext();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [index, onClose, showPrev, showNext]);

    if (index == null || !current) return null;

    const signed = urls ? urls[index] : null;
    const hasMultiple = photos.length > 1;
    const unreadable = Boolean(loadError) || imageError || (urls !== null && !signed);

    return (
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4 sm:p-8"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Inspection photo viewer"
        >
            {/* Close */}
            <button
                type="button"
                onClick={onClose}
                aria-label="Close photo viewer"
                className="absolute top-4 right-4 sm:top-6 sm:right-6 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>

            {hasMultiple && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        showPrev();
                    }}
                    disabled={index <= 0}
                    aria-label="Previous photo"
                    className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-25 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                </button>
            )}

            {hasMultiple && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        showNext();
                    }}
                    disabled={index >= photos.length - 1}
                    aria-label="Next photo"
                    className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-25 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                </button>
            )}

            <figure
                className="relative max-w-full max-h-full flex flex-col items-center gap-3"
                onClick={(e) => e.stopPropagation()}
            >
                {unreadable ? (
                    <div className="flex flex-col items-center justify-center gap-3 px-10 py-12 rounded-2xl bg-white/5 border border-white/10 text-center max-w-sm">
                        <svg className="w-10 h-10 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                            />
                        </svg>
                        <p className="text-sm font-semibold text-white">Photo unavailable</p>
                        <p className="text-xs text-white/60 leading-relaxed">
                            This image could not be loaded from FieldSync. The inspection record is unaffected.
                        </p>
                    </div>
                ) : !signed ? (
                    <div className="flex flex-col items-center justify-center px-12 py-16">
                        <div className="w-9 h-9 rounded-full border-2 border-white/25 border-t-white animate-spin" />
                        <p className="mt-4 text-xs text-white/70 font-medium">Loading photo…</p>
                    </div>
                ) : (
                    <img
                        src={signed}
                        alt={current.alt || "Inspection photo"}
                        onError={() => setImageError(true)}
                        className="max-h-[82vh] max-w-full object-contain rounded-xl shadow-2xl bg-slate-900"
                    />
                )}

                <figcaption className="flex items-center gap-3 text-[11px] text-white/70 font-medium">
                    {hasMultiple && <span>Photo {index + 1} of {photos.length}</span>}
                    {current.captured_at && (
                        <span>
                            {new Date(current.captured_at).toLocaleString("en-PH", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                            })}
                        </span>
                    )}
                </figcaption>
            </figure>
        </div>
    );
}
