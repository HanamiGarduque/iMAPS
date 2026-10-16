<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ForecastOutput extends Model
{
    protected $fillable = [
        'forecast_run_id',
        'barangay',
        'year',
        'quarter',
        'forecast_date',
        'mean_value',
        'lower_80',
        'upper_80',
    ];

    public function run()
    {
        return $this->belongsTo(ForecastRun::class, 'forecast_run_id');
    }
}
