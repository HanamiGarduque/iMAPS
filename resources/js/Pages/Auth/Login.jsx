import { Head, useForm, Link } from '@inertiajs/react'

export default function Login() {
    const { data, setData, post, processing, errors } = useForm({
        email: '',
        password: '',
        remember: false,
    })

    const submit = (e) => {
        e.preventDefault()
        post('/login')
    }

    const togglePassword = () => {
        const field = document.getElementById('password')
        field.type = field.type === 'password' ? 'text' : 'password'
    }

    return (
        <>
            <Head title="Sign In | iMAPS" />

            <style>{`
                body { font-family: 'DM Sans', sans-serif; }
                .field-focus:focus {
                    outline: none;
                    box-shadow: 0 0 0 3px rgba(51,102,248,0.15);
                    border-color: #3366f8;
                }
                .card {
                    box-shadow: 0 1px 3px 0 rgba(0,0,0,.06), 0 4px 24px 0 rgba(51,102,248,.08);
                }
                .bg-pattern {
                    background-color: #f8fafc;
                    background-image:
                        radial-gradient(circle at 20% 20%, rgba(51,102,248,0.06) 0%, transparent 50%),
                        radial-gradient(circle at 80% 80%, rgba(51,102,248,0.04) 0%, transparent 50%),
                        radial-gradient(circle at 60% 10%, rgba(89,141,251,0.05) 0%, transparent 40%);
                }
                .dot-grid {
                    background-image: radial-gradient(circle, #cbd5e1 1px, transparent 1px);
                    background-size: 24px 24px;
                }
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(16px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                .animate-in { animation: fadeInUp 0.4s ease both; }
                .delay-1 { animation-delay: 0.05s; }
                .delay-2 { animation-delay: 0.10s; }
                .delay-3 { animation-delay: 0.15s; }
                .delay-4 { animation-delay: 0.20s; }
            `}</style>

            <div className="min-h-screen bg-pattern dot-grid flex items-center justify-center px-4 py-12">
                <div className="w-full max-w-md">

                    {/* Logo */}
                    <div className="flex flex-col items-center mb-8 animate-in">
                        <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg mb-4">
                            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                            </svg>
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">iMAPS</h1>
                        <p className="text-sm text-slate-500 mt-1">MPDO Rosario, Batangas</p>
                    </div>

                    {/* Card */}
                    <div className="card bg-white rounded-2xl border border-slate-200 overflow-hidden animate-in delay-1">

                        <div className="px-8 pt-7 pb-5 border-b border-slate-100">
                            <h2 className="text-lg font-semibold text-slate-900">Welcome back</h2>
                            <p className="text-sm text-slate-500 mt-0.5">Sign in to your iMAPS account</p>
                        </div>

                        <div className="px-8 py-6">

                            {/* Error */}
                            {errors.email && (
                                <div className="mb-5 flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm animate-in">
                                    <svg className="w-4 h-4 mt-0.5 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span>{errors.email}</span>
                                </div>
                            )}

                            <form onSubmit={submit}>

                                {/* Email */}
                                <div className="mb-4 animate-in delay-2">
                                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                                        Email Address
                                    </label>
                                    <input
                                        type="email"
                                        value={data.email}
                                        onChange={e => setData('email', e.target.value)}
                                        required
                                        autoFocus
                                        placeholder="you@example.com"
                                        className="field-focus w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 transition-colors hover:border-slate-300"
                                    />
                                </div>

                                {/* Password */}
                                <div className="mb-5 animate-in delay-3">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
                                            Password
                                        </label>
                                        <a href="#" className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors">
                                            Forgot password?
                                        </a>
                                    </div>
                                    <div className="relative">
                                        <input
                                            type="password"
                                            id="password"
                                            value={data.password}
                                            onChange={e => setData('password', e.target.value)}
                                            required
                                            placeholder="••••••••"
                                            className="field-focus w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 pr-10 py-2.5 text-sm text-slate-800 transition-colors hover:border-slate-300"
                                        />
                                        <button type="button" onClick={togglePassword}
                                            className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>

                                {/* Remember me */}
                                <div className="mb-6 flex items-center gap-2 animate-in delay-3">
                                    <input
                                        type="checkbox"
                                        id="remember"
                                        checked={data.remember}
                                        onChange={e => setData('remember', e.target.checked)}
                                        className="w-4 h-4 rounded border-slate-300 accent-blue-600"
                                    />
                                    <label htmlFor="remember" className="text-sm text-slate-600">
                                        Remember me for 30 days
                                    </label>
                                </div>

                                {/* Submit */}
                                <button type="submit" disabled={processing}
                                    className="animate-in delay-4 w-full inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold shadow-sm transition-all disabled:opacity-60">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                                    </svg>
                                    {processing ? 'Signing in…' : 'Sign In'}
                                </button>

                            </form>
                        </div>
                    </div>

                    <p className="text-center text-xs text-slate-400 mt-4">
                        iMAPS © {new Date().getFullYear()} · Municipal Planning & Development Office
                    </p>
                </div>
            </div>
        </>
    )
}