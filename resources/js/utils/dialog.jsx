import Swal from 'sweetalert2';

// The one look for every SweetAlert in iMAPS: the sign-out card (toned icon
// badge over a centered title, full-width buttons) and a matching toast.
// Swal's own stylesheet out-ranks utility classes, so dialog content is styled
// inline and only the frame and buttons use classes. (Kept in a .jsx file so
// Tailwind scans these class names.)

// Swal renders title/html with `white-space: pre-line`, so any newline in the
// markup becomes a visible line break. Drop the line breaks (and indentation)
// between tags, but keep single spaces like "of <b>file</b>".
export const tight = (html) =>
    html.replace(/>\s*\n\s*/g, '>').replace(/\s*\n\s*</g, '<').replace(/\s*\n\s*/g, ' ').trim();

export const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const glyph = (paths, size = 24, width = 2) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" style="display:block">${paths}</svg>`;

const GLYPHS = {
    success: '<path d="M20 6 9 17l-5-5"/>',
    error: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    warning: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    info: '<path d="M12 10.5v6.5" stroke-width="2.75"/><path d="M12 6.75h.01" stroke-width="3.5"/>',
    question: '<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
};

// Badge colours per SweetAlert icon; blue is the sign-out default.
const TONES = {
    blue: { bg: '#eff6ff', ring: '#dbeafe', halo: 'rgba(239,246,255,.6)', fg: '#1d4ed8' },
    green: { bg: '#ecfdf5', ring: '#d1fae5', halo: 'rgba(236,253,245,.6)', fg: '#047857' },
    amber: { bg: '#fffbeb', ring: '#fef3c7', halo: 'rgba(255,251,235,.6)', fg: '#b45309' },
    red: { bg: '#fff1f2', ring: '#ffe4e6', halo: 'rgba(255,241,242,.6)', fg: '#be123c' },
};
const TONE_OF = { success: 'green', error: 'red', warning: 'amber', info: 'blue', question: 'blue' };

// Soft wash behind the header, in the badge's colour.
const TITLE_WASH = {
    blue: '!from-blue-50/70',
    green: '!from-emerald-50/70',
    amber: '!from-amber-50/70',
    red: '!from-rose-50/70',
};

export const badge = (iconSvg, tone = 'blue', size = 56) => {
    const t = TONES[tone] ?? TONES.blue;
    return `<span aria-hidden="true" style="position:relative;flex:none;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:9999px;background:${t.bg};box-shadow:inset 0 0 0 1px ${t.ring},0 0 0 ${size > 40 ? 6 : 4}px ${t.halo};color:${t.fg}">${iconSvg}</span>`;
};

// Icon badge + title (+ optional subtitle), the sign-out header without the avatar.
export const dialogHeader = (iconSvg, title, { tone = 'blue', subtitle } = {}) =>
    tight(`
        <div style="display:flex;flex-direction:column;align-items:center;text-align:center">
            ${badge(iconSvg, tone)}
            <span style="display:block;margin-top:16px;font-size:17px;font-weight:600;line-height:1.3;color:#0f172a">${esc(title)}</span>
            ${subtitle ? `<span style="display:block;max-width:100%;margin-top:3px;font-size:13px;font-weight:400;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(subtitle)}</span>` : ''}
        </div>`);

const BUTTON = 'w-full h-10 px-4 whitespace-nowrap rounded-xl text-[13.5px] font-semibold cursor-pointer transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

const classes = ({ tone = 'blue', danger = false, buttons = true } = {}) => ({
    container: '!z-[20000] !bg-slate-900/30 backdrop-blur-sm',
    popup: 'imaps-confirm !rounded-2xl !p-0 max-w-[calc(100vw-2rem)] overflow-hidden !shadow-2xl ring-1 ring-slate-900/5',
    closeButton: '!w-8 !h-8 !mt-4 !mr-4 !-mb-12 !rounded-lg !text-2xl !text-slate-400 hover:!text-slate-600 hover:!bg-slate-100 !shadow-none focus-visible:!outline focus-visible:!outline-2 focus-visible:!outline-blue-600',
    title: `!m-0 !px-6 !pt-8 !pb-0 !bg-gradient-to-b ${TITLE_WASH[tone] ?? TITLE_WASH.blue} !to-white`,
    htmlContainer: `!m-0 !px-7 !pt-4 ${buttons ? '!pb-0' : '!pb-7'} !text-center !text-[13.5px] !leading-relaxed !text-slate-600`,
    // One column per visible button, so a lone button spans the full width.
    actions: '!grid !grid-flow-col !auto-cols-fr !gap-2.5 !w-full !m-0 !px-6 !pt-6 !pb-6',
    cancelButton: `!m-0 ${BUTTON} bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 focus-visible:outline-blue-600`,
    denyButton: `!m-0 ${BUTTON} bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 focus-visible:outline-rose-600`,
    confirmButton: danger
        ? `!m-0 ${BUTTON} bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/25 focus-visible:outline-rose-600`
        : `!m-0 ${BUTTON} bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/25 focus-visible:outline-blue-600`,
    validationMessage: '!mx-6 !mt-4 !mb-0 !rounded-lg !bg-rose-50 !text-rose-700 !text-[12.5px]',
});

// Low-level frame: `title` is already header markup. Sign-out and the login
// help dialog build their own headers and call this directly.
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
        customClass: classes(),
        ...options,
    });

// Toast in the same card style: toned badge, title, optional line of text.
// Plain DOM rather than Swal: Swal shows one popup at a time, so a Swal toast
// (an autosave notice, say) would close whatever dialog is open.
let stack = null;
const HIDDEN = ['opacity-0', '-translate-y-2'];

export const notify = (title, icon = 'success', { text, timer = 3000 } = {}) => {
    if (typeof document === 'undefined') return () => {};
    if (!stack?.isConnected) {
        stack = document.createElement('div');
        stack.className = 'fixed top-16 right-4 z-[2000] flex flex-col items-end gap-2 pointer-events-none';
        document.body.append(stack);
    }

    const el = document.createElement('div');
    el.setAttribute('role', icon === 'error' ? 'alert' : 'status');
    el.className = `pointer-events-auto flex items-center gap-3 w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl bg-white py-3 pl-3.5 pr-2 shadow-xl ring-1 ring-slate-900/5 transition duration-200 ease-out ${HIDDEN.join(' ')}`;
    el.innerHTML = tight(`
        ${badge(glyph(GLYPHS[icon] ?? GLYPHS.info, 16, 2.5), TONE_OF[icon] ?? 'blue', 32)}
        <span style="flex:1;min-width:0">
            <span style="display:block;font-size:13.5px;font-weight:600;line-height:1.35;color:#0f172a">${esc(title)}</span>
            ${text ? `<span style="display:block;margin-top:2px;font-size:12.5px;line-height:1.4;color:#64748b">${esc(text)}</span>` : ''}
        </span>
        <button type="button" aria-label="Dismiss" class="flex-none flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">${glyph(GLYPHS.error, 14)}</button>`);
    stack.append(el);
    // Keep the newest few; older ones are already stale.
    while (stack.children.length > 3) stack.firstElementChild.remove();
    void el.offsetHeight;
    el.classList.remove(...HIDDEN);

    let timeout;
    const close = () => {
        clearTimeout(timeout);
        el.classList.add(...HIDDEN);
        setTimeout(() => el.remove(), 200);
    };
    const start = () => {
        if (timer) timeout = setTimeout(close, timer);
    };
    el.querySelector('button').addEventListener('click', close);
    // Hovering holds the toast open so it can be read.
    el.addEventListener('mouseenter', () => clearTimeout(timeout));
    el.addEventListener('mouseleave', start);
    start();
    return close;
};

// SweetAlert-compatible entry point: `dialog.fire({ icon, title, text | html, ... })`.
// The icon becomes the toned badge, `danger: true` turns the confirm button
// red for destructive actions, and `toast: true` routes to `notify`. Per-call
// styling (customClass, colours, iconHtml) is ignored so every dialog matches.
const fire = ({ icon = 'info', title = '', danger = false, toast, customClass, buttonsStyling, iconHtml, confirmButtonColor, position, ...options }) => {
    if (toast) return Promise.resolve(notify(title, icon, { text: options.text, timer: options.timer }));

    const tone = TONE_OF[icon] ?? 'blue';
    const buttons = options.showConfirmButton !== false || options.showCancelButton || options.showDenyButton;
    return confirmDialog(dialogHeader(glyph(GLYPHS[icon] ?? GLYPHS.info), title, { tone }), undefined, 'OK', {
        showCancelButton: false,
        customClass: classes({ tone, danger, buttons }),
        ...options,
    });
};

export default { fire, notify };
