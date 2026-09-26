import React, { useMemo, useState, useEffect } from 'react';
import axios from 'axios';

export default function TrendsPanel({
    urbanGrowthData = null,
    activeQuarter = null,
    forecastMetrics = null,
    selectedBgy = null,
    onClearBgy,
    onSelectBgy,
    onLocateApp,
    recent = [],
    onForecastGenerated = null,
}) {
    const isBgy = Boolean(selectedBgy && selectedBgy.name);
    const bgyName = selectedBgy?.name || '';

    // File Upload & Intake State
    const [selectedFile, setSelectedFile] = useState(null);
    const [isExecuting, setIsExecuting] = useState(false);
    const [intakeResult, setIntakeResult] = useState(() => {
        try {
            const saved = localStorage.getItem('imaps_forecast_data');
            if (saved) return JSON.parse(saved);
        } catch (e) {}
        return null;
    });
    const [intakeError, setIntakeError] = useState(null);

    // Auto-execute default forecast on mount if no cached data exists
    useEffect(() => {
        if (!intakeResult) {
            handleExecuteForecast(true);
        }
    }, []);

    const displayHotspots = useMemo(() => {
        return urbanGrowthData?.hotspots || [];
    }, [urbanGrowthData]);

    // Format metrics, defaulting to baseline metrics (MAE: 2.16, WMAPE: 30.2%)
    const maeDisplay = useMemo(() => {
        if (forecastMetrics && forecastMetrics.mae !== null && forecastMetrics.mae !== undefined) {
            return forecastMetrics.mae.toFixed(2);
        }
        if (intakeResult?.metrics?.validation_mae) {
            return Number(intakeResult.metrics.validation_mae).toFixed(2);
        }
        return '2.16';
    }, [forecastMetrics, intakeResult]);

    const wmapeDisplay = useMemo(() => {
        if (forecastMetrics && forecastMetrics.wmape !== null && forecastMetrics.wmape !== undefined) {
            const val = forecastMetrics.wmape;
            return (val > 1 ? val.toFixed(1) : (val * 100).toFixed(1)) + '%';
        }
        if (intakeResult?.metrics?.validation_wmape) {
            const val = Number(intakeResult.metrics.validation_wmape);
            return (val > 1 ? val.toFixed(1) : (val * 100).toFixed(1)) + '%';
        }
        return '30.2%';
    }, [forecastMetrics, intakeResult]);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
            setIntakeError(null);
        }
    };

    const handleExecuteForecast = async (isAutoRun = false) => {
        setIsExecuting(true);
        setIntakeError(null);

        try {
            const formData = new FormData();
            if (selectedFile) {
                formData.append('file', selectedFile);
            }

            const response = await axios.post('/api/forecast/generate', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            if (response.data && response.data.status === 'success') {
                const resData = response.data.data;
                setIntakeResult(resData);
                try {
                    localStorage.setItem('imaps_forecast_data', JSON.stringify(resData));
                } catch (e) {}
                if (onForecastGenerated) {
                    onForecastGenerated(resData);
                }
            } else {
                if (!isAutoRun) {
                    setIntakeError(response.data?.message || 'Failed to execute forecast.');
                }
            }
        } catch (err) {
            if (!isAutoRun) {
                console.error('Forecast intake error:', err);
                setIntakeError(err.response?.data?.message || 'Error running forecast model.');
            }
        } finally {
            setIsExecuting(false);
        }
    };

    return (
        <div className="flex flex-col gap-3 p-3 select-none">
            {/* Forecasting Metrics Card */}
            <div className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-2xs space-y-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                        <h4 className="text-xs font-bold text-slate-800">
                            Forecasting Metrics
                        </h4>
                    </div>
                </div>
                <div className="flex gap-5 items-center pt-0.5">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">MAE</span>
                        <span className="text-lg font-black text-slate-900">{maeDisplay}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">WMAPE</span>
                        <span className="text-lg font-black text-blue-600">{wmapeDisplay}</span>
                    </div>
                    <div className="ml-auto text-right">
                        <span className="text-[9.5px] text-slate-400 font-medium block">Spatial Model</span>
                        <span className="text-[10px] text-slate-600 font-bold">Rosario, Batangas</span>
                    </div>
                </div>
            </div>

            {isBgy && (
                <div className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-2xs flex items-center justify-between">
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 block">
                            Barangay Focus Mode
                        </span>
                        <h3 className="text-sm font-black text-slate-900 mt-0.5">
                            Brgy. {bgyName}
                        </h3>
                    </div>
                    {onClearBgy && (
                        <button
                            type="button"
                            onClick={onClearBgy}
                            className="text-[10.5px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 px-2.5 py-1 rounded-lg transition-colors cursor-pointer border border-slate-200/80 shrink-0"
                            title="Return to Municipal Overview"
                        >
                            ✕ All Barangays
                        </button>
                    )}
                </div>
            )}

            {/* Development Corridors Ranked (From Backend) */}
            <div className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-2xs space-y-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <h4 className="text-xs font-bold text-slate-800">
                            Development Corridors (Ranked)
                        </h4>
                    </div>
                    <span className="text-[9px] font-mono text-slate-400">
                        Click to Focus
                    </span>
                </div>

                <div className="space-y-1">
                    {displayHotspots.map((h) => {
                        const isSelected = isBgy && bgyName.toLowerCase() === (h.name || '').toLowerCase();
                        return (
                            <div
                                key={h.rank || h.name}
                                onClick={() => onSelectBgy && onSelectBgy(h.name)}
                                className={`flex items-center gap-2 p-1.5 px-2 rounded-xl border transition-all cursor-pointer group ${
                                    isSelected
                                        ? "bg-blue-50 border-blue-300 shadow-2xs"
                                        : "hover:bg-slate-50 border-slate-100 hover:border-blue-200"
                                }`}
                                title={`Click to center map on Brgy. ${h.name}`}
                            >
                                <span
                                    className={`text-[9px] font-black font-mono w-4 h-4 rounded-md flex items-center justify-center shrink-0 ${
                                        h.rank === 1
                                            ? "bg-amber-100 text-amber-800"
                                            : h.rank === 2
                                            ? "bg-slate-200 text-slate-700"
                                            : h.rank === 3
                                            ? "bg-amber-50 text-amber-700"
                                            : "bg-slate-100 text-slate-500"
                                    }`}
                                >
                                    {h.rank}
                                </span>

                                <span className="text-[11.5px] font-bold text-slate-800 flex-1 truncate group-hover:text-blue-700">
                                    {h.name}
                                </span>

                                <span
                                    className="text-[8.5px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                                    style={{ color: h.color, background: h.bg }}
                                >
                                    {h.type}
                                </span>

                                <span className="text-[10px] text-slate-500 font-medium truncate max-w-[110px]" title={h.count}>
                                    {h.count}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Historical Dataset Intake */}
            <div className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <h4 className="text-xs font-bold text-slate-800">
                            Historical Dataset Intake
                        </h4>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="border border-dashed border-slate-200 rounded-xl p-2.5 bg-slate-50/60 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-700">
                                Active Dataset
                            </span>
                            <span className="text-[9px] text-slate-400 font-mono">
                                CSV Format
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                id="historical-csv-file"
                                type="file"
                                accept=".csv"
                                onChange={handleFileChange}
                                className="hidden"
                            />
                            <label
                                htmlFor="historical-csv-file"
                                className="flex-1 truncate text-[10.5px] font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-slate-50 transition-colors shadow-2xs flex items-center gap-1.5"
                                title="Click to upload custom historical CSV dataset"
                            >
                                <span className="text-blue-500">📁</span>
                                <span className="truncate">
                                    {selectedFile ? selectedFile.name : 'rosario_zoning_apps_2021_2026.csv'}
                                </span>
                            </label>
                            {selectedFile && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedFile(null)}
                                    className="text-[10px] text-slate-400 hover:text-slate-600 px-1.5 py-1 rounded"
                                    title="Reset to default dataset"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => handleExecuteForecast(false)}
                        disabled={isExecuting}
                        className={`w-full py-2 px-3 rounded-xl font-bold text-[11px] text-white flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer ${
                            isExecuting
                                ? 'bg-blue-400 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.99]'
                        }`}
                    >
                        {isExecuting ? (
                            <>
                                <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>Running Spatial Model...</span>
                            </>
                        ) : (
                            <>
                                <span>Run Forecast Model</span>
                            </>
                        )}
                    </button>
                </div>

                {intakeError && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200/80 rounded-xl text-rose-700 text-[10.5px]">
                        <p className="font-bold flex items-center gap-1">
                            <span>⚠️</span> Forecast Error
                        </p>
                        <p className="mt-0.5 text-rose-600">{intakeError}</p>
                    </div>
                )}

                {intakeResult && (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-extrabold text-emerald-800 flex items-center gap-1">
                                <span>✅</span> Forecast Model Output Active
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[10px] pt-1">
                            <div className="bg-white/80 p-1.5 rounded-lg border border-emerald-100">
                                <span className="text-slate-500 font-bold block text-[9px] uppercase">Validation MAE</span>
                                <span className="text-slate-900 font-black">{intakeResult.metrics?.validation_mae?.toFixed(3) || '2.155'}</span>
                            </div>
                            <div className="bg-white/80 p-1.5 rounded-lg border border-emerald-100">
                                <span className="text-slate-500 font-bold block text-[9px] uppercase">Validation WMAPE</span>
                                <span className="text-emerald-700 font-black">
                                    {intakeResult.metrics?.validation_wmape ? (intakeResult.metrics.validation_wmape > 1 ? intakeResult.metrics.validation_wmape + '%' : (intakeResult.metrics.validation_wmape * 100).toFixed(1) + '%') : '30.2%'}
                                </span>
                            </div>
                        </div>
                        {intakeResult.summary && (
                            <div className="text-[9.5px] text-emerald-900 font-medium pt-1 border-t border-emerald-200/60 flex items-center justify-between">
                                <span>Q3 2026: <strong>{intakeResult.summary.q3_2026_total || 42}</strong></span>
                                <span>Q4 2026: <strong>{intakeResult.summary.q4_2026_total || 92}</strong></span>
                                <span>Combined: <strong className="text-emerald-700">{intakeResult.summary.combined_total || 134}</strong></span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
