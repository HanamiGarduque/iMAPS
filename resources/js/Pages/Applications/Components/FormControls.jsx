// resources/js/Pages/Applications/Components/FormControls.jsx
import React from "react";

export function Label({ children, required, hasError, className = "" }) {
    return (
        <label className={`flex items-center gap-1.5 text-xs font-semibold mb-1.5 transition-colors ${hasError ? "text-rose-600" : "text-slate-700"} ${className}`}>
            {children}
            {required && <span className="text-rose-500 font-bold text-xs leading-none">*</span>}
        </label>
    );
}

export const inputBaseStyles = (hasError, readOnly) => `
    w-full px-3.5 py-2.5 text-xs font-medium text-slate-800 transition-all duration-150 outline-none
    placeholder:text-slate-400
    ${
        readOnly
            ? "bg-slate-100/70 text-slate-600 border border-slate-200 rounded-xl"
            : hasError
              ? "rounded-xl border border-rose-300 bg-rose-50/30 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10"
              : "rounded-xl border border-slate-200 bg-white hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 shadow-2xs"
    }
`;

export const Input = ({ className = "", hasError = false, readOnly = false, ...props }) => (
    <input className={`${inputBaseStyles(hasError, readOnly)} ${className}`} readOnly={readOnly} {...props} />
);

export const Textarea = ({ className = "", hasError = false, ...props }) => (
    <textarea className={`${inputBaseStyles(hasError, false)} resize-none ${className}`} {...props} />
);

export const Select = ({ children, className = "", hasError = false, ...props }) => (
    <div className="relative group">
        <select className={`${inputBaseStyles(hasError, false)} appearance-none pr-10 cursor-pointer ${className}`} {...props}>
            {children}
        </select>
        <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-400 group-hover:text-blue-600 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
        </div>
    </div>
);
