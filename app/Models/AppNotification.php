<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AppNotification extends Model
{
    use HasFactory;

    protected $table = 'notifications';

    protected $fillable = [
        'user_id',
        'title',
        'message',
        'type',
        'action_url',
        'is_read',
        'read_at',
    ];

    protected $casts = [
        'is_read' => 'boolean',
        'read_at' => 'datetime',
    ];

    /**
     * Relationship to target user. Null means broadcast to all users.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Scope for a specific user (includes targeted + broadcast notifications).
     */
    public function scopeForUser($query, $userId)
    {
        return $query->where(function ($q) use ($userId) {
            $q->where('user_id', $userId)
              ->orWhereNull('user_id');
        });
    }

    /**
     * Scope for unread notifications.
     */
    public function scopeUnread($query)
    {
        return $query->where('is_read', false);
    }

    /**
     * Create notification for a specific user.
     */
    public static function notifyUser($userOrId, string $title, string $message, string $type = 'system_alert', ?string $actionUrl = null): self
    {
        $userId = $userOrId instanceof User ? $userOrId->id : $userOrId;

        return self::create([
            'user_id'    => $userId,
            'title'      => $title,
            'message'    => $message,
            'type'       => $type,
            'action_url' => $actionUrl,
            'is_read'    => false,
        ]);
    }

    /**
     * Create notification for users matching specific role(s).
     */
    public static function notifyRoles(array|string $roles, string $title, string $message, string $type = 'system_alert', ?string $actionUrl = null): void
    {
        $roleList = (array) $roles;
        $users = User::whereIn('role', $roleList)->pluck('id');

        foreach ($users as $userId) {
            self::notifyUser($userId, $title, $message, $type, $actionUrl);
        }
    }

    /**
     * Create a global broadcast notification for all users.
     */
    public static function notifyAll(string $title, string $message, string $type = 'system_alert', ?string $actionUrl = null): self
    {
        return self::create([
            'user_id'    => null,
            'title'      => $title,
            'message'    => $message,
            'type'       => $type,
            'action_url' => $actionUrl,
            'is_read'    => false,
        ]);
    }
}
