<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ApplicationStatusTrack extends Model
{
    protected $fillable = [
        'reference_number',
        'masked_applicant_name',
        'status',
        'created_at',
    ];

    public $timestamps = false;
}