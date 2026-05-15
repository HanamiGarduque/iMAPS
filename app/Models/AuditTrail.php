<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo; 
use Illuminate\Database\Eloquent\Builder;               
use Illuminate\Support\Collection;                     
use Illuminate\Support\Facades\DB;        
              
class AuditTrail extends Model
{
    protected $table = 'audit_trail';

    public function application(): BelongsTo
    {
        return $this->belongsTo(ZoningApplication::class, 'application_id');
    }

    public function performer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'performed_by');
    }

    public function scopeWithRelations(Builder $query): Builder
    {
        return $query
            ->leftJoin('zoning_applications as za', 'za.id', '=', 'audit_trail.application_id')
            ->leftJoin('users as u', 'u.id', '=', 'audit_trail.performed_by')
            ->select('audit_trail.id', 'audit_trail.action', 'audit_trail.note',
                     'audit_trail.performed_at', 'za.reference_number',
                     'za.applicant_name', 'za.id as application_id',
                     'u.name as performed_by_name');
    }

    public function scopeSearch(Builder $query, string $search): Builder
    {
        return $query->where(fn($q) => $q
            ->whereILike('za.reference_number', "%{$search}%")
            ->orWhereILike('za.applicant_name', "%{$search}%")
            ->orWhereILike('u.name', "%{$search}%")
        );
    }

    public function scopeOfAction(Builder $query, string $action): Builder
    {
        return $query->where('audit_trail.action', $action);
    }

    public static function distinctActions(): Collection
    {
        return static::distinct()->orderBy('action')->pluck('action');
    }

    public static function topStats(int $limit = 3): Collection
    {
        return static::select('action', DB::raw('COUNT(*) as cnt'))
            ->groupBy('action')
            ->orderByDesc('cnt')
            ->limit($limit)
            ->get();
    }
}
