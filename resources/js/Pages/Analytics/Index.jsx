import React from 'react';
import { router, usePage } from '@inertiajs/react';
import { ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';

export default function AnalyticsIndex({ actuals, forecasts, latestRun }) {
    const { processing } = usePage();

    // Merge historical actuals and forecast projections into a single timeline
    const chartData = [
        ...actuals.map(item => ({
            date: item.metric_date.substring(0, 7),
            Actual: Number(item.target_value),
        })),
        ...forecasts.map(item => ({
            date: item.forecast_date.substring(0, 7),
            Forecast: Number(item.mean_value),
            ConfidenceInterval: [Number(item.lower_ci), Number(item.upper_ci)],
        }))
    ];

    const handleRerun = () => {
        router.post(route('analytics.rerun'));
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6 bg-gray-50 min-h-screen">
            {/* Header Section */}
            <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">System Analytics & SARIMAX Forecast</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Exogenous Variables: Monthly Rainfall (Batangas) & Inflation Rate
                    </p>
                </div>
                <button
                    onClick={handleRerun}
                    disabled={processing}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow transition-all disabled:opacity-50"
                >
                    {processing ? 'Running SARIMAX...' : 'Re-run Model'}
                </button>
            </div>

            {/* Status Bar */}
            {latestRun && (
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg text-sm text-blue-800">
                    Last forecast generated on <span className="font-semibold">{latestRun.executed_at}</span> via {latestRun.triggered_by}.
                </div>
            )}

            {/* Main Forecast Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">6-Month Target Outlook</h2>
                <div className="h-96 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Area type="monotone" dataKey="ConfidenceInterval" fill="#bfdbfe" stroke="none" opacity={0.4} name="95% Confidence Interval" />
                            <Line type="monotone" dataKey="Actual" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} name="Historical Actuals" />
                            <Line type="monotone" dataKey="Forecast" stroke="#16a34a" strokeWidth={3} strokeDasharray="5 5" dot={{ r: 5 }} name="SARIMAX Forecast" />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}