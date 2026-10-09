// Shared visual language for the authenticated/admin side of iMAPS (Login, Register, …):
// cadastral map texture, floating navbar, icon-field inputs. Keeps these pages visually identical.

export const Icon = ({ d, className = 'w-5 h-5', sw = 1.6 }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={sw} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
);

export const ICONS = {
    eye: 'M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
    eyeOff: 'M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M3 3l18 18',
    close: 'M6 18L18 6M6 6l12 12',
    alert: 'M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
    lock: 'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
    mail: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    shield: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    user: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
    briefcase: 'M20.25 14.15v4.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25v-4.25M20.25 14.15V9.5a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25v4.65M20.25 14.15c0 1.243-3.694 2.25-8.25 2.25s-8.25-1.007-8.25-2.25M9.75 7.25v-1.5a2.25 2.25 0 012.25-2.25h0a2.25 2.25 0 012.25 2.25v1.5',
    chevronLeft: 'M15.75 19.5L8.25 12l7.5-7.5',
    check: 'M5 13l4 4L19 7',
};

// Faint cadastral map texture: parcel outlines, one optionally highlighted.
const COLS = 8;
const ROWS = 6;
const W = 1600;
const H = 1000;
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

const VERTS = Array.from({ length: ROWS + 1 }, (_, r) =>
    Array.from({ length: COLS + 1 }, (_, c) => {
        const edge = r === 0 || c === 0 || r === ROWS || c === COLS;
        const j = edge ? 0.12 : 0.34;
        return [
            (c + (hash(r * 31 + c) - 0.5) * j * 2) * (W / COLS),
            (r + (hash(r * 17 + c * 5 + 99) - 0.5) * j * 2) * (H / ROWS),
        ];
    })
);

export const PARCELS = Array.from({ length: ROWS * COLS }, (_, i) => {
    const r = Math.floor(i / COLS);
    const c = i % COLS;
    const q = [VERTS[r][c], VERTS[r][c + 1], VERTS[r + 1][c + 1], VERTS[r + 1][c]];
    return { points: q.map((p) => p.join(',')).join(' ') };
});

export const CadastralBackground = ({ activeParcel }) => (
    <div className="absolute inset-0" aria-hidden="true">
        <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
            {PARCELS.map((p, i) => {
                const on = activeParcel === i;
                return (
                    <polygon
                        key={i}
                        points={p.points}
                        fill={on ? 'rgba(37,99,235,.07)' : 'transparent'}
                        stroke={on ? '#2563eb' : '#cbd5e1'}
                        strokeOpacity={on ? 0.8 : 0.5}
                        strokeWidth={on ? 2 : 1.2}
                        strokeLinejoin="round"
                        style={{ transition: 'all .8s ease' }}
                    />
                );
            })}
        </svg>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_85%_15%,rgba(191,219,254,.7),transparent_50%),radial-gradient(ellipse_at_10%_90%,rgba(224,231,255,.7),transparent_50%),linear-gradient(to_bottom,rgba(255,255,255,.6),rgba(255,255,255,.85))]" />
    </div>
);

// Floating navbar shared by every auth page — `right` slot carries the page-specific action.
export const Navbar = ({ right }) => (
    <nav className="rise mt-4 flex items-center justify-between rounded-2xl bg-white/85 backdrop-blur-md border border-slate-200/70 px-4 py-2.5 shadow-[0_10px_40px_-14px_rgba(37,99,235,.25)]">
        <div className="flex items-center gap-3">
            <svg className="w-11 h-11 shrink-0" viewBox="0 0 44 44" aria-hidden="true">
                <circle cx="22" cy="22" r="22" className="fill-blue-100" />
                <circle cx="22" cy="22" r="17" className="fill-blue-200" />
                <circle cx="22" cy="22" r="12" className="fill-blue-400" />
                <circle cx="22" cy="22" r="8" className="fill-blue-600" />
                <path d="M22 14.5c-3 0-5.2 2.2-5.2 5 0 3.6 5.2 9 5.2 9s5.2-5.4 5.2-9c0-2.8-2.2-5-5.2-5Z" fill="#fff" />
                <circle cx="22" cy="19.5" r="2" className="fill-blue-600" />
            </svg>
            <div className="leading-tight">
                <p className="text-xl font-extrabold tracking-tight text-slate-900">iMAPS</p>
                <p className="text-[9px] sm:text-[11px] font-semibold uppercase tracking-[0.06em] sm:tracking-[0.1em] text-blue-600">Municipal Planning and Development Office</p>
            </div>
        </div>
        {right}
    </nav>
);

// Label above, input with a leading icon that lights up on focus. `aside` sits on the label row's right.
export const Field = ({ id, label, icon, aside, children }) => (
    <div>
        <div className="mb-2 flex items-center justify-between">
            <label htmlFor={id} className="text-[13px] font-semibold text-slate-700">{label}</label>
            {aside}
        </div>
        <div className="group relative">
            <Icon d={icon} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400 transition-colors group-focus-within:text-blue-600" sw={1.8} />
            {children}
        </div>
    </div>
);

export const inputClass = 'block w-full h-11 rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-[15px] font-normal text-slate-900 placeholder:text-slate-400 shadow-sm transition hover:border-slate-300 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 focus:outline-none';

// Shared global CSS for the Plus Jakarta Sans auth look, rise-in animations and scrollbar styling.
export const AuthStyles = ({ lockScroll = false }) => (
    <style dangerouslySetInnerHTML={{__html: `
        * { font-family: 'Plus Jakarta Sans', sans-serif !important; }
        /* Browser autofill: the suggestion preview otherwise renders in the browser's default (serif) font,
           and the filled field gets a blue tint. ::first-line is the only hook that styles the preview text. */
        input:-webkit-autofill,
        input:-webkit-autofill::first-line {
            font-family: 'Plus Jakarta Sans', sans-serif !important;
            font-size: 15px !important;
        }
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus {
            -webkit-text-fill-color: #0f172a;
            -webkit-box-shadow: 0 0 0 1000px #ffffff inset;
            caret-color: #0f172a;
            transition: background-color 9999s ease-out 0s;
        }
        body { background-color: #ffffff; margin: 0; overflow: ${lockScroll ? 'hidden' : 'auto'}; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        @keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .rise { animation: rise .7s cubic-bezier(.16,1,.3,1) both; }
        .rise-2 { animation-delay: .1s; }
        @keyframes fill { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        .fill { transform-origin: top; animation: fill 6s linear forwards; }
        @media (prefers-reduced-motion: reduce) { .rise { animation: none; } .fill { animation: none; transform: scaleY(1); } .parcel, .step { transition: none !important; } }
    `}} />
);
