import React, { useMemo } from 'react';

export default function ForecastPanel({
    forecastData = null,
    loading = false,
    activeQuarter = null,
    selectedBgy = null,
    onClearBgy = () => {},
    onSelectBgy = () => {},
}) {
    // Empty State
    if (!forecastData && !loading) {
        return (
            <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center text-center">
                <span className="text-3xl mb-3">📈</span>
                <span className="text-xs font-bold text-slate-700">No Forecast Selected</span>
                <span className="text-[10px] text-slate-400 mt-1 max-w-[200px]">
                    Switch to a forecast quarter to view predictions
                </span>
            </div>
        );
    }

    // Loading State
    if (loading) {
        return (
            <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center text-center">
                <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin mb-3"></div>
                <span className="text-xs font-bold text-slate-600">Loading forecast data...</span>
            </div>
        );
    }

    if (!activeQuarter) return null;

    const isForecast = activeQuarter.isForecast;
    const isBgySelected = Boolean(selectedBgy && selectedBgy.name);
    const bgyName = selectedBgy?.name || '';

    // Calculate metrics
    const wmape = forecastData?.metrics?.wmape || 0;
    const mae = forecastData?.metrics?.mae || 0;
    let wmapeColor = "bg-emerald-100 text-emerald-700";
    if (wmape >= 15 && wmape <= 25) {
        wmapeColor = "bg-amber-100 text-amber-700";
    } else if (wmape > 25) {
        wmapeColor = "bg-red-100 text-red-700";
    }

    const trend = forecastData?.insights?.trend || 'Stable';
    let trendColor = "text-slate-500";
    let trendIcon = "→";
    if (trend === 'Increasing') {
        trendColor = "text-emerald-500";
        trendIcon = "↗";
    } else if (trend === 'Decreasing') {
        trendColor = "text-amber-500";
        trendIcon = "↘";
    }

    const totalVal = Math.round(activeQuarter.total || 0);

    const bgyData = activeQuarter.barangays || [];
    const maxVal = bgyData.length > 0 ? Math.max(...bgyData.map(b => b.value || 0)) : 1;
    const sortedBgys = [...bgyData].sort((a, b) => (b.value || 0) - (a.value || 0));

    const selectedBgyValue = isBgySelected ? bgyData.find(b => b.name === bgyName)?.value || 0 : 0;
    const selectedBgyShare = totalVal > 0 ? ((selectedBgyValue / activeQuarter.total) * 100).toFixed(1) : 0;

    const formatVal = (val) => isForecast ? Number(val).toFixed(1) : Math.round(val);
    const barColor = isForecast ? "bg-indigo-500" : "bg-blue-500";

    const drivers = forecastData?.insights?.drivers || [];

    return (
        <div className="flex-1 overflow-y-auto flex flex-col p-4 gap-4">
            {/* Model Confidence Header */}
            {isForecast && (
                <div className="flex flex-col items-center">
                    <div className="flex items-center gap-3 mb-1.5">
                        <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-1 rounded">
                            🎯 MAE {Number(mae).toFixed(2)}
                        </span>
                        <span className={`text-[10px] font-mono font-bold px-2 py-1 rounded ${wmapeColor}`}>
                            📊 WMAPE {Number(wmape).toFixed(1)}%
                        </span>
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        Model Confidence: SARIMAX Multivariate
                    </span>
                </div>
            )}

            {/* Quarter Summary Card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    {activeQuarter.label} · {isForecast ? 'Forecast' : 'Historical'}
                </div>
                <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-black text-slate-900">
                        <span className="font-mono text-lg mr-1">{totalVal}</span>
                        {isForecast ? 'Predicted LC Filings' : 'Historical LC Filings'}
                    </div>
                    {isForecast && (
                        <span className={`text-lg font-bold ${trendColor}`}>
                            {trendIcon}
                        </span>
                    )}
                </div>

                {isForecast && drivers.length > 0 && (
                    <div className="pt-2 border-t border-slate-100">
                        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                            Key Drivers:
                        </div>
                        <div className="space-y-1">
                            {drivers.map((drv, idx) => (
                                <div key={idx} className="text-xs text-slate-600 flex items-center gap-1.5">
                                    <span>{drv.impact === 'Positive' ? '📈' : '📉'}</span>
                                    <span>{drv.name} ({drv.impact})</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Selected Barangay Detail or Hint */}
            {isBgySelected ? (
                <div className="bg-white rounded-xl border border-blue-200 shadow-xs p-3 bg-blue-50/30">
                    <div className="flex items-start justify-between mb-2">
                        <div>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-blue-500 block">
                                Selected Barangay
                            </span>
                            <h3 className="text-sm font-black text-slate-900 mt-0.5">
                                Brgy. {bgyName}
                            </h3>
                        </div>
                        <button
                            type="button"
                            onClick={onClearBgy}
                            className="text-[10px] font-bold text-slate-500 hover:text-slate-800 bg-white border border-slate-200 hover:bg-slate-100 px-2 py-1 rounded transition-colors"
                        >
                            ✕ Clear
                        </button>
                    </div>
                    <div className="flex items-end gap-3 mt-2 pt-2 border-t border-blue-100/50">
                        <div>
                            <span className="text-lg font-mono font-black text-blue-700">
                                {formatVal(selectedBgyValue)}
                            </span>
                            <span className="text-[10px] text-slate-500 ml-1">
                                {isForecast ? 'predicted' : 'actual'}
                            </span>
                        </div>
                        <div className="mb-0.5">
                            <span className="text-[10px] font-mono font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">
                                {selectedBgyShare}%
                            </span>
                            <span className="text-[9px] text-slate-400 ml-1 uppercase tracking-wider">
                                of total
                            </span>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="text-center p-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/50">
                    <span className="text-[10px] text-slate-400">
                        Select a barangay on the map to drill down
                    </span>
                </div>
            )}

            {/* Barangay Ranking Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-3 mb-4">
                <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-3 pb-1 border-b border-slate-100">
                    Barangay Demand Ranking
                </div>
                <div className="space-y-2">
                    {sortedBgys.map((bgy, idx) => {
                        const val = bgy.value || 0;
                        const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
                        const isSel = isBgySelected && bgyName === bgy.name;
                        
                        return (
                            <div 
                                key={bgy.name}
                                onClick={() => onSelectBgy(bgy.name)}
                                className={`flex items-center gap-2 p-1.5 -mx-1.5 rounded-lg cursor-pointer transition-colors ${
                                    isSel ? 'bg-blue-50' : 'hover:bg-slate-50'
                                }`}
                            >
                                <div className="w-4 text-right shrink-0">
                                    <span className="text-[9px] font-mono font-bold text-slate-400">
                                        {idx + 1}.
                                    </span>
                                </div>
                                <div className="w-20 truncate text-[10px] font-bold text-slate-700">
                                    {bgy.name}
                                </div>
                                <div className="flex-1 flex items-center h-4 bg-slate-100 rounded overflow-hidden">
                                    <div 
                                        className={`h-full ${barColor} ${isSel ? 'opacity-100' : 'opacity-80'}`}
                                        style={{ width: `${Math.max(pct, 1)}%` }}
                                    />
                                </div>
                                <div className="w-8 text-right shrink-0">
                                    <span className="text-[10px] font-mono font-bold text-slate-600">
                                        {formatVal(val)}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
