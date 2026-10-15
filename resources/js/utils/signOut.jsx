import { performLogout } from '@/utils/auth';
import { confirmDialog, dialogHeader, esc, tight } from '@/utils/dialog';

// Kept for existing importers; the shared dialog look lives in utils/dialog.
export { confirmDialog, dialogHeader };

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

// The one sign-out confirmation used everywhere.
export const confirmSignOut = (user) =>
    confirmDialog(header(user), 'Unsaved changes on this page will be lost.', 'Sign out').then((result) => {
        if (result.isConfirmed) performLogout();
    });
