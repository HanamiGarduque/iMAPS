import Swal from 'sweetalert2';
import { performLogout } from '@/utils/auth';

// Swal renders title/html with `white-space: pre-line`, so any newline in the
// markup becomes a visible line break. Collapse whitespace between tags.
const tight = (html) => html.replace(/>\s+/g, '>').replace(/\s+</g, '<').trim();

const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const initials = (name) =>
    String(name ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

const logoutIcon = (size, width = 2) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>`;

// Who is signing out: initials avatar with a sign-out badge, stacked over the
// title and email so the dialog reads as a compact, centered card.
const header = (user) => {
    const ini = initials(user?.name);
    const subtitle = user?.email || user?.name;
    return tight(`
        <div style="display:flex;flex-direction:column;align-items:center;text-align:center">
            <span aria-hidden="true" style="position:relative;display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:9999px;background:#eff6ff;box-shadow:inset 0 0 0 1px #dbeafe,0 0 0 6px rgba(239,246,255,.6);color:#1d4ed8;font-size:17px;font-weight:600;line-height:1;letter-spacing:0.02em">
                ${ini ? esc(ini) : logoutIcon(22)}
                ${ini ? `<span style="position:absolute;right:-2px;bottom:-2px;display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:9999px;background:#2563eb;color:#fff;box-shadow:0 0 0 2.5px #fff">${logoutIcon(12, 2.5)}</span>` : ''}
            </span>
            <span style="display:block;margin-top:16px;font-size:17px;font-weight:600;line-height:1.3;color:#0f172a">Sign out</span>
            ${subtitle ? `<span style="display:block;max-width:100%;margin-top:3px;font-size:13px;font-weight:400;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(subtitle)}</span>` : ''}
        </div>`);
};

// Shared look for confirmation dialogs (sign-out, form reset). Swal's own
// stylesheet out-ranks utility classes, so dialog content is styled inline and
// only the frame and buttons use classes. (Kept in a .jsx file so Tailwind
// scans these class names.)
export const confirmDialog = (title, html, confirmButtonText, options = {}) =>
    Swal.fire({
        title,
        html,
        width: 340,
        padding: 0,
        showCancelButton: true,
        showCloseButton: true,
        closeButtonAriaLabel: 'Close',
        confirmButtonText,
        cancelButtonText: 'Cancel',
        reverseButtons: true,
        buttonsStyling: false,
        customClass: {
            container: '!bg-slate-900/30 backdrop-blur-sm',
            popup: 'imaps-confirm !rounded-2xl !p-0 max-w-[calc(100vw-2rem)] overflow-hidden !shadow-2xl ring-1 ring-slate-900/5',
            closeButton: '!w-8 !h-8 !mt-4 !mr-4 !-mb-12 !rounded-lg !text-2xl !text-slate-400 hover:!text-slate-600 hover:!bg-slate-100 !shadow-none focus-visible:!outline focus-visible:!outline-2 focus-visible:!outline-blue-600',
            title: '!m-0 !px-6 !pt-8 !pb-0 !bg-gradient-to-b !from-blue-50/70 !to-white',
            htmlContainer: '!m-0 !px-7 !pt-4 !pb-0 !text-center !text-[13.5px] !leading-relaxed !text-slate-600',
            // One column per visible button, so a lone button spans the full width.
            actions: '!grid !grid-flow-col !auto-cols-fr !gap-2.5 !w-full !m-0 !px-6 !pt-6 !pb-6',
            cancelButton: '!m-0 w-full h-10 px-5 rounded-xl bg-white hover:bg-blue-50 text-blue-700 text-[13.5px] font-semibold border border-blue-200 cursor-pointer transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600',
            confirmButton: '!m-0 w-full h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13.5px] font-semibold shadow-md shadow-blue-600/25 cursor-pointer transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600',
        },
        ...options,
    });

// Icon badge + title, matching the sign-out header without the avatar.
export const dialogHeader = (iconSvg, title) =>
    tight(`
        <div style="display:flex;flex-direction:column;align-items:center;text-align:center">
            <span aria-hidden="true" style="display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:9999px;background:#eff6ff;box-shadow:inset 0 0 0 1px #dbeafe,0 0 0 6px rgba(239,246,255,.6);color:#1d4ed8">${iconSvg}</span>
            <span style="display:block;margin-top:16px;font-size:17px;font-weight:600;line-height:1.3;color:#0f172a">${esc(title)}</span>
        </div>`);

// The one sign-out confirmation used everywhere.
export const confirmSignOut = (user) =>
    confirmDialog(header(user), 'Unsaved changes on this page will be lost.', 'Sign out').then((result) => {
        if (result.isConfirmed) performLogout();
    });
