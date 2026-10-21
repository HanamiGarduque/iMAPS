/**
 * Download an inspection photo through its signed URL.
 *
 * The signed URL is cross-origin, so a plain `<a download>` would just navigate.
 * Fetch it as a blob and save that instead; if the fetch is blocked, fall back to
 * opening the signed URL in a new tab. No storage path is ever constructed here.
 */
export default async function downloadPhoto(url, { inspectionId, index = 0, capturedAt } = {}) {
    if (!url) return false;

    let ext = "jpg";
    try {
        const last = new URL(url, window.location.href).pathname.split(".").pop().toLowerCase();
        if (/^[a-z0-9]{2,4}$/.test(last)) ext = last;
    } catch {
        /* keep default extension */
    }
    const stamp = capturedAt ? new Date(capturedAt).toISOString().slice(0, 10) : null;
    const name = ["inspection", inspectionId, `photo-${index + 1}`, stamp].filter(Boolean).join("-") + `.${ext}`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("unavailable");
        const blobUrl = URL.createObjectURL(await res.blob());
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        return true;
    } catch {
        window.open(url, "_blank", "noopener,noreferrer");
        return false;
    }
}
