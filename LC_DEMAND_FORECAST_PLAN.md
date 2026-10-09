# LC Demand Forecast Layer: Assessment and Improvement Plan

The most important finding is that **most of what the layer shows as "forecast" today is not the model's output.** Fix that first (Phase 1), because making invented numbers stand out more would make the problem worse.

---

## 1. Problems with the current layer

### 1.1 Forecast quarters show made-up or mislabeled data
- Today is Q4 '26, so the timeline marks **Q1 '27 and Q2 '27** as the forecast quarters (`resources/js/Pages/Dashboard.jsx`, `buildTimelineQuarters`).
- The model returns **2026 Q3/Q4**. Its output lands on quarters the timeline now treats as recorded history.
- For the real forecast quarters, the filter finds nothing and falls back to showing *every* model pin (`Dashboard.jsx`, `activeHistoricalPins`), or to `getQuarterData()`.
- ~~`ForecastService::getQuarterData()` makes up 14–22 random pins (`mt_rand`)… and reports a fixed MAE of 2.155 and WMAPE of 30.2%~~ — **fixed**: the method and its route are deleted.
- ~~The quarter parsing in `ForecastService::generateForecast()` assumes every label is in 2026 or 2027, and in Q3 or Q4~~ — **fixed**: an unparseable `Quarter_Label` is dropped and logged instead of guessed.

### 1.2 Real counts get turned into fake records
~~The model's per-barangay counts are split into N invented pins. Each pin gets a cycled category, a made-up purpose ("Commercial Complex & Retail Development…") and a random lot area.~~ — **fixed**: `generateForecast()` now returns a `demand` array of `{barangay, year, quarter, label, predicted}` and the map and timeline read those counts directly. No records are invented.

### 1.3 The map shows only one thing
It's a count choropleth (colored map) with arbitrary cut-offs (3/6/10/16, `DEMAND_CLASSES` in `LeafletMap.jsx`). A forecast quarter looks exactly like a recorded one on the map; only a text label is different. The map doesn't show change from earlier quarters, uncertainty, or any link to the land-use plan.

### 1.4 Security and reliability problems
- ~~`POST /api/forecast/generate` in `routes/api.php` needs no login~~ — **stale/incorrect**: the route is in `routes/web.php` inside the auth group with `role:Admin,Planning Officer`.
- ~~A real-looking API key is hardcoded as the fallback in `ForecastService.php`~~ — **fixed**: fallback removed, the call fails closed when the key is unset, and the key was rotated service-side on 2026-10-09 (the committed value authenticates nothing).
- ~~The default CSV is missing~~ — **moot**: the default run no longer reads a file. It builds the CSV from the `historical_data` table (the 6,638 imported rows) and fails closed when that is empty. `storage/app/rosario_zoning_apps_2021_2026.csv` is kept only as the import source for that table.
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

## 3. The forecasting service (verified against its source, 2026-10-09)

**Correction.** This section previously described a `statsmodels` SARIMAX service inferred from
a compiled `python-analytics/__pycache__/main.cpython-314.pyc`. That is not what the port-8002
service is. The real service was located, read and run end-to-end.

- **Where it lives:** its own git repository, a sibling of this one — `../iMAPS-forecasting-service`
  (FastAPI; `app/main.py`, `app/config.py`, `app/security.py`, `app/services/forecasting.py`).
  The empty `iMAPS-forecasting-service/` folder *inside* this repo is a stale skeleton.
- **Model:** a two-stage **"hurdle" XGBoost** pair, not SARIMAX — an `XGBClassifier` gate
  (does this barangay-quarter see any clearances?) multiplied by an `XGBRegressor` intensity,
  tuned with `RandomizedSearchCV` over expanding-window temporal folds (`_temporal_folds`,
  `n_splits=3`, so it is never trained on quarters later than the ones it scores).
- **Scope:** *one panel model over all barangays*, predicting per barangay-quarter — not one
  model per barangay, and not a municipal total split afterwards. A run on the default CSV
  returned 96 rows: 48 barangays × 2 quarters.
- **Features (16):** `Quarter`, `Lag_1`, `Lag_2`, `Lag_4`, `Rolling_4Q_Mean`, `Rolling_4Q_Std`,
  `Spatial_Lag_1`, `Barangay_Mean_Baseline`, `Area_sqm`, `Centroid_X`, `Centroid_Y`,
  `Total_Road_Length_m`, `Road_Density`, `Prop_Residential`, `Prop_Comm_Ind`, `Prop_Restricted`.
  The spatial ones come from three shapefiles in the service's `data/` (barangay boundaries,
  roads, land use) — which its `.gitignore` excludes, so a clone does not deploy them.
- **Training window:** `TRAINING_WINDOW_MONTHS = 60`, anchored on the **last completed
  quarter**. The service refuses the request if the newest quarter in the CSV has not finished,
  is incomplete, or if too few quarters are present.
- **Horizon:** exactly the next **two** quarters, derived from the data — not hardcoded to 2026.
- **Response:** `{forecasts: [{Date, Quarter_Label, Barangay, Predicted_Quarterly_Clearances}],
  metrics: {validation_mae, validation_wmape, validation_r2}, training_window: {...},
  data_quality: {...}, summary: {q<N>_<YEAR>_total, combined_total}}`.
  `validation_wmape` is a **percentage** (e.g. `42.3`), not a fraction.
- **Cost:** it trains on every request. Measured **~24s warm, over 30s cold** (first call loads
  the shapefiles). Laravel set no HTTP timeout, so Guzzle's 30s default aborted the call
  mid-forecast; `FORECAST_SERVICE_TIMEOUT` now defaults to 180s.
- **No prediction intervals.** These are point predictions; there is no fitted-model object with
  confidence bounds to extract. See Phase 2.

## 4. Plan

### Phase 1: Use the real forecast (do this first)

- ~~Have `generateForecast` return totals per barangay and quarter… Remove the pin-splitting.~~ — **done**.
- ~~Delete `getQuarterData()`, its route and the hardcoded metrics.~~ — **done**. The Trends panel shows `—` where there is no run.
- ~~The default run sends a bundled synthetic CSV.~~ — **done**: it is built from the `historical_data` clearances, and fails closed when none are recorded. CSV upload is removed altogether — the run has one input, and it is the recorded history.
- ~~Two components cache the run in localStorage independently.~~ — **done**: `Dashboard.jsx` owns the run (`imaps_forecast_data_v2`) and `TrendsPanel.jsx` reports results up to it. Persisting to `forecast_runs` / `forecast_outputs` is still open.
- Save each run to the existing `forecast_runs` and `forecast_outputs` tables. This needs one migration to add `barangay`, `year` and `quarter` columns. It replaces localStorage and records who ran the forecast and when.
- Base the timeline's forecast quarters on what the model actually returned, not on today's date. If the model's horizon is already in the past, show "Forecast outdated: last run covers Q3–Q4 '26".
- ~~Move the route into the authenticated group, remove the hardcoded API key, restore the default CSV~~ — **all three done** (see §1.4). What remains in this bullet: nothing.

### Phase 2: Get uncertainty out of the service

**Revised.** The original plan here pasted `SARIMAX(...).fit()` / `get_forecast().summary_frame()`
to pull `mean_ci_lower` / `mean_ci_upper`. That does not apply: the service is gradient-boosted
trees, which produce a single number per barangay-quarter and no confidence interval. The
`forecast_outputs.mean_value` / `lower_ci` / `upper_ci` columns can still be filled, but the
bounds have to be *produced*, not read off a fitted model. Two options, cheapest first:

1. **Quantile regression** — refit the intensity stage with
   `XGBRegressor(objective="reg:quantileerror", quantile_alpha=[0.1, 0.5, 0.9])`, giving an
   80% band directly from the same features. Smallest change to the service.
2. **Conformal intervals** — keep the current point model and calibrate residuals on the
   held-out quarters (`training_window.holdout_quarters` is already 2) to get a band with
   coverage guarantees. No retraining, but it needs a calibration step in the pipeline.

The service already returns `metrics` (`validation_mae`, `validation_wmape`, `validation_r2`),
`training_window` and `data_quality`, and Laravel passes the whole payload through — so
anything added server-side reaches the frontend without a Laravel change.

What is still worth adding on the service side, independent of intervals:

- **Fitted values for history**, so the timeline can show model-vs-actual on past quarters.
- **Feature importances** from the two stages, which is the honest version of a "Drivers" list.

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

*Revised for the real model (hurdle XGBoost, not SARIMAX — see §3).*

| Service output | What the planner sees | Available today? |
|---|---|---|
| `training_window` (`start`, `end`, `quarters_used_for_modelling`, `holdout_quarters`) | Exactly how much data the model ran on, e.g. `60 months to Q3 '26 · 20 quarters · 2 held out` | **Yes** |
| `metrics.validation_mae`, `validation_wmape`, `validation_r2` | How far off the model usually is, e.g. `±1.4 clearances per barangay-quarter` | **Yes** |
| `data_quality` | Whether the upload was thin or patchy enough to distrust the output | **Yes** |
| Comparison against a naive baseline (repeat last year's quarter) | Whether the model beats a simple guess — the single most useful honesty signal, and MAE alone does not show it | No — service change |
| Feature importances from the gate and intensity stages | A "Drivers" list, the honest version: which of the 16 features move the prediction | No — service change |
| Quantile or conformal bounds | A range instead of a single number | No — Phase 2 |

There is no `order`/`seasonal_order`/AIC to show, and no seasonal component to decompose; the
calendar quarter is just one of 16 input features. A "which model ran" line should state the
window and the validation error, not a model formula.

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

*Rewritten: the question this section posed — per-barangay model or municipal total split by
share? — is answered. It is neither (see §3).*

The service fits **one panel model across all barangays** and predicts each barangay-quarter
from that barangay's own features: its lags, its 4-quarter rolling mean and std, a spatial lag
from its neighbours, its historical baseline, and its static geography (area, centroid, road
length and density, three land-use proportions). So:

- **The per-barangay number is genuine model output, not an allocation of a municipal total.**
  The map may legitimately be labeled a per-barangay forecast.
- **But it is not an independent model per barangay.** A barangay with almost no history still
  gets a prediction, borrowed from barangays that resemble it geographically. That is a strength
  (thin series do not collapse) and a liability (the number can look confident where there is
  little local evidence). The barangay card should show the recorded history the prediction
  rests on, so a planner can see when it is mostly inference from neighbours.
- **The pin positions carry no extra precision.** Predictions are per barangay; placing them at
  centroids (as `ForecastService` does) is a drawing choice, not a location the model produced.
  A choropleth is the honest form; see §1.5.
- **Report the error with the number.** `validation_wmape` on the current data is 42.3% with an
  MAE of ~1.4 clearances per barangay-quarter. A quarter predicted as `5` should not be
  presented as more precise than that.

---

## 7. Open questions

Questions 1-4 below were **answered** on 2026-10-09 by reading and running the service (§3):

1. ~~**Service source:** where is it?~~ → `../iMAPS-forecasting-service`, its own git repo.
2. ~~**Model scope:** SARIMAX per barangay or one municipal model?~~ → Neither. One hurdle-XGBoost
   panel model over all barangays, predicting per barangay-quarter.
3. ~~**Exog variables:** what are they?~~ → 16 features: calendar quarter, lags 1/2/4, 4-quarter
   rolling mean/std, a spatial lag, a per-barangay baseline, and six static spatial attributes
   (area, centroid X/Y, road length, road density, three land-use proportions).
4. ~~**Forecast horizon:** can it go past 2026 Q4?~~ → Yes. The horizon is the two quarters
   after the last completed quarter in the uploaded CSV; nothing is pinned to 2026.

Genuinely still open:

5. **Uncertainty:** quantile regression or conformal intervals (Phase 2)? This decides whether
   the map can show a range rather than a single number.
6. **Run cadence:** the service retrains on every request (~24s). Should forecasts be generated
   on a schedule and stored in `forecast_runs` / `forecast_outputs`, rather than on page load?
7. **WMAPE of 42.3% on the current data** — is a mean absolute error of ~1.4 clearances per
   barangay-quarter good enough to plan with, and what should the UI say about that?
