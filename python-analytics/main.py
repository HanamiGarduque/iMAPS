# main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
from importlib import import_module


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
    history: list[dict]  # [{metric_date, target_value, rainfall_mm, inflation_rate}]
    steps: int = 6

@app.post("/api/forecast")
def generate_forecast(req: ForecastRequest):
    SARIMAX = _load_sarimax()
    df = pd.DataFrame(req.history)
    df['metric_date'] = pd.to_datetime(df['metric_date'])
    df = df.sort_values('metric_date').set_index('metric_date')

    # 1. Generate future exogenous matrix (Hybrid Strategy)
    latest_inflation = df['inflation_rate'].iloc[-1]
    df['month_num'] = df.index.month
    monthly_rain_means = df.groupby('month_num')['rainfall_mm'].mean()

    last_date = df.index[-1]
    future_dates = [last_date + pd.DateOffset(months=i) for i in range(1, req.steps + 1)]
    
    future_exog = []
    for dt in future_dates:
        future_exog.append({
            'rainfall_mm': monthly_rain_means.get(dt.month, df['rainfall_mm'].mean()),
            'inflation_rate': latest_inflation
        })
    future_exog_df = pd.DataFrame(future_exog, index=future_dates)

    # 2. Fit SARIMAX Model
    model = SARIMAX(
        endog=df['target_value'],
        exog=df[['rainfall_mm', 'inflation_rate']],
        order=(1, 1, 1),
        seasonal_order=(1, 1, 1, 12),
        enforce_stationarity=False
    ).fit(disp=False)

    # 3. Forecast and extract confidence bounds
    forecast = model.get_forecast(steps=req.steps, exog=future_exog_df)
    summary = forecast.summary_frame(alpha=0.05)

    return {
        "forecasts": [
            {
                "forecast_date": dt.strftime('%Y-%m-01'),
                "mean_value": round(float(row['mean']), 2),
                "lower_ci": round(float(row['mean_ci_lower']), 2),
                "upper_ci": round(float(row['mean_ci_upper']), 2)
            }
            for dt, row in summary.iterrows()
        ]
    }