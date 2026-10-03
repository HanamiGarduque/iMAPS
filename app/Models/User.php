<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;  
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable  
{
    use HasFactory, Notifiable;

    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'last_login',
        'handshake_key', // Added to allow mass assignment
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password'          => 'hashed',
        ];
    }
    
    public function getAuthPassword(): string
    {
        return $this->password;
    }

    /**
     * Site Inspectors who can actually be given field work RIGHT NOW.
     *
     * Three conditions, all required:
     *   - correct role, so nobody is handed work outside their responsibility;
     *   - an active account, because a suspended employee cannot log in and the
     *     work would simply be stranded;
     *   - a FieldSync handshake key, because that key is what resolves a
     *     Supabase profile to deliver the job to. Without it there is nowhere to
     *     send the task.
     *
     * This scope is the single definition used by every inspector picker and
     * every inspector validation rule, so a suspended inspector can never be
     * offered in one place and accepted in another.
     */
    public function scopeActiveSiteInspectors($query)
    {
        return $query->where('role', 'Site Inspector')
            ->where('is_active', true)
            ->whereNotNull('handshake_key');
    }

    /**
     * Planning Officers who can actually be given an application RIGHT NOW.
     *
     * A suspended Planning Officer is excluded for the same reason a suspended
     * inspector is: ownership would be recorded against somebody who cannot
     * act on it, which is worse than leaving it unassigned.
     */
    public function scopeActivePlanningOfficers($query)
    {
        return $query->where('role', 'Planning Officer')
            ->where('is_active', true);
    }

    /**
     * Express {@see scopeActiveSiteInspectors()} as a validation rule, so the
     * "exists" check a form performs is the identical condition the picker used
     * to build its options. The two can therefore never disagree.
     */
    public static function activeSiteInspectorRule(): \Illuminate\Validation\Rules\Exists
    {
        return \Illuminate\Validation\Rule::exists('users', 'id')
            ->where(fn ($query) => $query
                ->where('role', 'Site Inspector')
                ->where('is_active', true)
                ->whereNotNull('handshake_key'));
    }

    /**
     * The Planning Officer equivalent of {@see activeSiteInspectorRule()}.
     */
    public static function activePlanningOfficerRule(): \Illuminate\Validation\Rules\Exists
    {
        return \Illuminate\Validation\Rule::exists('users', 'id')
            ->where(fn ($query) => $query
                ->where('role', 'Planning Officer')
                ->where('is_active', true));
    }
}