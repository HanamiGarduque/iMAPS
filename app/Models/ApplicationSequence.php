<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ApplicationSequence extends Model
{
    protected $table = 'application_sequences';
    public $timestamps = false;

    protected $fillable = [
        'type_code',
        'year',
        'last_seq',
    ];
}