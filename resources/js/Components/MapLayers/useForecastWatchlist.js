import { useMemo } from "react";

// Share of a barangay's CLUP 2030 area zoned agricultural or protected at
// which rising demand there is worth a zoning check. Most of Rosario is
// agricultural (35 of 48 barangays are 60%+), so only near-total shares
// single a barangay out.
const AGRI_FLAG_PCT = 90;

// What a forecast quarter means for the office: the town-wide total against
// the recent norm, how concentrated it is, which barangays are rising, and
// which of those sit on land CLUP 2030 keeps agricultural. Null on a
// recorded quarter or when there is no forecast for it.
export default function useForecastWatchlist({ forecastData, activeQuarter, series = [], mae = null, urbanGrowthData }) {
    return useMemo(() => {
        if (!activeQuarter?.isForecast) return null;

        const ranking = (forecastData?.demand || [])
            .filter((d) => Number(d.year) === Number(activeQuarter.year) && Number(d.quarter) === Number(activeQuarter.quarter))
            .map((d) => ({ name: (d.barangay || "").trim(), count: Math.round(Number(d.predicted) || 0) }))
            .filter((r) => r.name)
            .sort((a, b) => b.count - a.count);
        if (ranking.length === 0) return null;
        const total = ranking.reduce((sum, r) => sum + r.count, 0);

        // The guess a planner would make without the model: each barangay's
        // average over the last four recorded quarters before the forecast.
        const firstForecast = series.findIndex((q) => q.isForecast);
        const recorded = series.slice(0, firstForecast === -1 ? series.length : firstForecast).slice(-4);
        let baseline = null;
        if (recorded.length > 0) {
            const byBgy = {};
            recorded.forEach((q) => {
                Object.entries(q.byBgy || {}).forEach(([k, n]) => {
                    byBgy[k] = (byBgy[k] || 0) + n / recorded.length;
                });
            });
            baseline = {
                byBgy,
                total: recorded.reduce((sum, q) => sum + (q.total || 0), 0) / recorded.length,
                span: recorded.length > 1 ? `${recorded[0].label}–${recorded[recorded.length - 1].label}` : recorded[0].label,
            };
        }

        // A rise smaller than the model's own typical miss (MAE) could be
        // noise, so it does not count.
        const riseMargin = Math.max(1, mae ?? 1);
        const rising = baseline
            ? ranking
                .map((r) => {
                    const avg = baseline.byBgy[r.name.toLowerCase()] || 0;
                    return { ...r, avg, rise: r.count - avg };
                })
                .filter((r) => r.rise >= riseMargin)
                .sort((a, b) => b.rise - a.rise)
            : [];

        // The controller groups forest, water and protection zones under
        // Agricultural. The model predicts how many filings, not what kind,
        // so this only says where new applications deserve a closer check.
        const landUse = {};
        Object.entries(urbanGrowthData?.byBarangay || {}).forEach(([name, b]) => {
            landUse[name.trim().toLowerCase()] = b;
        });
        const zoningFlags = rising
            .map((r) => {
                const row = (landUse[r.name.toLowerCase()]?.breakdown || []).find(([cat]) => cat === "Agricultural");
                return { name: r.name, pct: row ? Number(row[2]) : null };
            })
            .filter((r) => r.pct !== null && r.pct >= AGRI_FLAG_PCT);

        return {
            total,
            baseline,
            change: baseline?.total > 0 ? (total - baseline.total) / baseline.total : null,
            topShare: ranking.length > 5 && total > 0 ? ranking.slice(0, 5).reduce((sum, r) => sum + r.count, 0) / total : null,
            rising,
            riseMargin,
            zoningFlags,
        };
    }, [forecastData, activeQuarter, series, mae, urbanGrowthData]);
}
