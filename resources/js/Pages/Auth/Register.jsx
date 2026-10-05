import { useState, useEffect } from 'react';
import { Head, Link, useForm, usePage } from '@inertiajs/react';
import Header from '@/Components/Header';
import Sidebar from '@/Components/Sidebar';
import { Icon, ICONS, CadastralBackground } from './AuthUI';
import { confirmSignOut } from '@/utils/signOut';

// Each role card states what the account will be able to reach, so the admin picks access, not just a label.
const ROLES = [
    { value: 'Planning Officer', desc: 'Encodes and evaluates zoning applications; uses maps and analytics.', icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z' },
    { value: 'Site Inspector', desc: 'Conducts field inspections through FieldSync only.', icon: 'M9 12.75L11.25 15 15 9.75M9 4.5h6M9 4.5a1.5 1.5 0 011.5-1.5h3A1.5 1.5 0 0115 4.5M9 4.5H7.5A2.25 2.25 0 005.25 6.75v12A2.25 2.25 0 007.5 21h9a2.25 2.25 0 002.25-2.25v-12A2.25 2.25 0 0016.5 4.5H15' },
    { value: 'Admin', desc: 'Full access, including user management, reports and audit trail.', icon: ICONS.shield },
];

const STRENGTH = [
    { width: '0%', color: '', label: '' },
    { width: '25%', color: '#ef4444', label: 'Weak' },
    { width: '50%', color: '#f97316', label: 'Fair' },
    { width: '75%', color: '#eab308', label: 'Good' },
    { width: '100%', color: '#22c55e', label: 'Strong' },
];

// Shared look: `input` is the compact 36px field, `card` is the white panel with the blue-tinted shadow.
const input = 'block w-full h-9 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[13px] text-slate-900 placeholder:text-slate-400 shadow-xs transition hover:border-slate-300 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 focus:outline-none';

const card = 'rounded-2xl bg-white border border-slate-200/80 shadow-[0_30px_70px_-30px_rgba(37,99,235,.35)]';

const Field = ({ id, label, icon, children }) => (
    <div>
        <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</label>
        <div className="group relative">
            {icon && <Icon d={icon} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 transition-colors group-focus-within:text-blue-600" sw={1.8} />}
            {children}
        </div>
    </div>
);

// Vertical tracker for the left card; each step links to its section in the form card.
// States: done = solid blue check, current = blue outline, upcoming = grey number.
const ProgressTracker = ({ steps, active }) => (
    <ol aria-label="Form progress">
        {steps.map((s, i) => {
            const last = i === steps.length - 1;
            const current = active === s.id && !s.done;
            return (
                <li key={s.id} className="relative flex gap-3 pb-7 last:pb-0" aria-current={active === s.id ? 'step' : undefined}>
                    {!last && <span className={`absolute left-3 top-7 bottom-1 w-px ${s.done ? 'bg-blue-300' : 'bg-slate-200'}`} aria-hidden="true" />}
                    <span className={`relative shrink-0 grid place-items-center w-6 h-6 rounded-full text-[11px] font-bold transition-all ${s.done ? 'bg-blue-600 text-white shadow-[0_0_0_4px_rgba(37,99,235,.12)]' : current ? 'bg-white text-blue-600 ring-2 ring-blue-600 shadow-[0_0_0_4px_rgba(37,99,235,.12)]' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}>
                        {s.done ? <Icon d={ICONS.check} className="w-3 h-3" sw={3.5} /> : i + 1}
                    </span>
                    <a href={`#${s.id}`} className="group block">
                        <span className={`block text-[13px] font-bold leading-6 transition-colors ${s.done || current ? 'text-blue-700' : 'text-slate-900 group-hover:text-blue-600'}`}>
                            {s.title}
                            <span className="sr-only">{s.done ? ' (complete)' : ' (incomplete)'}</span>
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{s.hint}</span>
                    </a>
                </li>
            );
        })}
    </ol>
);

// flex-1 + justify-center spreads the three sections over the card's full height instead of leaving a gap below.
// onFocusCapture reports which section the admin is typing in, so the left tracker can highlight the current step.
const Section = ({ id, title, onActive, children }) => (
    <section id={id} aria-label={title} onFocusCapture={() => onActive(id)} className="scroll-mt-6 flex-1 flex flex-col justify-center px-6 py-6 border-b border-slate-100">
        {children}
    </section>
);

// A real type="password" field makes the browser offer the admin's own saved logins (and offer to save this
// staff member's password to the admin's profile). A text field masked with CSS is invisible to password managers.
const maskedInput = (shown) => ({
    type: 'text',
    autoComplete: 'off',
    autoCorrect: 'off',
    autoCapitalize: 'off',
    spellCheck: false,
    'data-lpignore': 'true',
    'data-1p-ignore': 'true',
    style: { WebkitTextSecurity: shown ? 'none' : 'disc' },
});

const PasswordToggle = ({ shown, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        aria-label={shown ? 'Hide password' : 'Show password'}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
    >
        <Icon className="w-4 h-4" d={shown ? ICONS.eyeOff : ICONS.eye} />
    </button>
);

export default function Register() {
    const { auth } = usePage().props;
    const userName = auth?.user?.name || 'Administrator';
    const userRole = auth?.user?.role || 'Admin';

    const { data, setData, post, processing, errors, reset, transform } = useForm({
        first_name: '',
        middle_name: '',
        last_name: '',
        suffix: '',
        email: '',
        role: '',
        password: '',
        password_confirmation: '',
    });

    const [strength, setStrength] = useState(STRENGTH[0]);
    const [success, setSuccess] = useState(false);
    const [activeStep, setActiveStep] = useState('staff-details');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [clock, setClock] = useState('');

    useEffect(() => {
        const tick = () => {
            const now = new Date();
            setClock(
                now.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) +
                ' · ' +
                now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
            );
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

    const handleLogout = confirmSignOut;

    const checkStrength = (val) => {
        let score = 0;
        if (val.length >= 8) score++;
        if (/[A-Z]/.test(val)) score++;
        if (/[0-9]/.test(val)) score++;
        if (/[^A-Za-z0-9]/.test(val)) score++;
        setStrength(STRENGTH[score]);
    };

    // users.name is a single column, so the name parts are joined into one full name on submit.
    const fullName = [data.first_name, data.middle_name, data.last_name, data.suffix]
        .map((p) => p.trim())
        .filter(Boolean)
        .join(' ');

    const submit = (e) => {
        e.preventDefault();
        transform(({ first_name, middle_name, last_name, suffix, ...rest }) => ({ ...rest, name: fullName }));
        post('/register-new-account', {
            onSuccess: () => setSuccess(true),
            onFinish: () => reset('password', 'password_confirmation'),
        });
    };

    const resetForm = () => {
        reset();
        setStrength(STRENGTH[0]);
        setSuccess(false);
    };

    const errorList = Object.values(errors);

    const detailsDone = data.first_name.trim() !== '' && data.last_name.trim() !== '' && /^\S+@\S+\.\S+$/.test(data.email);
    const roleDone = data.role !== '';
    const credentialsDone = data.password.length >= 8 && data.password === data.password_confirmation;
    const steps = [
        { id: 'staff-details', title: 'Staff details', hint: "Use the person's official name and government email address.", done: detailsDone },
        { id: 'access-role', title: 'Access role', hint: 'Determines which modules and records this account can reach.', done: roleDone },
        { id: 'credentials', title: 'Credentials', hint: 'Set a temporary password and share it with the staff member securely.', done: credentialsDone },
    ];
    const doneCount = steps.filter((s) => s.done).length;
    const initials = [data.first_name, data.last_name].map((p) => p.trim()[0] || '').join('').toUpperCase();
    const passwordMismatch = data.password_confirmation !== '' && data.password !== data.password_confirmation;

    return (
        <>
            <Head title="Register New Account | iMAPS" />

            <style dangerouslySetInnerHTML={{__html: `
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
                #register-page {
                    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }
                #register-page .font-mono {
                    font-family: 'JetBrains Mono', monospace !important;
                }
                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 6px; }
                ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            `}} />

            <div id="register-page" className="bg-slate-50/75 text-slate-800 h-screen flex flex-col overflow-hidden antialiased">
                {/* Shared app shell (navbar + sidebar), identical to User Management. Fonts come from #register-page. */}
                <Header
                    userName={userName}
                    userRole={userRole}
                    clock={clock}
                    onLogout={handleLogout}
                    sidebarOpen={sidebarOpen}
                    setSidebarOpen={setSidebarOpen}
                    activePage="users"
                />

                <div className="flex-1 overflow-hidden relative flex flex-col min-w-0">
                    <Sidebar
                        userName={userName}
                        userRole={userRole}
                        sidebarOpen={sidebarOpen}
                        setSidebarOpen={setSidebarOpen}
                        onLogout={handleLogout}
                        activePage="users"
                    />

                    {sidebarOpen && (
                        <div
                            onClick={() => setSidebarOpen(false)}
                            className="absolute inset-0 bg-slate-900/20 backdrop-blur-xs z-[750] transition-opacity duration-200"
                        />
                    )}

                    {/* Page body: same map-pattern background as Login, behind two cards (progress on the left, form on the right). */}
                    <main className="relative flex-1 w-full h-full flex flex-col overflow-hidden bg-white">
                        <CadastralBackground />

                        {/* Scrolls only if the viewport is too short to fit the form; never clips the submit button. */}
                        <div className="relative z-10 p-5 sm:p-6 flex-1 h-full flex flex-col overflow-y-auto max-w-6xl mx-auto w-full">
                            {/* Two cards side by side (stacked on small screens). my-auto centres them vertically instead of stretching them. */}
                            <div className="grid lg:grid-cols-[300px_1fr] gap-5 lg:my-auto">

                                {/* ── LEFT CARD: title + progress + live preview ── */}
                                <aside className={`${card} p-5 flex flex-col`}>
                                    <div className="flex items-center gap-3 pb-5 mb-5 border-b border-slate-100">
                                        <Link
                                            href="/users"
                                            aria-label="Back to User Management"
                                            title="Back to User Management"
                                            className="w-9 h-9 shrink-0 grid place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-blue-600 hover:border-blue-200 transition-colors"
                                        >
                                            <Icon d={ICONS.chevronLeft} className="w-4 h-4" sw={2.4} />
                                        </Link>
                                        <div className="min-w-0">
                                            <nav aria-label="Breadcrumb" className="text-[11px] font-medium text-slate-400">
                                                <Link href="/users" className="hover:text-blue-600 transition-colors">User Management</Link>
                                                <span className="mx-1.5">/</span>
                                                <span aria-current="page" className="text-slate-500">New account</span>
                                            </nav>
                                            <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-tight">
                                                Register New Account
                                            </h1>
                                        </div>
                                    </div>

                                    {success ? (
                                        <p className="text-xs leading-relaxed text-slate-500">All steps complete. The account has been created.</p>
                                    ) : (
                                        <>
                                            <ProgressTracker steps={steps} active={activeStep} />

                                            {/* Live preview of the account being created */}
                                            <div className="mt-auto pt-6">
                                                <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-400">Account preview</p>
                                                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                                                    <div className={`w-10 h-10 shrink-0 rounded-full grid place-items-center text-sm font-bold transition-colors ${fullName ? 'bg-gradient-to-tr from-blue-700 to-indigo-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                                                        {initials || <Icon d={ICONS.user} className="w-4 h-4" sw={2} />}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className={`truncate text-[13px] font-semibold ${fullName ? 'text-slate-900' : 'text-slate-400'}`}>{fullName || 'Full name'}</p>
                                                        <p className={`truncate text-[11.5px] font-mono ${data.email ? 'text-slate-500' : 'text-slate-400'}`}>{data.email || 'email@rosario.gov.ph'}</p>
                                                    </div>
                                                    <span className={`shrink-0 px-2 py-0.5 rounded-md border text-[10.5px] font-semibold ${data.role ? 'bg-white border-slate-200 text-slate-700' : 'border-dashed border-slate-300 text-slate-400'}`}>
                                                        {data.role || 'No role'}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="mt-4 pt-4 border-t border-slate-100">
                                                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                                                    <span>Progress</span>
                                                    <span>{doneCount} of {steps.length}</span>
                                                </div>
                                                <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                                    <div className="h-full rounded-full bg-blue-600 transition-all duration-500" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </aside>

                                {/* ── RIGHT CARD: inputs only. Titles and hints live in the left card so they aren't repeated here. ── */}
                                <div className={`${card} flex flex-col overflow-hidden`}>
                                    {success ? (
                                        <div className="px-6 py-14 text-center">
                                            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-emerald-50 ring-1 ring-emerald-200 grid place-items-center">
                                                <Icon d={ICONS.check} className="w-6 h-6 text-emerald-600" sw={2.5} />
                                            </div>
                                            <h2 className="text-lg font-bold text-slate-900">Account created</h2>
                                            <p className="mt-1 mb-6 text-[13px] text-slate-500">
                                                The staff account is active and can sign in now. This action was recorded in the audit trail.
                                            </p>
                                            <div className="flex items-center justify-center gap-2.5">
                                                <Link href="/users" className="inline-flex items-center h-9 px-4 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[13px] font-semibold transition-colors">
                                                    Back to User Management
                                                </Link>
                                                <button onClick={resetForm} className="inline-flex items-center h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold shadow-xs transition-colors">
                                                    Register another
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <form onSubmit={submit} aria-busy={processing} className="flex-1 flex flex-col">
                                            {errorList.length > 0 && (
                                                <div role="alert" className="flex items-start gap-2 px-6 py-3 bg-red-50 border-b border-red-200 text-red-700 text-xs">
                                                    <Icon d={ICONS.alert} className="w-4 h-4 shrink-0 text-red-500" sw={2} />
                                                    <ul className="space-y-0.5">
                                                        {errorList.map((err, i) => <li key={i}>{err}</li>)}
                                                    </ul>
                                                </div>
                                            )}

                                            {/* Step 1: name parts on one row (First / Middle / Last / Ext.), email below. Joined into one `name` on submit. */}
                                            <Section id="staff-details" title="Staff details" onActive={setActiveStep}>
                                                <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_110px] gap-3">
                                                    <Field id="first_name" label="First name" icon={ICONS.user}>
                                                        <input
                                                            type="text" id="first_name" required autoFocus maxLength={80}
                                                            value={data.first_name} onChange={e => setData('first_name', e.target.value)}
                                                            className={input}
                                                            placeholder="Juan"
                                                            autoComplete="off"
                                                        />
                                                    </Field>
                                                    <Field id="middle_name" label="Middle name">
                                                        <input
                                                            type="text" id="middle_name" maxLength={80}
                                                            value={data.middle_name} onChange={e => setData('middle_name', e.target.value)}
                                                            className={`${input} pl-3`}
                                                            placeholder="Optional"
                                                            autoComplete="off"
                                                        />
                                                    </Field>
                                                    <Field id="last_name" label="Last name">
                                                        <input
                                                            type="text" id="last_name" required maxLength={80}
                                                            value={data.last_name} onChange={e => setData('last_name', e.target.value)}
                                                            className={`${input} pl-3`}
                                                            placeholder="Dela Cruz"
                                                            autoComplete="off"
                                                        />
                                                    </Field>
                                                    <Field id="suffix" label="Ext.">
                                                        <select
                                                            id="suffix"
                                                            value={data.suffix} onChange={e => setData('suffix', e.target.value)}
                                                            className={`${input} pl-3`}
                                                        >
                                                            <option value="">None</option>
                                                            {['Jr.', 'Sr.', 'II', 'III', 'IV', 'V'].map((s) => <option key={s} value={s}>{s}</option>)}
                                                        </select>
                                                    </Field>
                                                </div>
                                                <div className="mt-3">
                                                    <Field id="email" label="Email address" icon={ICONS.mail}>
                                                        <input
                                                            type="email" id="email" required maxLength={80}
                                                            value={data.email} onChange={e => setData('email', e.target.value)}
                                                            className={input}
                                                            placeholder="name@rosario.gov.ph"
                                                            autoComplete="off"
                                                        />
                                                    </Field>
                                                </div>
                                            </Section>

                                            {/* Step 2: role picker as radio cards (hidden native radios keep keyboard and screen-reader support). */}
                                            <Section id="access-role" title="Access role" onActive={setActiveStep}>
                                                <fieldset>
                                                    <legend className="mb-1.5 block text-xs font-semibold text-slate-700">Access role</legend>
                                                    <div className="grid sm:grid-cols-3 gap-3">
                                                        {ROLES.map((r) => {
                                                            const on = data.role === r.value;
                                                            return (
                                                                <label
                                                                    key={r.value}
                                                                    className={`relative block cursor-pointer rounded-xl border p-3 transition focus-within:ring-4 focus-within:ring-blue-600/10 ${on ? 'border-blue-600 bg-blue-50/60' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
                                                                >
                                                                    <input
                                                                        type="radio" name="role" value={r.value} required
                                                                        checked={on} onChange={e => setData('role', e.target.value)}
                                                                        className="sr-only"
                                                                    />
                                                                    <span className="flex items-center justify-between gap-2">
                                                                        <span className="flex items-center gap-2">
                                                                            <span className={`grid place-items-center w-7 h-7 rounded-lg transition-colors ${on ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                                                                <Icon d={r.icon} className="w-4 h-4" sw={1.8} />
                                                                            </span>
                                                                            <span className={`text-[13px] font-semibold ${on ? 'text-blue-700' : 'text-slate-900'}`}>{r.value}</span>
                                                                        </span>
                                                                        <span className={`grid place-items-center w-4 h-4 rounded-full border ${on ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`} aria-hidden="true">
                                                                            {on && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                                                                        </span>
                                                                    </span>
                                                                    <span className="mt-2 block text-[11.5px] leading-snug text-slate-500">{r.desc}</span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </fieldset>
                                            </Section>

                                            {/* Step 3: two-column passwords. The strength meter sits under the first, the match message under the second. */}
                                            <Section id="credentials" title="Credentials" onActive={setActiveStep}>
                                                <div className="grid sm:grid-cols-2 gap-3">
                                                    <div>
                                                        <Field id="password" label="Temporary password" icon={ICONS.lock}>
                                                            <input
                                                                {...maskedInput(showPassword)} id="password" required minLength={8}
                                                                value={data.password}
                                                                onChange={e => { setData('password', e.target.value); checkStrength(e.target.value); }}
                                                                className={`${input} pr-9`}
                                                                placeholder="At least 8 characters"
                                                            />
                                                            <PasswordToggle shown={showPassword} onClick={() => setShowPassword(!showPassword)} />
                                                        </Field>
                                                        <div className="mt-2 flex items-center gap-2" aria-live="polite">
                                                            <div className="h-1 flex-1 bg-slate-100 rounded-full overflow-hidden">
                                                                <div className="h-full rounded-full transition-all duration-300" style={{ width: strength.width, backgroundColor: strength.color }} />
                                                            </div>
                                                            <span className="w-10 text-right text-[10.5px] font-semibold" style={{ color: strength.color }}>{strength.label}</span>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <Field id="password_confirmation" label="Confirm password" icon={ICONS.lock}>
                                                            <input
                                                                {...maskedInput(showConfirmPassword)} id="password_confirmation" required
                                                                value={data.password_confirmation} onChange={e => setData('password_confirmation', e.target.value)}
                                                                className={`${input} pr-9 ${passwordMismatch ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10' : ''}`}
                                                                placeholder="Re-enter password"
                                                                aria-invalid={passwordMismatch}
                                                                aria-describedby="confirm-hint"
                                                            />
                                                            <PasswordToggle shown={showConfirmPassword} onClick={() => setShowConfirmPassword(!showConfirmPassword)} />
                                                        </Field>
                                                        <p id="confirm-hint" aria-live="polite" className={`mt-2 min-h-4 text-[10.5px] font-semibold ${passwordMismatch ? 'text-red-600' : 'text-emerald-600'}`}>
                                                            {passwordMismatch ? 'Passwords don’t match' : credentialsDone ? 'Passwords match' : ''}
                                                        </p>
                                                    </div>
                                                </div>
                                            </Section>

                                            {/* ── ACTION BAR ── */}
                                            <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 bg-slate-50/70">
                                                <p className="text-[11.5px] text-slate-500">All fields are required.</p>
                                                <div className="flex items-center gap-2.5">
                                                    <Link href="/users" className="inline-flex items-center h-9 px-4 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[13px] font-semibold transition-colors">
                                                        Cancel
                                                    </Link>
                                                    <button
                                                        type="submit"
                                                        disabled={processing}
                                                        className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70 text-white text-[13px] font-semibold shadow-xs transition-colors"
                                                    >
                                                        {processing && (
                                                            <svg className="w-4 h-4 animate-spin motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                                                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".3" strokeWidth="3" />
                                                                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                                                            </svg>
                                                        )}
                                                        <span role="status">{processing ? 'Creating account…' : 'Create account'}</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </form>
                                    )}
                                </div>
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        </>
    );
}
