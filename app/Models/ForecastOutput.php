<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ForecastOutput extends Model
{
    protected $fillable = [
        'forecast_run_id',
        'forecast_date',
        'mean_value',
        'lower_ci',
        'upper_ci',
    ];

    public function run()
    {
        return $this->belongsTo(ForecastRun::class, 'forecast_run_id');
    }
}
