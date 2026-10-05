import { useState, useEffect } from 'react';
import { Head, useForm, Link } from '@inertiajs/react';

const Icon = ({ d, className = 'w-5 h-5', sw = 1.6 }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={sw} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
);

const ICONS = {
    eye: 'M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
    eyeOff: 'M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M3 3l18 18',
    close: 'M6 18L18 6M6 6l12 12',
    alert: 'M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
    lock: 'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
    mail: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    shield: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
};

// ───────── Faint cadastral map as page texture: parcel outlines, one highlighted per module ─────────
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

const PARCELS = Array.from({ length: ROWS * COLS }, (_, i) => {
    const r = Math.floor(i / COLS);
    const c = i % COLS;
    const q = [VERTS[r][c], VERTS[r][c + 1], VERTS[r + 1][c + 1], VERTS[r + 1][c]];
    return { points: q.map((p) => p.join(',')).join(' ') };
});
const ACTIVE_PARCEL = [10, 21, 28];

// Mirrors the modules that exist in the app today.
const MODULES = [
    { name: 'Applications', title: 'Encode to approval', text: 'Encode zoning applications, save drafts and follow every status change.' },
    { name: 'Geospatial Mapping', title: 'Land use, mapped', text: 'Check each application against zoning, parcel and barangay layers.' },
    { name: 'Demand Forecasting', title: 'Data to decisions', text: 'Turn approved clearances into trends and forecasted demand by barangay.' },
];

const PRIVACY = [
    ['Scope & Legal Basis', [
        ['COVERAGE', 'This Privacy Policy explains how the Municipal Government of Rosario, through the Municipal Planning and Development Office (MPDO), collects, uses, stores and protects personal data processed in iMAPS.'],
        ['LEGAL BASIS', 'Processing is carried out in accordance with Republic Act No. 10173 (Data Privacy Act of 2012), its Implementing Rules and Regulations, and issuances of the National Privacy Commission, in the exercise of the municipality\'s mandate over zoning and land-use regulation.'],
    ]],
    ['Personal Data We Collect', [
        ['STAFF ACCOUNT DATA', 'Name, official email address, role, office assignment and login credentials of authorized personnel.'],
        ['APPLICANT DATA', 'Names, addresses, contact details, property and parcel information, and supporting documents submitted with zoning and locational clearance applications.'],
        ['SYSTEM LOGS', 'Login times, IP addresses, device information and records of actions performed in the system, kept for security and audit purposes.'],
    ]],
    ['How We Use Personal Data', [
        ['PERMIT PROCESSING', 'To evaluate, inspect, approve and issue zoning and locational clearances, and to notify applicants of their application status.'],
        ['PLANNING & ANALYTICS', 'To produce land-use maps, statistics and demand forecasts. Data used for analytics is aggregated or anonymized wherever possible.'],
        ['SECURITY & ACCOUNTABILITY', 'To authenticate users, prevent unauthorized access, and maintain audit trails required by law.'],
    ]],
    ['Data Sharing & Disclosure', [
        ['AUTHORIZED RECIPIENTS', 'Personal data is shared only with municipal offices and national agencies that require it to perform their legal functions, or when required by law, court order or lawful request.'],
        ['NO COMMERCIAL USE', 'Personal data is never sold, rented or used for marketing purposes.'],
    ]],
    ['Retention & Protection', [
        ['RETENTION PERIOD', 'Records are retained only for as long as necessary for their purpose and as required by government records-management rules, after which they are securely disposed of.'],
        ['SAFEGUARDS', 'We apply organizational, physical and technical security measures, including role-based access, secure connections and activity logging, to protect personal data against loss, misuse and unauthorized access.'],
    ]],
    ['Your Rights as a Data Subject', [
        ['DATA SUBJECT RIGHTS', 'You have the right to be informed, to access, to object, to rectify, to erasure or blocking, to data portability, and to damages, subject to the limits set by law.'],
        ['EXERCISING YOUR RIGHTS', 'Requests and concerns may be sent to the Data Protection Officer below. You may also file a complaint with the National Privacy Commission.'],
    ]],
];

const TERMS = [
    ['Acceptance & Coverage', [
        ['AGREEMENT TO TERMS', 'By logging in to iMAPS, you confirm that you have read and understood these Terms and agree to comply with them. These Terms apply to all officials, employees and other personnel of the Municipal Government of Rosario who are granted access to the system.'],
        ['OFFICIAL USE ONLY', 'iMAPS is an internal government information system. Access is a privilege granted by reason of your official functions and does not create any personal right to the system or its data.'],
    ]],
    ['Authorized Access & Account Security', [
        ['AUTHORIZED USERS', 'Accounts are issued by the System Administrator upon authorization of the MPDO head. Each user may access only the modules and records required by their assigned role.'],
        ['CREDENTIAL CONFIDENTIALITY', 'Your account is personal and non-transferable. Do not share your password, allow others to use your session, or leave the system unattended while logged in. You are accountable for all actions performed under your account.'],
        ['INCIDENT REPORTING', 'Report any suspected unauthorized access, lost credentials or security incident to the System Administrator immediately so it can be contained and, where required, reported to the National Privacy Commission.'],
    ]],
    ['Acceptable Use', [
        ['PERMITTED USE', 'Use iMAPS only to perform official tasks such as encoding and evaluating zoning applications, conducting site inspections, reviewing geospatial layers and preparing planning reports.'],
        ['PROHIBITED ACTS', 'You must not: (a) access records unrelated to your duties; (b) alter, delete or falsify application, inspection or permit records without proper authority; (c) download, copy or disclose data for personal or unofficial purposes; (d) attempt to bypass security controls; or (e) introduce malicious software or otherwise disrupt the system.'],
    ]],
    ['Data Accuracy & Official Records', [
        ['ACCURACY OF ENTRIES', 'Information you encode, including applicant details, parcel data, inspection findings and fees, must be accurate and based on submitted documents or actual field verification.'],
        ['OFFICIAL RECORDS', 'Records created in iMAPS are official public records of the Municipal Government of Rosario and are retained and disposed of only in accordance with the National Archives of the Philippines Act (RA 9470) and its records-disposition schedules.'],
        ['DECISION SUPPORT', 'Maps, analytics and demand forecasts generated by the system are planning aids. They do not replace the professional judgment of evaluators or the provisions of the Comprehensive Land Use Plan and Zoning Ordinance.'],
    ]],
    ['Data Privacy & Confidentiality', [
        ['PERSONAL DATA', 'Applicant and staff personal data must be processed only for its declared purpose and protected in accordance with the Data Privacy Act of 2012 (RA 10173). See the Privacy Policy for details.'],
        ['CONFIDENTIALITY OBLIGATION', 'Your duty to keep system data confidential continues even after your access ends, including upon transfer, resignation or separation from service.'],
    ]],
    ['Monitoring & Accountability', [
        ['ACTIVITY LOGGING', 'All logins and transactions are recorded in audit logs. These logs may be reviewed by authorized personnel for security, audit and investigation purposes.'],
        ['SANCTIONS', 'Violations of these Terms may result in suspension of access and administrative action under Civil Service rules and the Code of Conduct and Ethical Standards for Public Officials and Employees (RA 6713), without prejudice to criminal liability under the Data Privacy Act or the Cybercrime Prevention Act of 2012 (RA 10175).'],
    ]],
    ['System Availability & Support', [
        ['AVAILABILITY', 'The MPDO aims to keep iMAPS available during office hours but does not guarantee uninterrupted service. Access may be limited during maintenance, upgrades or unforeseen technical issues.'],
        ['TECHNICAL SUPPORT', 'Support is available Monday to Friday, 8:00 AM to 5:00 PM (Philippine Time), excluding holidays, through the System Administrator.'],
    ]],
    ['Changes & Termination of Access', [
        ['AMENDMENTS', 'These Terms may be updated by the MPDO. Users will be informed of material changes, and continued use of the system after notice constitutes acceptance.'],
        ['TERMINATION OF ACCESS', 'Access is automatically revoked upon transfer, resignation, retirement or separation from service, and may be suspended at any time for security reasons or violations of these Terms.'],
    ]],
];

const DOCS = {
    terms: {
        title: 'Terms and Conditions of Use',
        summary: 'These Terms and Conditions govern your access to and use of the iMAPS (Intelligent Geospatial Analytics and Land-Use Monitoring System) operated by the Municipal Planning and Development Office of Rosario, Batangas. iMAPS is restricted to authorized government personnel, and by logging in you agree to use it only for official purposes and in accordance with these Terms and applicable laws.',
        sections: TERMS,
        contact: ['Legal Affairs Office', 'legal@imaps-rosario.gov.ph'],
    },
    privacy: {
        title: 'Privacy Policy',
        summary: 'The Municipal Government of Rosario is committed to protecting the personal data entrusted to it. This policy describes what personal data iMAPS processes, why it is processed, how it is protected, and the rights you have under the Data Privacy Act of 2012.',
        sections: PRIVACY,
        contact: ['Data Protection Officer', 'dpo@imaps-rosario.gov.ph'],
    },
};

// Small mock screens echoing the real app shell (sidebar, slate canvas, toolbar) — deliberately low on detail.
const MockFrame = ({ nav, title, children }) => (
    <span className="mt-2 block w-full max-w-[400px] rounded-xl border border-slate-200/80 bg-white p-1 shadow-[0_1px_0_rgba(255,255,255,.8)_inset,0_8px_14px_-10px_rgba(37,99,235,.45),0_4px_12px_-6px_rgba(15,23,42,.08)] ring-1 ring-blue-600/5" aria-hidden="true">
    <span className="flex items-center gap-1 px-2 pt-1 pb-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-300" /><span className="w-1.5 h-1.5 rounded-full bg-amber-300" /><span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
        <span className="mx-auto h-3 w-32 rounded-full bg-slate-100 text-[7px] leading-3 text-center font-semibold text-slate-400">imaps.rosario.gov.ph</span>
    </span>
    <span className="flex rounded-lg border border-slate-100 overflow-hidden">
        <span className="flex flex-col items-center gap-1.5 w-9 shrink-0 py-2 border-r border-slate-100 bg-white">
            <span className="w-4 h-4 rounded-full bg-blue-600 ring-2 ring-blue-100" />
            {[0, 1, 2, 3].map((n) => (
                <span key={n} className={`w-5 h-5 rounded-md ${n === nav ? 'bg-blue-50 ring-1 ring-blue-200' : 'bg-slate-100/80'}`} />
            ))}
        </span>
        <span className="flex-1 min-w-0 bg-slate-50/75 p-2">
            <span className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] font-bold text-slate-700">{title}</span>
                <span className="flex items-center gap-1">
                    <span className="w-12 h-3.5 rounded-md border border-slate-200 bg-white" />
                    <span className="w-6 h-3.5 rounded-md bg-blue-600" />
                </span>
            </span>
            <span className="block rounded-lg border border-slate-200/90 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,.04)]">{children}</span>
        </span>
    </span>
    </span>
);
const Line = ({ w, c = 'bg-slate-200' }) => <span className={`block h-1.5 rounded-full ${c}`} style={{ width: w }} />;
const STATUS = [['bg-emerald-50 text-emerald-700 border-emerald-200/80', 'Approved'], ['bg-blue-50 text-blue-600 border-blue-200/80', 'In review'], ['bg-amber-50 text-amber-700 border-amber-200/80', 'Pending']];
const MOCKS = [
    <MockFrame key="a" nav={0} title="Applications">
        {STATUS.map(([c, s], i) => (
            <span key={s} className="flex items-center justify-between gap-2 py-1 border-b border-slate-100 last:border-0">
                <span className="flex items-center gap-1.5 flex-1">
                    <span className={`w-4 h-4 rounded-full ring-2 ring-white ${['bg-blue-200', 'bg-indigo-200', 'bg-sky-200'][i]}`} />
                    <span className="flex-1 space-y-1"><Line w={`${60 - i * 10}%`} /><Line w={`${35 - i * 5}%`} c="bg-slate-100" /></span>
                </span>
                <span className={`rounded-md border px-1.5 text-[9px] font-semibold leading-4 ${c}`}>{s}</span>
            </span>
        ))}
    </MockFrame>,
    <MockFrame key="b" nav={1} title="Geospatial Mapping">
        <span className="flex gap-2">
            <span className="relative flex-1 h-[60px] rounded-md bg-slate-50 overflow-hidden">
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 120 60" preserveAspectRatio="none" fill="none">
                    <path d="M0 0H44L38 26L0 30Z" fill="rgba(37,99,235,.08)" />
                    <path d="M44 0H120V22L70 28L38 26Z" fill="rgba(37,99,235,.16)" />
                    <path d="M0 30L38 26L70 28L62 60H0Z" fill="rgba(37,99,235,.24)" />
                    <path d="M70 28L120 22V60H62Z" fill="rgba(37,99,235,.12)" />
                    <path d="M44 0L38 26L0 30M38 26L70 28L120 22M70 28L62 60" stroke="#94a3b8" strokeWidth=".8" />
                    <path d="M8 52C30 40 52 46 72 34S108 14 118 8" stroke="#2563eb" strokeWidth="1.2" strokeDasharray="3 2" />
                </svg>
            </span>
            <span className="w-[72px] shrink-0 space-y-1.5 pt-0.5">
                {[['Zoning', true], ['Parcels', true], ['Barangays', false]].map(([l, on]) => (
                    <span key={l} className="flex items-center justify-between">
                        <span className="text-[9px] font-semibold text-slate-500">{l}</span>
                        <span className={`relative w-5 h-3 rounded-full ${on ? 'bg-blue-600' : 'bg-slate-200'}`}>
                            <span className={`absolute top-0.5 w-2 h-2 rounded-full bg-white ${on ? 'right-0.5' : 'left-0.5'}`} />
                        </span>
                    </span>
                ))}
            </span>
        </span>
    </MockFrame>,
    <MockFrame key="c" nav={2} title="Demand Forecasting">
        <span className="flex items-baseline gap-1.5 mb-1.5">
            <span className="text-[11px] font-extrabold text-slate-800">+18%</span>
            <span className="text-[8px] font-semibold text-emerald-600">next quarter</span>
        </span>
        <span className="flex items-end gap-1 h-[40px]">
            {[40, 55, 45, 70, 60, 85, 95].map((h, i) => (
                <span key={i} className={`flex-1 rounded-t-sm ${i > 4 ? 'bg-blue-600/15 border border-dashed border-blue-600' : 'bg-blue-600'}`} style={{ height: `${h}%` }} />
            ))}
        </span>
        <span className="mt-1.5 flex justify-between text-[9px] font-semibold text-slate-400"><span>Actual</span><span className="text-blue-600">Forecast</span></span>
    </MockFrame>,
];

// Label above, input with a leading icon that lights up on focus. `aside` sits on the label row's right.
const Field = ({ id, label, icon, aside, children }) => (
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
const inputClass = 'block w-full h-11 rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-[15px] font-normal text-slate-900 placeholder:text-slate-400 shadow-sm transition hover:border-slate-300 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 focus:outline-none';

export default function Login() {
    const { data, setData, post, processing, errors, reset } = useForm({
        email: '',
        password: '',
        remember: false,
    });

    const [showPassword, setShowPassword] = useState(false);
    const [active, setActive] = useState(0);
    const [showTerms, setShowTerms] = useState(false);

    useEffect(() => {
        // Re-armed on every change so a manual click restarts the 6s timer (and the progress line).
        const timeout = setTimeout(() => setActive((p) => (p + 1) % MODULES.length), 6000);
        return () => clearTimeout(timeout);
    }, [active]);

    const submit = (e) => {
        e.preventDefault();
        post('/login', {
            showProgress: false, // the button's spinner is the loading indicator here
            onFinish: () => reset('password'),
        });
    };

    return (
        <>
            <Head title="Sign In | iMAPS Rosario" />

            <style dangerouslySetInnerHTML={{__html: `
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
                * { font-family: 'Plus Jakarta Sans', sans-serif !important; }
                body { background-color: #ffffff; margin: 0; overflow: ${showTerms ? 'hidden' : 'auto'}; }
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

            <div className="relative min-h-screen w-full overflow-hidden bg-white text-slate-900">

                {/* Cadastral map texture */}
                <div className="absolute inset-0" aria-hidden="true">
                    <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
                        {PARCELS.map((p, i) => {
                            const on = ACTIVE_PARCEL[active] === i;
                            return (
                                <polygon
                                    key={i}
                                    className="parcel"
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

                <div className="relative z-10 max-w-6xl mx-auto px-5 sm:px-6 min-h-screen flex flex-col">

                    {/* Floating navbar */}
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
                        <a href="mailto:admin@imaps-rosario.gov.ph" className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:text-blue-700 hover:bg-blue-50 transition-colors">
                            <Icon d={ICONS.mail} className="w-4 h-4" sw={2} />
                            <span className="hidden sm:inline">Need help?</span>
                        </a>
                    </nav>

                    <main className="flex-1 grid lg:grid-cols-[minmax(0,540px)_400px] lg:justify-center gap-12 lg:gap-24 items-center py-12">

                        {/* Left: headline + module stepper */}
                        <div className="rise rise-2 order-2 lg:order-1">
                            <h1 className="text-4xl sm:text-[44px] font-extrabold tracking-tight leading-[1.08] text-slate-900">
                                One workspace for<br />Rosario&rsquo;s <span className="text-blue-600">land use</span>
                            </h1>

                            <ol className="mt-5 max-w-md h-[400px]" aria-label="Modules">
                                {MODULES.map((m, i) => {
                                    const on = active === i;
                                    return (
                                        <li key={m.name} className="relative pl-14 pb-2 last:pb-0">
                                            {i < MODULES.length - 1 && (
                                                <span className="absolute left-[19px] top-10 bottom-0 w-0.5 bg-slate-200 overflow-hidden" aria-hidden="true">
                                                    {on && <span key={active} className="fill absolute inset-0 bg-blue-600" />}
                                                </span>
                                            )}
                                            <button onClick={() => setActive(i)} aria-current={on ? 'step' : undefined} className="text-left group w-full">
                                                <span className={`step absolute left-0 top-0 grid place-items-center w-10 h-10 rounded-full text-sm font-bold transition-all duration-500 ${on ? 'bg-white text-blue-600 ring-2 ring-blue-600 shadow-[0_0_0_6px_rgba(37,99,235,.1)]' : i < active ? 'bg-blue-600 text-white shadow-[0_4px_10px_-3px_rgba(37,99,235,.5)]' : 'bg-white text-slate-400 ring-1 ring-slate-200 group-hover:ring-slate-300 group-hover:text-slate-600'}`}>
                                                    {i + 1}
                                                </span>
                                                <span className={`block text-base font-medium leading-10 transition-colors ${on ? 'text-slate-900 font-semibold' : 'text-slate-400 group-hover:text-slate-600'}`}>{m.name}</span>
                                                <span className={`grid transition-[grid-template-rows,opacity] duration-700 ease-[cubic-bezier(.65,0,.35,1)] motion-reduce:transition-none ${on ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                                                    <span className="overflow-hidden block pb-3 text-sm leading-relaxed text-slate-500">
                                                        {m.text}
                                                        <span className={`block transition-[opacity,transform] duration-700 ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none ${on ? 'opacity-100 translate-y-0 delay-200' : 'opacity-0 translate-y-2'}`}>{MOCKS[i]}</span>
                                                    </span>
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ol>
                        </div>

                        {/* Right: sign-in card */}
                        <div className="rise rise-2 order-1 lg:order-2 w-full">
                            <div className="rounded-2xl bg-white border border-slate-200/80 p-6 sm:p-8 shadow-[0_30px_70px_-30px_rgba(37,99,235,.4)]">
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-blue-600">
                                    <Icon d={ICONS.shield} className="w-3.5 h-3.5" sw={2} />
                                    Secure Access
                                </span>
                                <h2 className="mt-3 text-2xl font-extrabold leading-tight tracking-tight text-slate-900">Welcome back</h2>
                                <p className="mt-1.5 mb-6 text-sm leading-6 text-slate-500">Enter your official staff credentials to continue.</p>

                                {errors.email && (
                                    <div role="alert" className="mb-5 flex items-start gap-2.5 px-3.5 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                                        <Icon d={ICONS.alert} className="w-5 h-5 shrink-0 text-red-400" sw={2} />
                                        {errors.email}
                                    </div>
                                )}

                                <form onSubmit={submit} aria-busy={processing} className={`space-y-4 transition-opacity ${processing ? '[&_input]:opacity-60 [&_input]:pointer-events-none' : ''}`}>
                                    <Field id="email" label="Email address" icon={ICONS.mail}>
                                        <input
                                            type="email"
                                            id="email"
                                            value={data.email}
                                            onChange={e => setData('email', e.target.value)}
                                            className={inputClass}
                                            placeholder="name@rosario.gov.ph"
                                            autoComplete="email"
                                            required
                                            autoFocus
                                        />
                                    </Field>

                                    <Field id="password" label="Password" icon={ICONS.lock} aside={<Link href="#" className="text-[13px] font-semibold text-blue-600 hover:text-blue-800 transition-colors">Forgot password?</Link>}>
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            id="password"
                                            value={data.password}
                                            onChange={e => setData('password', e.target.value)}
                                            className={`${inputClass} pr-12`}
                                            placeholder="Enter your password"
                                            autoComplete="current-password"
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                                        >
                                            <Icon className="w-[18px] h-[18px]" d={showPassword ? ICONS.eyeOff : ICONS.eye} />
                                        </button>
                                    </Field>

                                    <button
                                        type="submit"
                                        disabled={processing}
                                        className="w-full h-11 rounded-xl bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 active:scale-[.99] disabled:cursor-wait disabled:opacity-90 text-white text-[15px] font-semibold shadow-[0_10px_24px_-8px_rgba(37,99,235,.6),inset_0_1px_0_rgba(255,255,255,.25)] transition inline-flex items-center justify-center gap-2.5"
                                    >
                                        {processing && (
                                            <svg className="w-[18px] h-[18px] animate-spin motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".3" strokeWidth="3" />
                                                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                                            </svg>
                                        )}
                                        <span role="status">{processing ? 'Logging in…' : 'Log in'}</span>
                                    </button>
                                </form>

                                <div className="mt-6 pt-5 border-t border-slate-100 flex items-start gap-2.5 text-[13px] leading-relaxed text-slate-500">
                                    <Icon d={ICONS.shield} className="w-[18px] h-[18px] mt-0.5 text-blue-600 shrink-0" sw={1.8} />
                                    <p>
                                        Authorized personnel only. By signing in you agree to our{' '}
                                        <button type="button" onClick={() => setShowTerms('terms')} className="text-blue-600 font-semibold hover:underline">Terms of Service</button>{' '}and{' '}
                                        <button type="button" onClick={() => setShowTerms('privacy')} className="text-blue-600 font-semibold hover:underline">Privacy Policy</button>.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </main>

                </div>
            </div>

            {/* Legal document modal (Terms or Privacy) */}
            {showTerms && (() => { const d = DOCS[showTerms]; return (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="terms-title">
                    <div className="bg-white text-slate-900 w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl relative overflow-hidden rounded-2xl">
                        <div className="flex justify-between items-start gap-4 px-8 pt-7 pb-5 border-b border-slate-100">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">Legal</p>
                                <h2 id="terms-title" className="mt-1 text-2xl font-semibold tracking-tight text-[#0A2540]">{d.title}</h2>
                            </div>
                            <button onClick={() => setShowTerms(false)} aria-label="Close" className="shrink-0 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-colors">
                                <Icon d={ICONS.close} className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="px-8 py-7 overflow-y-auto custom-scrollbar text-sm text-slate-600 leading-7 space-y-8">
                            <section>
                                <h3 className="text-[#0A2540] font-semibold text-xs mb-3 uppercase tracking-[0.16em]">Executive Summary</h3>
                                <div className="bg-slate-50 border border-slate-200 border-l-4 border-l-blue-600 px-5 py-4 rounded-xl text-slate-600">
                                    {d.summary}
                                </div>
                            </section>

                            {d.sections.map(([heading, items], i) => (
                                <section key={heading}>
                                    <h3 className="flex items-center gap-3 text-[#0A2540] font-semibold text-xs mb-4 uppercase tracking-[0.16em]">
                                        <span className="grid place-items-center w-6 h-6 rounded-full bg-blue-50 text-blue-600 text-[11px] tracking-normal">{i + 1}</span>
                                        {heading}
                                    </h3>
                                    <div className="space-y-4 pl-9">
                                        {items.map(([title, text]) => (
                                            <div key={title}>
                                                <h4 className="font-semibold text-slate-900 mb-0.5">{title}</h4>
                                                <p>{text}</p>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            ))}

                            <section className="bg-slate-50 border border-slate-200 px-6 py-5 rounded-xl">
                                <h3 className="text-[#0A2540] font-semibold text-xs mb-4 uppercase tracking-[0.16em]">Contact Information</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="block font-semibold text-slate-900">System Administrator</span>
                                        <a href="mailto:admin@imaps-rosario.gov.ph" className="text-blue-600 hover:underline">admin@imaps-rosario.gov.ph</a>
                                    </div>
                                    <div>
                                        <span className="block font-semibold text-slate-900">{d.contact[0]}</span>
                                        <a href={`mailto:${d.contact[1]}`} className="text-blue-600 hover:underline">{d.contact[1]}</a>
                                    </div>
                                    <div className="md:col-span-2">
                                        <span className="block font-semibold text-slate-900">Mailing Address</span>
                                        <p className="text-slate-600">Municipal Planning and Development Office, Municipal Hall, Rosario, Batangas 4225</p>
                                    </div>
                                </div>
                            </section>
                        </div>

                        <div className="px-8 py-4 border-t border-slate-100 flex justify-end bg-slate-50">
                            <button onClick={() => setShowTerms(false)} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-600/25 hover:bg-blue-700 transition-colors text-sm font-semibold">
                                I Understand & Close
                            </button>
                        </div>
                    </div>
                </div>
            ); })()}
        </>
    );
}
