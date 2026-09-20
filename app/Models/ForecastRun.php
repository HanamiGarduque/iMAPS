<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ForecastRun extends Model
{
    protected $fillable = [
        'application_type',
        'forecast_periods',
        'model_metrics',
        'historical_data',
        'triggered_by',
        'executed_at',
        'status',
    ];

    protected $casts = [
        'executed_at' => 'datetime',
        'model_metrics' => 'array',
        'historical_data' => 'array',
    ];

    public function outputs()
    {
        return $this->hasMany(ForecastOutput::class);
    }
}
