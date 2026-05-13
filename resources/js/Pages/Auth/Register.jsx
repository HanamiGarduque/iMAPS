import { useState } from 'react'
import { Head, useForm } from '@inertiajs/react'

export default function Register() {
    const { data, setData, post, processing, errors } = useForm({
        name: '',
        email: '',
        role: '',
        password: '',
        password_confirmation: '',
    })

    const [strength, setStrength] = useState({ width: '0%', color: '', label: '' })
    const [success, setSuccess] = useState(false)

    const checkStrength = (val) => {
        let score = 0
        if (val.length >= 8)            score++
        if (/[A-Z]/.test(val))          score++
        if (/[0-9]/.test(val))          score++
        if (/[^A-Za-z0-9]/.test(val))   score++

        const configs = [
            { width: '0%',   color: '',          label: '' },
            { width: '25%',  color: '#ef4444',   label: 'Weak' },
            { width: '50%',  color: '#f97316',   label: 'Fair' },
            { width: '75%',  color: '#eab308',   label: 'Good' },
            { width: '100%', color: '#22c55e',   label: 'Strong' },
        ]
        setStrength(configs[score] || configs[0])
    }

    const togglePassword = (id) => {
        const field = document.getElementById(id)
        field.type = field.type === 'password' ? 'text' : 'password'
    }

    const submit = (e) => {
        e.preventDefault()
        post('/register', {
            onSuccess: () => setSuccess(true),
        })
    }

    return (
        <>
            <Head title="Register | iMAPS" />

            <style>{`
                body { font-family: 'DM Sans', sans-serif; }
                .field-focus:focus {
                    outline: none;
                    box-shadow: 0 0 0 3px rgba(51,102,248,0.15);
                    border-color: #3366f8;
                }
                .card { box-shadow: 0 1px 3px 0 rgba(0,0,0,.06), 0 4px 24px 0 rgba(51,102,248,.08); }
                .bg-pattern {
                    background-color: #f8fafc;
                    background-image:
                        radial-gradient(circle at 20% 20%, rgba(51,102,248,0.06) 0%, transparent 50%),
                        radial-gradient(circle at 80% 80%, rgba(51,102,248,0.04) 0%, transparent 50%);
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
                .delay-5 { animation-delay: 0.25s; }
                #strength-bar { transition: width .3s ease, background-color .3s ease; }
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
                        <p className="text-sm text-slate-500 mt-1">Staff Registration</p>
                    </div>

                    {/* Success state */}
                    {success ? (
                        <div className="card bg-white rounded-2xl border border-slate-200 overflow-hidden animate-in delay-1">
                            <div className="px-8 py-10 text-center">
                                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <h2 className="text-lg font-semibold text-slate-900 mb-2">User registered!</h2>
                                <p className="text-sm text-slate-500 mb-6">
                                    The new account has been created and is ready to use.
                                </p>
                                <button onClick={() => setSuccess(false)}
                                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-all">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                    </svg>
                                    Register Another User
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="card bg-white rounded-2xl border border-slate-200 overflow-hidden animate-in delay-1">

                            <div className="px-8 pt-7 pb-5 border-b border-slate-100">
                                <h2 className="text-lg font-semibold text-slate-900">Register New User</h2>
                                <p className="text-sm text-slate-500 mt-0.5">Add a new staff account to the iMAPS system</p>
                            </div>

                            <div className="px-8 py-6">

                                {/* Errors */}
                                {Object.keys(errors).length > 0 && (
                                    <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm animate-in">
                                        <p className="font-semibold mb-1">Please fix the following:</p>
                                        <ul className="list-disc list-inside space-y-0.5">
                                            {Object.values(errors).map((err, i) => (
                                                <li key={i}>{err}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                <form onSubmit={submit}>

                                    {/* Full Name */}
                                    <div className="mb-4 animate-in delay-2">
                                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                                            Full Name <span className="text-red-500">*</span>
                                        </label>
                                        <input type="text" value={data.name}
                                            onChange={e => setData('name', e.target.value)}
                                            required autoFocus maxLength={255}
                                            placeholder="e.g. Juan dela Cruz"
                                            className="field-focus w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 transition-colors hover:border-slate-300"
                                        />
                                    </div>

                                    {/* Email */}
                                    <div className="mb-4 animate-in delay-2">
                                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                                            Email Address <span className="text-red-500">*</span>
                                        </label>
                                        <input type="email" value={data.email}
                                            onChange={e => setData('email', e.target.value)}
                                            required maxLength={80}
                                            placeholder="you@example.com"
                                            className="field-focus w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 transition-colors hover:border-slate-300"
                                        />
                                    </div>

                                    {/* Role */}
                                    <div className="mb-4 animate-in delay-3">
                                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                                            Role <span className="text-red-500">*</span>
                                        </label>
                                        <select value={data.role}
                                            onChange={e => setData('role', e.target.value)}
                                            required
                                            className="field-focus w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 transition-colors hover:border-slate-300">
                                            <option value="">— Select role —</option>
                                            <option value="Planning Officer">Planning Officer</option>
                                            <option value="Admin">Admin</option>
                                        </select>
                                    </div>

                                    {/* Password */}
                                    <div className="mb-1 animate-in delay-3">
                                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                                            Password <span className="text-red-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <input type="password" id="reg-password"
                                                value={data.password}
                                                onChange={e => { setData('password', e.target.value); checkStrength(e.target.value) }}
                                                required minLength={8}
                                                placeholder="Min. 8 characters"
                                                className="field-focus w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 pr-10 py-2.5 text-sm text-slate-800 transition-colors hover:border-slate-300"
                                            />
                                            <button type="button" onClick={() => togglePassword('reg-password')}
                                                className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Strength bar */}
                                    <div className="mb-4 animate-in delay-3">
                                        <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden mt-2">
                                            <div id="strength-bar" className="h-full rounded-full"
                                                style={{ width: strength.width, backgroundColor: strength.color, transition: 'width .3s ease, background-color .3s ease' }} />
                                        </div>
                                        <p className="text-xs mt-1" style={{ color: strength.color }}>{strength.label}</p>
                                    </div>

                                    {/* Confirm Password */}
                                    <div className="mb-6 animate-in delay-4">
                                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                                            Confirm Password <span className="text-red-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <input type="password" id="reg-confirm"
                                                value={data.password_confirmation}
                                                onChange={e => setData('password_confirmation', e.target.value)}
                                                required
                                                placeholder="Re-enter your password"
                                                className="field-focus w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 pr-10 py-2.5 text-sm text-slate-800 transition-colors hover:border-slate-300"
                                            />
                                            <button type="button" onClick={() => togglePassword('reg-confirm')}
                                                className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Submit */}
                                    <button type="submit" disabled={processing}
                                        className="animate-in delay-5 w-full inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold shadow-sm transition-all disabled:opacity-60">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                        {processing ? 'Registering…' : 'Register User'}
                                    </button>

                                </form>
                            </div>
                        </div>
                    )}

                    {!success && (
                        <p className="text-center text-sm text-slate-500 mt-5 animate-in delay-5">
                            <a href="/login" className="text-blue-600 hover:text-blue-700 font-semibold transition-colors">← Back to Sign In</a>
                        </p>
                    )}

                    <p className="text-center text-xs text-slate-400 mt-4">
                        iMAPS © {new Date().getFullYear()} · Municipal Planning & Development Office
                    </p>
                </div>
            </div>
        </>
    )
}