from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import numpy as np
import os
from importlib import import_module

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')

def _load_sarimax():
    """Load SARIMAX only when a forecast is requested."""
    try:
        return import_module("statsmodels.tsa.statespace.sarimax").SARIMAX
    except ModuleNotFoundError as exc:
        if exc.name and exc.name.startswith("statsmodels"):
            raise RuntimeError(
                "statsmodels is required for forecasting. Install it with "
                "'pip install statsmodels'."
            ) from exc
        raise

app = FastAPI()

# Specify the exact origins permitted to make requests
origins = [
    "http://127.0.0.1:8000",   # Laravel artisan serve
    "http://localhost:8000",   # Laravel localhost alias
    "http://127.0.0.1:5173",   # Vite dev server
    "http://localhost:5173",   # Vite localhost alias
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,       # Allowed origins list
    allow_credentials=True,      # Allow cookies / auth headers
    allow_methods=["*"],         # Allow all HTTP methods (GET, POST, OPTIONS, etc.)
    allow_headers=["*"],         # Allow all custom/standard headers
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
        # 1. Load and Preprocess Rainfall Data
        rain = pd.read_csv(os.path.join(DATA_DIR, 'rosario_monthly_rainfall.csv'))
        rain['time'] = pd.to_datetime(rain['time']).dt.to_period('M')

        # 2. Load and Preprocess CPI (Inflation) Data
        cpi_raw = pd.read_excel(
            os.path.join(DATA_DIR, 'Year-on-Year Changes of the Consumer Price Index in Percent by Commodity Group (2018=100): January 2019 - August 2026.xlsx'), 
            sheet_name='2M4ACP23'
        )
        cpi_data = cpi_raw.iloc[2:14, 2:9].copy()
        cpi_data.columns = ['Month', '2021', '2022', '2023', '2024', '2025', '2026']

        # Melt into a time-series format
        cpi_melted = cpi_data.melt(id_vars=['Month'], var_name='Year', value_name='CPI_YoY')
        cpi_melted['CPI_YoY'] = pd.to_numeric(cpi_melted['CPI_YoY'], errors='coerce')
        cpi_melted.dropna(subset=['CPI_YoY'], inplace=True)

        month_map = {'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6, 
                     'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12}
        cpi_melted['Month_Num'] = cpi_melted['Month'].map(month_map)
        cpi_melted['time'] = pd.to_datetime(cpi_melted['Year'].astype(str) + '-' + cpi_melted['Month_Num'].astype(str) + '-01').dt.to_period('M')
        cpi = cpi_melted[['time', 'CPI_YoY']]

        # 3. Load and Preprocess Locational Clearances
        apps = pd.read_csv(os.path.join(DATA_DIR, 'rosario_zoning_apps_2021_2026.csv'))
    except Exception as e:
        return {"error": f"Could not read dataset: {str(e)}"}
        
    lc = apps[apps['Application Type'].str.strip().str.lower() == req.application_type.strip().lower()].copy()
    
    if lc.empty:
        return {"error": f"No data found for application type: {req.application_type}"}
        
    lc['Encoding Date'] = pd.to_datetime(lc['Encoding Date'])
    lc['time'] = lc['Encoding Date'].dt.to_period('M')

    lc_counts = lc.groupby('time').size().reset_index(name='Locational_Clearances')

    # 4. Merge Data & Prepare for Modeling
    df = pd.merge(lc_counts, rain, on='time', how='inner')
    df = pd.merge(df, cpi, on='time', how='inner')

    # Convert PeriodIndex to DatetimeIndex for statsmodels
    df.set_index('time', inplace=True)
    df.index = df.index.to_timestamp()

    endog = df['Locational_Clearances']
    exog = df[['monthly_rainfall', 'CPI_YoY']]

    # 5. Train SARIMAX Model
    model = SARIMAX(endog, exog=exog, order=(1, 1, 1), seasonal_order=(1, 1, 0, 12))
    results = model.fit(disp=False)

    # 6. Generate Forecast
    future_months = [df.index[-1] + pd.DateOffset(months=i) for i in range(1, req.steps + 1)]
    future_exog = []

    for m in future_months:
        hist_rain = df[df.index.month == m.month]['monthly_rainfall'].mean()
        hist_cpi = df[df.index.month == m.month]['CPI_YoY'].mean()
        future_exog.append([hist_rain, hist_cpi])

    future_exog_df = pd.DataFrame(future_exog, index=future_months, columns=['monthly_rainfall', 'CPI_YoY'])

    forecast = results.get_forecast(steps=req.steps, exog=future_exog_df)
    summary = forecast.summary_frame(alpha=0.05)
    
    predictions = results.predict()
    actuals = endog.loc[predictions.index]
    
    # Calculate evaluation metrics manually to avoid sklearn dependency
    mae = np.mean(np.abs(actuals - predictions))
    mse = np.mean((actuals - predictions)**2)
    rmse = np.sqrt(mse)
    mape = np.mean(np.abs((actuals - predictions) / actuals.replace(0, np.nan).fillna(1e-6))) * 100
    naive_forecast_error = np.mean(np.abs(actuals.diff().dropna()))
    mase = mae / naive_forecast_error if naive_forecast_error != 0 else 0

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
            for dt, row in summary.iterrows()
        ],
        "metrics": {
            "mae": round(float(mae), 2),
            "mse": round(float(mse), 2),
            "rmse": round(float(rmse), 2),
            "mape": round(float(mape), 2),
            "mase": round(float(mase), 2)
        }
    }
