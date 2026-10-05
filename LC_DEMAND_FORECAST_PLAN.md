# LC Demand Forecast Layer: Assessment and Improvement Plan

The most important finding is that **most of what the layer shows as "forecast" today is not the model's output.** Fix that first (Phase 1), because making invented numbers stand out more would make the problem worse.

---

## 1. Problems with the current layer

### 1.1 Forecast quarters show made-up or mislabeled data
- Today is Q4 '26, so the timeline marks **Q1 '27 and Q2 '27** as the forecast quarters (`resources/js/Pages/Dashboard.jsx`, `buildTimelineQuarters`).
- The model returns **2026 Q3/Q4**. Its output lands on quarters the timeline now treats as recorded history.
- For the real forecast quarters, the filter finds nothing and falls back to showing *every* model pin (`Dashboard.jsx`, `activeHistoricalPins`), or to `getQuarterData()`.
- `ForecastService::getQuarterData()` makes up 14–22 random pins (`mt_rand`) spread evenly across barangays, and reports a fixed MAE of 2.155 and WMAPE of 30.2%.
- The quarter parsing in `ForecastService::generateForecast()` assumes every label is in 2026 or 2027, and in Q3 or Q4.

### 1.2 Real counts get turned into fake records
The model's per-barangay counts are split into N invented pins. Each pin gets a cycled category, a made-up purpose ("Commercial Complex & Retail Development…") and a random lot area. The frontend then counts those pins back up. The fake details also show up in drill-downs as if they were real.

### 1.3 The map shows only one thing
It's a count choropleth (colored map) with arbitrary cut-offs (3/6/10/16, `DEMAND_CLASSES` in `LeafletMap.jsx`). A forecast quarter looks exactly like a recorded one on the map; only a text label is different. The map doesn't show change from earlier quarters, uncertainty, or any link to the land-use plan.

### 1.4 Security and reliability problems
- `POST /api/forecast/generate` in `routes/api.php` needs no login, and it accepts file uploads.
- A real-looking API key is hardcoded as the fallback in `ForecastService.php`.
- The default CSV (`storage/app/rosario_zoning_apps_2021_2026.csv`) is missing, so the automatic run fails without telling anyone.
- Forecast results are stored in localStorage by two separate components (`Dashboard.jsx` and `TrendsPanel.jsx`), and they never expire. Meanwhile the `forecast_runs` and `forecast_outputs` tables already exist and go unused.

### 1.5 Map points aren't real locations
Historical pins are barangay centroids with jitter added (`DashboardController.php`). The barangay is the most precise level the data supports, so a point heatmap would suggest precision the data doesn't have.

---

## 2. What the layer is for

For a planner, the layer should answer three questions:

1. **Where** will locational clearance (LC) applications come in next?
2. **How is that changing** compared with the trend?
3. **Does that demand fall on land the CLUP zones for it?**

The data in the system can already answer all three:
- Historical LCs include `zoning_code`, `purpose` and `lot_area_sqm`.
- The CLUP `lup_2030` parcels are already loaded for the diversity layer.
- Barangay boundaries are already stored in `barangay_boundary`.

---

## 3. What we know about the SARIMAX service

- **There is a SARIMAX service in the repo, but no source.** `python-analytics/__pycache__/main.cpython-314.pyc` is a compiled FastAPI app. It uses `statsmodels` SARIMAX with:
  - automatic `order`/`seasonal_order` selection by `best_aic`
  - `exog` and `future_exog` (outside variables fed into the model)
  - a log transform
  - a `naive_forecast_error` comparison
  - training data from `rosario_monthly_forecasting_data.csv`
- **`main.py` itself is not in the repo.** That source (or wherever the port-8002 service lives) is needed to change what the service returns.
- **Laravel calls a different endpoint**, `/api/v1/forecast` on port 8002, and receives per-barangay `Predicted_Quarterly_Clearances`. It is not yet clear whether that is SARIMAX run per barangay, or one municipal model split across barangays. This changes what the map can honestly claim (see section 6).

---

## 4. Plan

### Phase 1: Use the real forecast (do this first)

- Have `generateForecast` return totals per barangay and quarter (`{barangay, year, quarter, predicted}`), with the quarter label parsed by regex (`(\d{4})\s*Q(\d)`). Remove the pin-splitting.
- Delete `getQuarterData()`, its route and the hardcoded metrics.
- Save each run to the existing `forecast_runs` and `forecast_outputs` tables. This needs one migration to add `barangay`, `year` and `quarter` columns. It replaces localStorage and records who ran the forecast and when.
- Base the timeline's forecast quarters on what the model actually returned, not on today's date. If the model's horizon is already in the past, show "Forecast outdated: last run covers Q3–Q4 '26".
- Move the route into the authenticated group in `routes/web.php`, remove the hardcoded API key, and either restore the default CSV or turn off the automatic run.

### Phase 2: Have the service return everything SARIMAX produces

The service now throws away most of the fitted model's output. All of it is available from the fitted result:

```python
res = SARIMAX(y_log, exog=X, order=best_order, seasonal_order=best_seasonal_order).fit(disp=False)
fc  = res.get_forecast(steps, exog=future_exog)
f95 = fc.summary_frame(alpha=0.05)   # mean, mean_ci_lower, mean_ci_upper
f80 = fc.summary_frame(alpha=0.20)
back = np.expm1                      # undo log1p; apply to mean AND bounds

return {
  "model": {"order": best_order, "seasonal_order": best_seasonal_order, "aic": res.aic,
            "n_obs": res.nobs, "train_end": "2026-06", "exog": {k: res.params[k] for k in X.columns}},
  "metrics": {"mae": mae, "wmape": wmape, "naive_mae": naive_mae},
  "series": [{"barangay": name,           # or "ALL" for the municipal model
              "history":  [{"period", "actual", "fitted"}],        # res.fittedvalues
              "forecast": [{"period", "mean", "lo80", "hi80", "lo95", "hi95"}]}]
}
```

Laravel stores this in `forecast_outputs`, which already has `mean_value`, `lower_ci` and `upper_ci` columns.

### Phase 3: Make the forecast stand out on the map and timeline

**Map**
- **Forecast styling:** a hatched fill matching the timeline's hatch, a dashed boundary and a "FORECAST" badge on the map. This uses patterns as well as color, so it doesn't rely on color alone.
- **Three views within the layer:**
  - **Demand:** the count, as it works now.
  - **Change:** the difference from the last recorded quarter, using a two-sided color scale (red for growth, blue for decline). A barangay is marked as rising only when `lo80` is above the last actual value, so growth is flagged only where the model says it is likely, not where it is noise. The data is already in `quarterSeries.byBgy`.
  - **Compared with the 4-quarter average.**
- **Two layers at once:** keep the choropleth for the recorded baseline and add a circle at each barangay centroid sized by forecast count. One map then shows "then" and "next" together.
- **Better class breaks:** calculate them once from the full 2021–26 distribution instead of hand-picking them, and keep them fixed across quarters so playback stays comparable.
- **Labels:** show the forecast with its range, e.g. `12 (8–17)`.

**Timeline**
- **Fan chart:** bars for actual quarters, a line for fitted values, then the forecast line with shaded 80% and 95% bands. This replaces the hatched bars.
- Fitted values over the historical quarters show whether the model tracked the past. This is the validation evidence.
- Show the date of the model run, and shade the forecast section.

**Barangay card**
- For a forecast quarter, show the predicted count with its range, the last recorded count, the 4-quarter average and a small fan-chart sparkline (reuse the one in `TrendsPanel`).

**"Model" card in the panel**

| SARIMAX output | What the planner sees |
|---|---|
| `order`, `seasonal_order`, AIC, number of observations, training end date | Exactly which model ran, on how much data, e.g. `SARIMAX(1,1,1)(1,0,1)₄ · AIC 214.3 · 22 quarters to Q2 '26` |
| `mae` compared with `naive_mae` | Whether the model beats a simple guess, e.g. "31% more accurate than repeating last year's figure". MAE on its own doesn't show this. |
| `exog` coefficients | A "Drivers" list showing what pushes demand up or down, with direction and size |
| Seasonal component | A small 4-bar quarter profile showing which quarter usually peaks |

### Phase 4: Connect demand to the land-use plan

- **Demand by type:** take each barangay's historical mix of zoning codes (commercial, residential, industrial and so on) and apply it to the forecast count. Label the result "estimated from historical mix", not as model output.
- **Pressure on zoned land:** compare that estimated demand with the CLUP `lup_2030` area that allows each type. Flag barangays where, for example, commercial demand is rising but little land is zoned C. This is the finding a planner can act on.
- **Planning watchlist:** add a panel section listing the barangays with the most growth combined with a zoning mismatch.

### Phase 5: Smaller fixes

- Add a legend swatch for the hatched fill.
- Add a CSV export of the forecast table for the Reports page.

---

## 5. What we are deliberately leaving out

- **A heatmap library and marker clustering:** the points are jittered centroids, so these would look precise without being precise.
- **A charting library:** the fan chart and sparklines can be built with the SVG and div bars already in `TimelineBar`.
- **Point-level forecast markers:** the model forecasts per barangay, not per parcel.

---

## 6. Be accurate about the map

SARIMAX is a time-series model, so it doesn't produce anything spatial by itself. The map is only as honest as the setup behind it:

- **SARIMAX fitted per barangay:** the choropleth and intervals are genuine model output for each place. The catch is that most barangays only have about 22 quarters of small counts, which is thin for seasonal SARIMAX. Those barangays will get wide intervals, and the map should show that rather than hide it.
- **One municipal SARIMAX split across barangays by historical share:** the timeline fan chart is SARIMAX output, but the map is an allocation. It should be labeled "municipal forecast × barangay share", not "SARIMAX per barangay".
- **Middle option:** fit per barangay where there is enough history, and use the share split elsewhere, with the source marked on the barangay card.

---

## 7. Open questions

1. **Service source:** where is the `main.py` source, or the repo and path of the port-8002 service? It is needed to add the intervals and fitted values to the response.
2. **Model scope:** does the port-8002 service run SARIMAX per barangay, or one municipal model?
3. **Exog variables:** what are they? They decide whether a "Drivers" list is worth showing.
4. **Forecast horizon:** can the model forecast further than 2026 Q4?
