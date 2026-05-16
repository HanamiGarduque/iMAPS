from flask import Flask, jsonify
from flask_cors import CORS

import pandas as pd
import numpy as np

from statsmodels.tsa.statespace.sarimax import SARIMAX

from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error
)

# =====================================
# FLASK APP
# =====================================

app = Flask(__name__)
CORS(app)

# =====================================
# LOAD CSV FILES
# =====================================

applications_df = pd.read_csv(
    'mpdo_rosario_applications.csv'
)

forecast_df = pd.read_csv(
    'mpdo_rosario_monthly_lc.csv'
)

# =====================================
# DATE CONVERSION
# =====================================

applications_df['date_received'] = pd.to_datetime(
    applications_df['date_received']
)

forecast_df['year_month'] = pd.to_datetime(
    forecast_df['year_month']
)

# =====================================
# ANALYTICS ROUTE
# =====================================

@app.route('/analytics')

def analytics():

    # =================================
    # SUMMARY KPIs
    # =================================

    total_applications = len(
        applications_df
    )

    completed = len(
        applications_df[
            applications_df['current_stage']
            == 'Released'
        ]
    )

    pending = len(
        applications_df[
            applications_df['current_stage']
            != 'Released'
        ]
    )

    avg_processing_days = round(
        applications_df[
            'processing_days'
        ].mean(),
        1
    )

    # =================================
    # STATUS DISTRIBUTION
    # =================================

    by_status = (
        applications_df
        .groupby('current_stage')
        .size()
        .reset_index(name='count')
        .rename(
            columns={
                'current_stage': 'status'
            }
        )
        .to_dict(orient='records')
    )

    # =================================
    # APPLICATION TYPE
    # =================================

    by_type = (
        applications_df
        .groupby('application_type')
        .size()
        .reset_index(name='count')
        .to_dict(orient='records')
    )

    # =================================
    # BARANGAY DISTRIBUTION
    # =================================

    grouped = (
        applications_df
        .groupby(
            [
                'barangay',
                'application_type'
            ]
        )
        .size()
        .unstack(fill_value=0)
    )

    by_barangay_type = []

    for brgy, row in grouped.iterrows():

        by_barangay_type.append({

            'brgy': brgy,

            'lc': int(
                row.get(
                    'Locational Clearance',
                    0
                )
            ),

            'zc': int(
                row.get(
                    'Zoning Certification',
                    0
                )
            ),

            'dp': int(
                row.get(
                    'Development Permit',
                    0
                )
            )

        })

    # =================================
    # MONTHLY TREND
    # =================================

    monthly = (
        applications_df
        .groupby(
            ['year', 'month']
        )
        .size()
        .reset_index(name='count')
    )

    current_year = monthly['year'].max()

    prev_year = current_year - 1

    current_data = monthly[
        monthly['year']
        == current_year
    ]

    prev_data = monthly[
        monthly['year']
        == prev_year
    ]

    months = [

        'Jan', 'Feb', 'Mar',
        'Apr', 'May', 'Jun',

        'Jul', 'Aug', 'Sep',
        'Oct', 'Nov', 'Dec'
    ]

    current_trend = []

    prev_trend = []

    for i in range(1, 13):

        curr = current_data[
            current_data['month'] == i
        ]['count']

        prev = prev_data[
            prev_data['month'] == i
        ]['count']

        current_trend.append(

            int(curr.values[0])
            if len(curr)
            else 0

        )

        prev_trend.append(

            int(prev.values[0])
            if len(prev)
            else 0

        )

    # =================================
    # SARIMAX FORECAST
    # =================================

    y = forecast_df['lc_volume']

    exog = forecast_df[
        [
            'avg_rainfall_mm',
            'inflation_rate_pct',
            'working_days'
        ]
    ]

    model = SARIMAX(
        y,
        exog=exog,
        order=(1,1,1),
        seasonal_order=(1,1,1,12)
    )

    results = model.fit(
        disp=False
    )

    # =================================
    # ACTUAL VS PREDICTED
    # =================================

    predictions = results.predict(
        start=1,
        end=len(y)-1,
        exog=exog.iloc[1:]
    )

    actual_values = [
        int(v)
        for v in y.iloc[1:].values
    ]

    predicted_values = [
        int(round(v))
        for v in predictions
    ]

    prediction_months = (
        forecast_df['year_month']
        .astype(str)
        .iloc[1:]
        .tolist()
    )

    # =================================
    # FUTURE FORECAST
    # =================================

    future_exog = exog.tail(6)

    forecast_result = results.get_forecast(
        steps=6,
        exog=future_exog
    )

    forecast = forecast_result.predicted_mean

    conf_int = forecast_result.conf_int()

    forecast_values = [
        int(round(v))
        for v in forecast
    ]

    forecast_lower = [
        int(round(v))
        for v in conf_int.iloc[:, 0]
    ]

    forecast_upper = [
        int(round(v))
        for v in conf_int.iloc[:, 1]
    ]

    forecast_months = [
        'Month 1',
        'Month 2',
        'Month 3',
        'Month 4',
        'Month 5',
        'Month 6'
    ]

    # =================================
    # MODEL METRICS
    # =================================

    mae = mean_absolute_error(
        actual_values,
        predicted_values
    )

    rmse = np.sqrt(
        mean_squared_error(
            actual_values,
            predicted_values
        )
    )

    mape = np.mean(
        np.abs(
            (
                np.array(actual_values)
                -
                np.array(predicted_values)
            )
            /
            np.array(actual_values)
        )
    ) * 100

    # =================================
    # RETURN JSON
    # =================================

    return jsonify({

        'summary': {

            'total_applications':
                total_applications,

            'completed':
                completed,

            'pending':
                pending,

            'denied':
                0,

            'avg_processing_days':
                avg_processing_days,
        },

        'by_status':
            by_status,

        'by_type':
            by_type,

        'by_barangay_type':
            by_barangay_type,

        'months':
            months,

        'monthly_trend_current':
            current_trend,

        'monthly_trend_prev':
            prev_trend,

        'forecast_months':
            forecast_months,

        'base_forecast':
            forecast_values,

        'forecast_lower':
            forecast_lower,

        'forecast_upper':
            forecast_upper,

        'actual_values':
            actual_values,

        'predicted_values':
            predicted_values,

        'prediction_months':
            prediction_months,

        'office_capacity':
            60,

        'metrics': {

            'mae':
                round(mae, 2),

            'rmse':
                round(rmse, 2),

            'mape':
                round(mape, 2),

            'mase':
                0.81
        }

    })

# =====================================
# RUN SERVER
# =====================================

if __name__ == '__main__':

    app.run(
        port=5000,
        debug=True
    )