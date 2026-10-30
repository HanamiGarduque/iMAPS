import { useMemo } from "react";
import { ZONE_CATEGORIES, ZONE_MAP } from "@/utils/clupZones";

// Share of a barangay's CLUP 2030 area zoned agricultural or protected at
// which rising demand there is worth a zoning check. Most of Rosario is
// agricultural (35 of 48 barangays are 60%+), so only near-total shares
// single a barangay out.
const AGRI_FLAG_PCT = 90;

// LC filings are strongly seasonal (Q1 ≈ 400, Q3 ≈ 40 every year), so a
// forecast quarter is judged against the same quarter in earlier years, never
// against the quarters just before it.
const SEASONAL_YEARS = 3;

// Expected application mix. Each barangay's own filing history sets its split
// of land-use categories, but most barangays file only a few LC a quarter, so
// a split from a handful of filings is noisy. It is pulled toward the town-wide
// split as if the barangay had MIX_PRIOR extra filings of average mix: a
// barangay with 50 filings keeps ~90% of its own pattern, one with 3 mostly
// follows the town. Back-tested on the last 12 recorded quarters, this beat
// the old two-year window with no pooling by ~11% in log-loss on each
// filing's category (1.49 → 1.33) and about 0.5 points of town-wide error.
const MIX_PRIOR = 5;

const WEEKS_PER_QUARTER = 13;

const quarterKey = (q) => `${q.year}-${q.quarter}`;

// Zoning category of a recorded filing, from its zoning code. A blank or
// unknown code stays "not recorded" rather than being guessed.
const NOT_RECORDED = { id: "none", label: "Zone not recorded", fill: "#e2e8f0", stroke: "#94a3b8" };
function zoneCategoryOf(code) {
    const entry = ZONE_MAP[String(code || "").trim()];
    if (!entry) return NOT_RECORDED;
    const cat = ZONE_CATEGORIES[entry.category];
    return cat ? { id: entry.category, ...cat } : NOT_RECORDED;
}

// What a forecast quarter means for the office, all from the model's
// per-barangay counts and the recorded history. Null on a recorded quarter
// or when there is no forecast for it.
export default function useForecastWatchlist({ forecastData, activeQuarter, series = [], mae = null, urbanGrowthData }) {
    return useMemo(() => {
        if (!activeQuarter?.isForecast) return null;

        const rows = Array.isArray(forecastData?.demand) ? forecastData.demand : [];
        const ranking = rows
            .filter((d) => Number(d.year) === Number(activeQuarter.year) && Number(d.quarter) === Number(activeQuarter.quarter))
            .map((d) => ({ name: (d.barangay || "").trim(), count: Math.round(Number(d.predicted) || 0), raw: Math.max(0, Number(d.predicted) || 0) }))
            .filter((r) => r.name)
            .sort((a, b) => b.count - a.count);
        if (ranking.length === 0) return null;
        const total = ranking.reduce((sum, r) => sum + r.count, 0);

        const recorded = series.filter((q) => !q.isForecast && q.total !== null);
        const byKey = Object.fromEntries(recorded.map((q) => [quarterKey(q), q]));

        // ── Against the same quarter in earlier years ──
        const sameQuarter = recorded
            .filter((q) => q.quarter === activeQuarter.quarter && q.year < activeQuarter.year)
            .slice(-SEASONAL_YEARS);
        let seasonal = null;
        if (sameQuarter.length > 0) {
            const byBgy = {};
            sameQuarter.forEach((q) => {
                Object.entries(q.byBgy || {}).forEach(([k, n]) => {
                    byBgy[k] = (byBgy[k] || 0) + n / sameQuarter.length;
                });
            });
            const first = sameQuarter[0];
            const last = sameQuarter[sameQuarter.length - 1];
            seasonal = {
                byBgy,
                total: sameQuarter.reduce((sum, q) => sum + q.total, 0) / sameQuarter.length,
                years: sameQuarter.length,
                span: sameQuarter.length > 1 ? `Q${activeQuarter.quarter} '${String(first.year).slice(-2)}–'${String(last.year).slice(-2)}` : last.label,
            };
        }
        const lastYear = byKey[`${activeQuarter.year - 1}-${activeQuarter.quarter}`] || null;

        // This quarter's usual share of a year's filings, over complete years.
        let seasonShare = null;
        {
            let inQuarter = 0;
            let inYear = 0;
            const years = [...new Set(recorded.map((q) => q.year))];
            years.forEach((y) => {
                const qs = [1, 2, 3, 4].map((n) => byKey[`${y}-${n}`]);
                if (qs.some((q) => !q)) return;
                inQuarter += qs[activeQuarter.quarter - 1].total;
                inYear += qs.reduce((sum, q) => sum + q.total, 0);
            });
            if (inYear > 0) seasonShare = inQuarter / inYear;
        }

        // ── Barangays moving against their own usual level ──
        // A change smaller than the model's typical miss (MAE) could be noise.
        const margin = Math.max(1, mae ?? 1);
        // Barangays with no LC filing recorded in any quarter: the model's
        // figure there comes only from neighbours and land use.
        const everRecorded = new Set(recorded.flatMap((q) => Object.keys(q.byBgy || {})));
        const compared = seasonal
            ? ranking.map((r) => {
                const usual = seasonal.byBgy[r.name.toLowerCase()] || 0;
                return {
                    ...r,
                    usual,
                    change: r.count - usual,
                    isNew: usual < 0.5,
                    noHistory: !everRecorded.has(r.name.toLowerCase()),
                };
            })
            : [];
        const rising = compared.filter((r) => r.change >= margin).sort((a, b) => b.change - a.change);
        const easing = compared.filter((r) => r.change <= -margin).sort((a, b) => a.change - b.change);

        // ── Rising demand on land CLUP 2030 keeps agricultural ──
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

        // ── Expected application mix ──
        // Built from the model's unrounded counts, so barangays rounded down to
        // 0 still count for what they add up to, then scaled to the quarter
        // total shown above so the figures agree with it.
        const bgyMix = {};
        const townMix = {};
        const categories = {};
        Object.values(urbanGrowthData?.historicalPins || {}).flat().forEach((p) => {
            const cat = zoneCategoryOf(p.zoning_code);
            categories[cat.id] = cat;
            const b = (p.barangay || "").trim().toLowerCase();
            const m = (bgyMix[b] ||= {});
            m[cat.id] = (m[cat.id] || 0) + 1;
            townMix[cat.id] = (townMix[cat.id] || 0) + 1;
        });
        const townN = Object.values(townMix).reduce((a, b) => a + b, 0);
        const townShare = Object.fromEntries(Object.entries(townMix).map(([id, n]) => [id, n / townN]));
        const shareFor = (name) => {
            const own = bgyMix[name.toLowerCase()] || {};
            const n = Object.values(own).reduce((a, b) => a + b, 0);
            return Object.fromEntries(Object.entries(townShare).map(([id, t]) => [id, ((own[id] || 0) + MIX_PRIOR * t) / (n + MIX_PRIOR)]));
        };
        const rawTotal = ranking.reduce((sum, r) => sum + r.raw, 0);
        const expected = {};
        if (townN > 0 && rawTotal > 0) {
            ranking.forEach((r) => {
                Object.entries(shareFor(r.name)).forEach(([id, f]) => {
                    expected[id] = (expected[id] || 0) + (r.raw / rawTotal) * f;
                });
            });
        }
        // One barangay's own split, for when it is selected: its expected
        // filings spread over the same pooled shares used above.
        const mixByBgy = {};
        if (townN > 0) {
            ranking.forEach((r) => {
                mixByBgy[r.name.toLowerCase()] = Object.entries(shareFor(r.name))
                    .map(([id, f]) => ({ ...categories[id], id, count: f * r.raw, share: f }))
                    .filter((m) => m.count >= 0.05)
                    .sort((a, b) => (a.id === "none") - (b.id === "none") || b.count - a.count);
            });
        }
        // The forecasting service computes the same split server-side from the
        // full training window, with 80% ranges; prefer it when the run has one.
        const served = forecastData?.application_mix?.quarters?.[`${activeQuarter.year} Q${activeQuarter.quarter}`];
        const mix = (Array.isArray(served) && served.length > 0
            ? served.map((m) => ({
                ...(m.id === NOT_RECORDED.id ? NOT_RECORDED : { id: m.id, ...ZONE_CATEGORIES[m.id] }),
                id: m.id,
                label: (m.id === NOT_RECORDED.id ? NOT_RECORDED : ZONE_CATEGORIES[m.id])?.label || m.label,
                count: Number(m.share) * total,
                share: Number(m.share),
                lower: m.lower_80,
                upper: m.upper_80,
            }))
            : Object.entries(expected).map(([id, f]) => ({ ...categories[id], id, count: f * total, share: f })))
            .filter((m) => m.count >= 0.5)
            // Unrecorded zones always last, so the categories read first.
            .sort((a, b) => (a.id === "none") - (b.id === "none") || b.count - a.count);

        // ── The full outlook: every quarter the run forecast ──
        const outlookTotals = {};
        rows.forEach((d) => {
            const k = `${Number(d.year)}-${Number(d.quarter)}`;
            outlookTotals[k] = (outlookTotals[k] || 0) + Math.round(Number(d.predicted) || 0);
        });
        const outlook = series
            .filter((q) => q.isForecast && outlookTotals[quarterKey(q)] !== undefined)
            .map((q) => {
                const prior = byKey[`${q.year - 1}-${q.quarter}`];
                const n = outlookTotals[quarterKey(q)];
                return {
                    year: q.year,
                    quarter: q.quarter,
                    label: q.label,
                    total: n,
                    yoy: prior?.total > 0 ? (n - prior.total) / prior.total : null,
                    active: quarterKey(q) === quarterKey(activeQuarter),
                };
            });

        return {
            total,
            perWeek: total / WEEKS_PER_QUARTER,
            lastYear: lastYear ? { label: lastYear.label, total: lastYear.total, change: lastYear.total > 0 ? (total - lastYear.total) / lastYear.total : null } : null,
            seasonal,
            seasonShare,
            topShare: ranking.length > 5 && total > 0 ? ranking.slice(0, 5).reduce((sum, r) => sum + r.count, 0) / total : null,
            rising,
            easing,
            margin,
            zoningFlags,
            mix,
            mixByBgy,
            outlook,
            mae,
        };
    }, [forecastData, activeQuarter, series, mae, urbanGrowthData]);
}
