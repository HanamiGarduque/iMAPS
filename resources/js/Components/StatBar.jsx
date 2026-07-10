import { useEffect, useState } from 'react'

export default function StatBar({ label, pct, color, bg, count, iconColor }) {
    const [width, setWidth] = useState(0)

    useEffect(() => {
        const t = setTimeout(() => setWidth(pct), 150)
        return () => clearTimeout(t)
    }, [pct])

    return (
        <div className={count !== undefined ? 'mb-3.5' : 'mb-0'}>
            <div className="flex justify-between items-center mb-1.5">
                <span className="text-[11px] font-semibold text-slate-600 flex items-center gap-2">
                    <span
                        className="w-2.5 h-2.5 rounded-full inline-block shadow-sm"
                        style={{ background: iconColor || color }}
                    />
                    {label}
                </span>
                {count !== undefined ? (
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-mono text-slate-400">
                            {count} records
                        </span>
                        <span
                            className="text-[11px] font-bold font-mono w-6 text-right"
                            style={{ color }}
                        >
                            {pct}%
                        </span>
                    </div>
                ) : (
                    <span className="text-[11px] font-bold font-mono text-slate-700">
                        {pct}%
                    </span>
                )}
            </div>
            <div className="stat-bar-track" style={{ background: bg || '#e8f0fe' }}>
                <div
                    className="stat-bar-fill"
                    style={{ width: width + '%', background: color }}
                />
            </div>
        </div>
    )
}
