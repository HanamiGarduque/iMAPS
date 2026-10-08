<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ApplicationStatusTrack extends Model
{
    protected $fillable = [
        'reference_number',
        'form_number',
        'contact_number',
        'masked_applicant_name',
        'application_type',
        'business_name',
        'status',
        'stage_order',
        'note',
        'scheduled_date',
        'created_at',
    ];

    public $timestamps = false;
}