# Map Layers Audit for the Thesis Defense

Run on 2026-10-16 against the local database (`imaps_db`), the forecasting service's own code, and the PSA–NAMRIA 2023 boundary geodatabase. Nothing in the app was changed; this is a report.

**Data used:** `historical_data` (6,638 records, Jan 2021–Sep 2026), `zoning_applications` + `parcels` + `application_status_tracks` (97 live applications), `site_inspections`, `barangay_boundary`, `rosario_boundary`, `land_use_plan` (CLUP 2030, 513 polygons), and `phl_adm_psa_namria_20231106_GDB.gdb`.

---

## The short version

1. **Your strongest evidence isn't on the map yet.** Land-use activity in Rosario *is* clustered, and the statistics prove it (Moran's I = 0.67, p = 0.001). The Poblacion barangays plus Namuco and San Roque form a significant hot spot. Objective 3.1 promises "clustering", and no layer shows this.
2. **The forecast beats a simple guess, but the system doesn't say so.** Tested on 14 past periods, XGBoost was 13% more accurate per barangay than "same quarter last year". The single R² the system shows (0.836) is one of its luckiest draws. Over the same 14 periods it ranged from 0.21 to 0.84.
3. **The Diversity colours aren't stable.** For 42 of 48 barangays, the score's normal range of variation crosses a tier line. A barangay's colour is often down to which few large lots happened to be filed.
4. **The forecast map will look nearly blank at the defense.** The next forecast quarter (Q4 2026) is the quiet season. It predicts about 96 applications across all 48 barangays, and 38 of 48 forecasts are flagged low-confidence. With fixed colour cut-offs, almost everything lands in the lowest class.
5. **The geometry is mostly sound but has fixable defects.** The CLUP, barangay and municipal layers agree to within 0.8 ha out of 22,669 ha. But 5 barangay and 23 CLUP polygons are invalid shapes, and 10 live applications are pinned up to 1.5 km *outside* Rosario.

---

## Ranked fix list (most likely to hurt you at the defense first)

| # | Layer | What's wrong (with numbers) | Fix | How to prove the fix (not by trusting us) |
|---|---|---|---|---|
| 1 | LC Demand Forecast | The system shows one 2-quarter holdout score (today: R² 0.836, WMAPE 39.6%, MAE 1.33). Re-running the same holdout at 14 earlier cut-off dates gave R² from 0.21 to 0.84 and WMAPE from 31% to 84%. The reported number depends on which quarters happen to be held out. | Report the rolling backtest (14 origins) next to a baseline: **XGBoost MAE 1.71 vs 1.97 for "same quarter last year" (13% better), R² 0.78 vs 0.73, WMAPE 39% vs 45%** (1 quarter ahead). Put this table in Chapter 4 and in the forecast panel. | Anyone can re-run the backtest script and get the same numbers. When Q4 2026 closes, compare the real counts with today's forecast. |
| 2 | (missing) Clustering | SO3.1 says "land-use clustering". Diversity measures *mix inside* a barangay, not whether busy barangays *sit next to each other*. The clustering result exists (below) but isn't shown. | Add a hot-spot view: LISA on LC applications per km². With false-discovery correction, **Poblacion A–E, Namuco and San Roque** are a significant high-high cluster. *This is a new feature, so it's listed under Proposals; you decide.* | GeoDa (free) on the exported barangay table with queen contiguity reproduces Moran's I ≈ 0.67 and the same cluster. |
| 3 | Diversity Index | **42 of 48** barangays have a 90% bootstrap range that crosses a tier line (median range 0.18 wide; tiers are 0.15 wide). In **Malaya** and **San Ignacio**, one lot is over half the filed area. Weighting by lot area vs by number of filings gives unrelated rankings (Spearman −0.14). | Show the score as a range, or flag "uncertain tier" when the range crosses a line. State in the manuscript *why* it's area-weighted. Add a caption: "based on 4,702 records with a zone and lot area". | Re-run the bootstrap; the share of tier-crossing barangays should be stated, not hidden. A panelist can recompute Shannon from the CSV in Excel. |
| 4 | LC Demand Forecast | **Seasonality:** 54% of all LC applications arrive in Q1 and only 5.5% in Q3. The fixed classes (0–2 / 3–5 / 6–9 / 10–15 / 16+) put **41 of 48** barangays in the lowest class for the last real quarter (Q3 2026), and the coming Q4 forecast averages 2 per barangay. | Colour by **change vs the same quarter last year** (or classes cut per quarter), and show the model's existing low/medium/high confidence on the map. | The legend counts per class are visibly spread out for every quarter on the timeline, including Q3/Q4. |
| 5 | Application Tracking | **10 live applications (13 lot pins)** sit 0.45–1.5 km **outside Rosario** (labelled Balibago and Quilib). **5 more** are pinned inside a different barangay than declared (Alupay→Itlugan, Antipolo→Santa Cruz, Namuco→Quilib, San Carlos→Marilag). **2** use the names "Barangay B (Poblacion)" and "Barangay C (Poblacion)", which don't match the map's "Poblacion B/C", so they aren't counted on the choropleth. | Before the defense, clean or re-seed the demo data. In the app, warn at encoding time when a pin falls outside the declared barangay, and normalise the Poblacion names. | SQL: every pin intersects its declared barangay (0 mismatches); the map total equals `SELECT count(*) FROM zoning_applications`. |
| 6 | Application Tracking | Your screenshot says **5 applications**, but the local database has **97**. The panel will see whichever database you present from. | Decide which database you'll demo from and check its numbers the morning of the defense. | The status-legend counts add up to the header total (in your screenshot 0+2+0+2+0+1 = 5 ✓). |
| 7 | Barangay boundaries | **5 barangay polygons are invalid shapes** (self-intersecting rings): Calantas, Mabunga, Masaya, San Isidro, Nasi. Mabunga and Nasi fail at the same point, on their shared edge. | One migration: `UPDATE … SET geom = ST_MakeValid(geom)`, then clear the map layer cache. | `SELECT count(*) FROM barangay_boundary WHERE NOT ST_IsValid(geom)` returns 0. QGIS's Topology Checker shows no errors. |
| 8 | CLUP 2030 zoning | **23 CLUP polygons are invalid** (12 PDA-SZ, 5 R1-Z, 2 C1-Z, others). All **513 are labelled EPSG:4326 but hold Luzon 1911 / Zone III metres**. The app guesses the real projection in at least 3 places (`MapController`, `SearchController`, the tax-map lookup). The guess is correct today, but anyone opening the table in QGIS sees the CLUP drawn in the wrong place. | One migration: `ST_MakeValid(ST_Transform(ST_SetSRID(geom, 25393), 4326))`, then remove the guessing `CASE` blocks. | The CLUP union still matches the municipal outline to within 0.8 ha (it does now, measured). A zoning lookup on 10 known lots returns the same zone before and after. |
| 9 | LC Demand Forecast (model) | The model's "neighbour" feature (`Spatial_Lag_1`) uses strict `touches`, which finds **89** neighbour pairs. With a 2 m snap tolerance there are **115**, so **26 real neighbour links (23%)** are missing because of tiny gaps in the shapefile. | Use a small tolerance (e.g. `buffer(2).intersects`) in the service. Re-run the backtest to see whether accuracy changes. | Pair count = 115, and the backtest numbers are re-reported. |
| 10 | Application Tracking (time) | SO3.1 says "spatio-temporal". The Diversity layer has a time slider; Application Tracking has none. The real trend is significant: **seasonal Mann-Kendall p = 0.0002** (LC filings rising: 645 in 2021 → 778 in 2024 → 760 in the first three quarters of 2026). A plain Mann-Kendall misses it entirely (p = 0.60) because of the seasonality. | Show change over time per barangay (vs the same quarter last year). Quote the municipal trend in the overview. No single barangay's trend survives correction for testing 48 at once, so say so rather than naming "growing" barangays. | The seasonal Mann-Kendall reproduces in R (`Kendall::SeasonalMannKendall`) or with Python's `pymannkendall`. |
| 11 | Basemap / status bar | The status bar says **EPSG:4326**, but Leaflet draws in Web Mercator (EPSG:3857). The coordinate readout is lat/lng in WGS 84, which is correct, but a GIS panelist may ask. | Relabel it "WGS 84 (lat/lng)", or be ready to explain. | — |
| 12 | All analytics | **1,218 historical records (18%)** have neither a zoning code nor a lot area: exactly 609 Locational Clearances and 609 Zoning Certificates, which looks like an import artefact. They count toward application volumes but are silently left out of Diversity. | Find out why it's exactly 609 + 609. Disclose the exclusion in the Diversity caption. | The source spreadsheet row count matches. |

---

## Layer by layer

### Application Tracking (SO1.1, SO2)
- **Question it answers:** Where are applications right now, and at what stage?
- **Counts vs density:** barangays range from 0.11 km² to 17.3 km² (a 157× difference). For *workload*, raw counts are the right measure, so keep them here. For *development pattern*, use counts per km². The two rankings differ (Spearman 0.64): Santa Cruz and Bagong Pook lead by count, the Poblacions lead by density.
- **Live data shows no clustering** (Moran's I = 0.02, p = 0.08, not significant), while 5 years of real history clusters strongly. This is another sign the live rows are demo data. Base analytical claims on history.
- **Processing time (not shown on the map):** on the current data, 62 of 79 open applications have been open more than 20 working days (RA 11032's limit for highly technical applications), and Technical Review has a median of 26.5 working days. Applications that reached release did so in a median of 0 days, so this is test data and the numbers say nothing about the real office. The point is that the map can't show it.

**Hardest panel questions:**
- "Why do 5 lots appear outside Rosario?" (*not answered; fix #5*)
- "Is 11+ a lot? Why these breaks?" (*not answered on screen*)
- "How long has this application been waiting?" (*not answered*)

### LC Demand Forecast (SO3.2)

**Rolling backtest:** 14 forecast origins, Q4 2022 to Q1 2026, using the service's own `_build_panel` and `_train_and_forecast`.

| 1 quarter ahead | MAE | WMAPE | R² |
|---|---|---|---|
| **XGBoost (yours)** | **1.71** | **39.2%** | **0.783** |
| Same quarter last year | 1.97 | 45.2% | 0.728 |
| Barangay's average for that quarter | 2.14 | 49.1% | 0.597 |
| Last quarter's count | 4.23 | 97.0% | −0.306 |

| 2 quarters ahead | MAE | WMAPE | R² |
|---|---|---|---|
| **XGBoost** | **1.51** | **39.1%** | **0.820** |
| Same quarter last year | 1.79 | 46.3% | 0.742 |

What the backtest shows:
- **Ranges are honest:** the "80%" ranges actually captured 87–88% of real outcomes, so they're slightly wide.
- **Weak spots to admit:**
  - For the *municipal total*, "same quarter last year" was more accurate (12.6% error vs 16.7%).
  - In 14 of 48 barangays, the simple guess beat the model.
  - Santa Cruz, the busiest barangay, is under-forecast by about 3.9 applications per quarter.
  - Quiet quarters are hard: in Q3, WMAPE is 92% for XGBoost vs 106% for the simple guess.
- **The live run today** forecasts 96 for Q4 2026 (same quarter last year: 89) and 386 for Q1 2027 (last year: 437).
- **The old `forecast_runs` table** holds metrics from the retired model (MAPE/MASE, with no R² or WMAPE). Nothing displays it, but don't cite it.

**Hardest panel questions:**
- "Is R² 0.84 better than just repeating last year?" (*answerable now, with the table above*)
- "Why is the whole map pale?" (*fix #4*)
- "How sure are you about Tulos next quarter?" (*the confidence flag exists in the API, but not on the map*)

### Diversity Index (SO3.1)
- **Score:** normalised Shannon over 11 CLUP categories, area-weighted, over 5 years. The numbers here were recomputed outside the app with the same method; they weren't compared against the scores the app shows. All 48 barangays have at least 5 records, so none falls back to the plan.
- **Distribution:** scores run from 0.11 to 0.71 (median 0.37). Tiers: 3 monoculture, 6 developing, 27 balanced, 6 diverse, 6 high.
- **It is spatially clustered** (Moran's I = 0.35, p = 0.001). After correction, San Roque is the only significant high-high barangay.
- **Recorded vs planned mix are nearly unrelated** (Spearman 0.17). That's a real finding worth saying out loud: development isn't following the plan's mix.
- **Sensitivity:** regrouping the 11 categories into 6 keeps rankings similar (Spearman 0.75). Switching from area-weighting to count-weighting scrambles them (−0.14).

**Hardest panel questions:**
- "What does 0.45 mean?" (*the tier summaries answer this partly*)
- "Why area-weighted?" (*not answered*)
- "Would one big subdivision change Malaya's colour?" (*yes, and that's not shown*)

### CLUP 2030 zoning overlay and barangay boundaries (SO2)

**Internal consistency is excellent:**

| Layer | Area |
|---|---|
| Municipal outline | 22,669.2 ha |
| Union of barangays | 22,669.0 ha |
| CLUP polygons | 22,668.9 ha |

- Only 0.8 ha of Rosario is left unzoned, and no two barangays overlap by more than 100 m².
- The stored `land_area` column sums to 226.66 km², in line with the published land area (about 226.9 km²; confirm against the CLUP document).
- The Luzon 1911 → WGS 84 datum shift is applied (`towgs84=-133,-77,-51`), so the CLUP isn't offset from the satellite image.

**Against PSA–NAMRIA 2023 boundaries:**
- NAMRIA's polygons total only 199.0 km², and per barangay they overlap yours by a median 62%, with a median centroid offset of 294 m.
- The biggest differences: Tulos (overlap 15%), Palakpak (yours is 4× larger), Quilib, Matamis, San Jose.
- **Defense answer:** NAMRIA's boundaries are indicative and not survey-grade. Yours come from the MPDO's own CLUP shapefile, and they match both the CLUP and the official land area.
- **Name differences to expect:** PSA uses "Barangay A (Pob.)" for your "Poblacion A", and "Leviste (Tubahan)" for "Leviste".

**Hardest panel questions:**
- "Where are your boundaries from, and why don't they match NAMRIA?" (*prepare the answer above*)
- "Are the zoning lookups exact at lot edges?" (*yes, except near the 23 invalid polygons; fix #8*)
- "Which projection is the data in?" (*answer: Luzon 1911 / Philippines Zone III, EPSG:25393, displayed in WGS 84*)

### Site inspection evidence (SO1.3)
- Only **2** inspections have GPS fixes. They landed 22 m and 10 m from their lot pins, with reported GPS accuracy of 5 m and 16 m.
- Neither could be checked against the actual lot outline, because their parcels have no PIN match in the tax map.
- No map layer shows inspection evidence.

**Hardest panel question:**
- "Show me a geotagged photo on the map." (*not possible today*)

---

## Proposals (new features, not fixes; your call)

1. **Hot-spot lens** for clustering (closes the SO3.1 "clustering" gap; result #2 above).
2. **Change-over-time view** for Application Tracking (closes "spatio-temporal" on the map).
3. **Inspection evidence pins**: GPS point plus photo, linked to the lot (shows SO1.3 on the map).
4. **Processing-age overlay**: open applications coloured by working days against the RA 11032 limits.
5. **Forecast accuracy panel**: the backtest table above, plus a map of where the model over- or under-forecasts.

---

## What's already solid (say this with confidence)

- Boundaries, CLUP and the municipal outline agree to within 0.8 ha out of 22,669 ha, and the datum shift is handled correctly.
- All 6,638 historical records join to a barangay (0 unmatched names).
- The forecast beats the standard naive baseline per barangay at both horizons, and its 80% ranges are honestly calibrated (87–88%).
- Land-use activity really is spatially clustered, and filings really are rising municipality-wide. Both results are statistically significant.

---

## How it was measured

| Check | Method |
|---|---|
| Spatial weights | Queen contiguity on barangay polygons in UTM 51N with a 2 m snap tolerance (mean 4.8 neighbours, no islands); row-standardised |
| Moran's I | 999 permutations |
| LISA | Conditional permutations (999), Benjamini–Hochberg false-discovery correction at 0.05 |
| Trends | Seasonal Mann-Kendall (Hirsch) on 23 quarters of LC counts |
| Forecast backtest | The service's own panel and training code, at 14 cut-offs, compared with three naive baselines |
| Diversity uncertainty | 500 bootstrap resamples of each barangay's records |
| Geometry | PostGIS `ST_IsValid`; areas in EPSG:32651 |
| NAMRIA comparison | Name-matched polygons; intersection-over-union and centroid distance |
