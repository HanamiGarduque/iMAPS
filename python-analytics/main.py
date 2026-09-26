from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import numpy as np
import requests
import os
import datetime
from dateutil.relativedelta import relativedelta
from importlib import import_module
from sklearn.metrics import mean_absolute_error, mean_squared_error
import itertools
import warnings

warnings.filterwarnings("ignore")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')

def _load_sarimax():
    try:
        return import_module("statsmodels.tsa.statespace.sarimax").SARIMAX
    except ModuleNotFoundError as exc:
        raise RuntimeError("statsmodels is required for forecasting.") from exc

app = FastAPI(title="iMAPS Forecasting API")

origins = [
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "FastAPI is running with CORS enabled"}

class ForecastRequest(BaseModel):
    application_type: str = "Locational Clearance"
    steps: int = 6

@app.post("/api/forecast")
def generate_forecast(req: ForecastRequest):
    SARIMAX = _load_sarimax()
    
    try:
        # 1. Fetch Rainfall Data (Open-Meteo API) - Dynamic Date
        meteo_url = "https://archive-api.open-meteo.com/v1/archive"
        end_date_str = datetime.date.today().strftime('%Y-%m-%d')
        meteo_params = {
            "latitude": 13.8333,
            "longitude": 121.25,
            "start_date": "2021-01-01",
            "end_date": end_date_str,
            "daily": "precipitation_sum",
            "timezone": "Asia/Manila"
        }

        meteo_res = requests.get(meteo_url, params=meteo_params).json()
        
        if 'daily' not in meteo_res:
            # Open-Meteo Archive API typically has a 5-7 day lag.
            # Fallback to 7 days ago if today's data is not yet available.
            fallback_date = (datetime.date.today() - datetime.timedelta(days=7)).strftime('%Y-%m-%d')
            meteo_params['end_date'] = fallback_date
            meteo_res = requests.get(meteo_url, params=meteo_params).json()
            
            if 'daily' not in meteo_res:
                # Extreme fallback: 14 days ago
                fallback_date = (datetime.date.today() - datetime.timedelta(days=14)).strftime('%Y-%m-%d')
                meteo_params['end_date'] = fallback_date
                meteo_res = requests.get(meteo_url, params=meteo_params).json()

        if 'daily' not in meteo_res:
            raise ValueError(f"Open-Meteo API Error: {meteo_res}")

        rain_df = pd.DataFrame(meteo_res['daily'])
        rain_df['time'] = pd.to_datetime(rain_df['time']).dt.to_period('M')
        rain = rain_df.groupby('time')['precipitation_sum'].sum().reset_index(name='monthly_rainfall')

        # 2. Load CPI Data (Local Excel File)
        cpi_raw = pd.read_excel(
            os.path.join(DATA_DIR, 'cpi_data.xlsx'), 
            sheet_name='2M4ACP23'
        )
        cpi_data = cpi_raw.iloc[2:14, 2:9].copy()
        cpi_data.columns = ['Month', '2021', '2022', '2023', '2024', '2025', '2026']

        cpi_melted = cpi_data.melt(id_vars=['Month'], var_name='Year', value_name='CPI_YoY')
        cpi_melted['CPI_YoY'] = pd.to_numeric(cpi_melted['CPI_YoY'], errors='coerce')
        cpi_melted.dropna(subset=['CPI_YoY'], inplace=True)

        month_map = {'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6, 
                     'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12}
        cpi_melted['Month_Num'] = cpi_melted['Month'].map(month_map)
        cpi_melted['time'] = pd.to_datetime(cpi_melted['Year'].astype(str) + '-' + cpi_melted['Month_Num'].astype(str) + '-01').dt.to_period('M')
        cpi = cpi_melted[['time', 'CPI_YoY']]

        # 3. Load Locational Clearances
        apps = pd.read_csv(os.path.join(DATA_DIR, 'rosario_zoning_apps_2021_2026.csv'))
        
        # Merge recent applications from Database starting September 1, 2026
        env_path = os.path.join(BASE_DIR, '..', '.env')
        env_vars = {}
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    if '=' in line and not line.strip().startswith('#'):
                        key, val = line.strip().split('=', 1)
                        env_vars[key.strip()] = val.strip(' "\'')
        
        try:
            import psycopg2
            import warnings
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                conn = psycopg2.connect(
                    host=env_vars.get("DB_HOST", "127.0.0.1"),
                    port=env_vars.get("DB_PORT", "5432"),
                    database=env_vars.get("DB_DATABASE", "imaps_db"),
                    user=env_vars.get("DB_USERNAME", "postgres"),
                    password=env_vars.get("DB_PASSWORD", "postgres")
                )
                query = "SELECT created_at, application_type FROM zoning_applications WHERE created_at >= '2026-09-01 00:00:00'"
                db_df = pd.read_sql(query, conn)
                conn.close()
                
                if not db_df.empty:
                    db_df.rename(columns={'created_at': 'Encoding Date', 'application_type': 'Application Type'}, inplace=True)
                    apps = pd.concat([apps, db_df], ignore_index=True)
        except Exception as e:
            print(f"Failed to fetch from local DB: {e}")

        search_type = req.application_type.strip().lower()
        lc = apps[apps['Application Type'].fillna('').str.lower().str.contains(search_type)].copy()
        
        if lc.empty:
            raise HTTPException(status_code=404, detail=f"No data found for application type: {req.application_type}")
            
        lc['Encoding Date'] = pd.to_datetime(lc['Encoding Date'], utc=True)
        if lc['Encoding Date'].dt.tz is not None:
            lc['Encoding Date'] = lc['Encoding Date'].dt.tz_localize(None)

        # Do not incorporate new data if the current month is not finished yet
        current_month_start = pd.to_datetime(datetime.date.today().replace(day=1))
        lc = lc[lc['Encoding Date'] < current_month_start]

        if lc.empty:
            raise HTTPException(status_code=404, detail=f"No completed months data found for application type: {req.application_type}")

        lc['time'] = lc['Encoding Date'].dt.to_period('M')
        lc_counts = lc.groupby('time').size().reset_index(name='Locational_Clearances')

        # 4. Load Custom Municipal Flags
        monthly_features = pd.read_csv(os.path.join(DATA_DIR, 'rosario_monthly_forecasting_data.csv'))
        monthly_features['time'] = pd.to_datetime(monthly_features['Year_Month']).dt.to_period('M')

        # Merge all sources
        df = pd.merge(lc_counts, rain, on='time', how='inner')
        df = pd.merge(df, cpi, on='time', how='inner')
        df = pd.merge(df, monthly_features[['time', 'Election_Year_Flag', 'Rainy_Season_Flag']], on='time', how='inner')

        # Sort and limit to past 60 months for relevant training window
        df.sort_values('time', inplace=True)
        df = df.tail(60)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not prepare dataset: {str(e)}")

    df.set_index('time', inplace=True)
    df.index = df.index.to_timestamp()

    # Apply Log Transformation to the Target
    df['Locational_Clearances_Log'] = np.log1p(df['Locational_Clearances'])

    # Apply 3-Month Rolling Averages
    df['rain_roll3'] = df['monthly_rainfall'].rolling(window=3, closed='left').mean()
    df['cpi_roll3'] = df['CPI_YoY'].rolling(window=3, closed='left').mean()
    df.bfill(inplace=True)

    endog = df['Locational_Clearances_Log']
    exog = df[['rain_roll3', 'cpi_roll3', 'Election_Year_Flag', 'Rainy_Season_Flag']]

    # 5. Fast Dynamic Hyperparameter Search
    p_grid = q_grid = P_grid = Q_grid = [0, 1]
    best_aic = float("inf")
    best_order = (0, 0, 1)
    best_seasonal_order = (1, 0, 1, 12)

    for p_val, q_val in itertools.product(p_grid, q_grid):
        for P_val, Q_val in itertools.product(P_grid, Q_grid):
            try:
                temp_model = SARIMAX(endog,
                                     exog=exog,
                                     order=(p_val, 0, q_val),
                                     seasonal_order=(P_val, 0, Q_val, 12),
                                     enforce_stationarity=False,
                                     enforce_invertibility=False)
                temp_results = temp_model.fit(disp=False)
                if temp_results.aic < best_aic:
                    best_aic = temp_results.aic
                    best_order = (p_val, 0, q_val)
                    best_seasonal_order = (P_val, 0, Q_val, 12)
            except:
                continue

    # Train final model
    model = SARIMAX(endog, 
                    exog=exog, 
                    order=best_order, 
                    seasonal_order=best_seasonal_order,
                    enforce_stationarity=False,
                    enforce_invertibility=False)
    results = model.fit(disp=False)

    # 6. Generate Forecast
    future_months = [df.index[-1] + pd.DateOffset(months=i) for i in range(1, req.steps + 1)]
    future_exog = []

    # Better Exogenous Forecasting:
    # Use recent CPI as it's a random walk / macroeconomic indicator rather than seasonal
    last_cpi = df['cpi_roll3'].iloc[-1]

    for m in future_months:
        # Rainfall is seasonal, so historical monthly mean is best
        hist_rain_roll = df[df.index.month == m.month]['rain_roll3'].mean()
        
        rainy_flag = 1 if m.month in [6, 7, 8, 9, 10] else 0
        election_flag = 1 if (m.year in [2025, 2028] and m.month == 5) else 0
        
        future_exog.append([hist_rain_roll, last_cpi, election_flag, rainy_flag])

    future_exog_df = pd.DataFrame(future_exog, index=future_months, columns=['rain_roll3', 'cpi_roll3', 'Election_Year_Flag', 'Rainy_Season_Flag'])

    forecast_log = results.get_forecast(steps=req.steps, exog=future_exog_df).summary_frame(alpha=0.05)
    forecast_df = np.expm1(forecast_log).clip(lower=0) # Component: Bounds checking
    
    # 7. Evaluate Model
    predictions = np.expm1(results.predict()).clip(lower=0) # Component: Bounds checking
    actuals = df.loc[predictions.index, 'Locational_Clearances']
    
    mae = mean_absolute_error(actuals, predictions)
    mse = mean_squared_error(actuals, predictions)
    rmse = np.sqrt(mse)
    mape = np.mean(np.abs((actuals - predictions) / actuals.replace(0, np.nan).fillna(1e-6))) * 100
    naive_forecast_error = np.mean(np.abs(actuals.diff().dropna()))
    mase = mae / naive_forecast_error if naive_forecast_error != 0 else 0

    # 8. Extract Actionable Insights (New Component)
    insights = {}
    
    # 8a. Trend Analysis
    forecast_values = forecast_df['mean'].values
    if len(forecast_values) > 1:
        x = np.arange(len(forecast_values))
        trend_slope = np.polyfit(x, forecast_values, 1)[0]
        if trend_slope > 0.5:
            insights['trend'] = "Increasing"
        elif trend_slope < -0.5:
            insights['trend'] = "Decreasing"
        else:
            insights['trend'] = "Stable"
    else:
        insights['trend'] = "Stable"

    # 8b. Key Drivers (Feature Importance)
    # Map raw exogenous names to human-readable labels
    feature_labels = {
        'rain_roll3': "Rainfall",
        'cpi_roll3': "Inflation Rate (CPI)",
        'Election_Year_Flag': "Election Year",
        'Rainy_Season_Flag': "Rainy Season"
    }
    drivers = []
    params = results.params
    for col in exog.columns:
        if col in params:
            coef = float(params[col])
            if abs(coef) > 0.001: # Filter out near-zero drivers
                impact = "Positive" if coef > 0 else "Negative"
                drivers.append({"feature": feature_labels.get(col, col), "impact_direction": impact, "coefficient": round(coef, 4)})
    insights['key_drivers'] = sorted(drivers, key=lambda x: abs(x['coefficient']), reverse=True)

    # 9. Construct JSON Response
    history_out = [
        {
            "metric_date": dt.strftime('%Y-%m-%d'),
            "target_value": float(row["Locational_Clearances"]),
            "rainfall_mm": float(row["monthly_rainfall"]),
            "inflation_rate": float(row["CPI_YoY"])
        }
        for dt, row in df.iterrows()
    ]

    return {
        "historical_data": history_out,
        "forecasts": [
            {
                "forecast_date": dt.strftime('%Y-%m-01'),
                "mean_value": round(float(row['mean']), 2),
                "lower_ci": round(float(row['mean_ci_lower']), 2),
                "upper_ci": round(float(row['mean_ci_upper']), 2)
            }
            for dt, row in forecast_df.iterrows()
        ],
        "metrics": {
            "mae": round(float(mae), 2),
            "mse": round(float(mse), 2),
            "rmse": round(float(rmse), 2),
            "mape": round(float(mape), 2),
            "mase": round(float(mase), 2)
        },
        "insights": insights
    }