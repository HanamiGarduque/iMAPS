<?php

namespace App\Http\Controllers;

use App\Models\AppNotification;
use Illuminate\Http\Request;
use Inertia\Inertia;

class NotificationController extends Controller
{
    /**
     * History page categories => notification types they cover.
     */
    private const CATEGORIES = [
        'applications' => ['application_created', 'status_updated'],
        'inspections'  => ['inspection_assigned', 'inspection_completed'],
        'permits'      => ['permit_generated'],
        'users'        => ['user_registered'],
        'analytics'    => ['forecast_generated'],
        'support'      => ['application_support'],
    ];

    /**
     * Display the notification history page.
     */
    public function index(Request $request)
    {
        $user = auth()->user();
        $category = $request->input('category');
        if (!is_string($category) || !array_key_exists($category, self::CATEGORIES)) {
            $category = 'all';
        }
        $search = $request->input('search');
        $search = is_string($search) ? mb_substr(trim($search), 0, 100) : null;

        $query = AppNotification::query()
            ->forUser($user->id);

        if ($category !== 'all') {
            $query->whereIn('type', self::CATEGORIES[$category]);
        }

        if ($search) {
            $term = '%' . strtolower($search) . '%';
            $query->where(function ($q) use ($term) {
                $q->whereRaw('LOWER(title) LIKE ?', [$term])
                  ->orWhereRaw('LOWER(message) LIKE ?', [$term]);
            });
        }

        $notifications = $query
            ->orderByDesc('created_at')
            ->paginate(15)
            ->withQueryString();

        $typeCounts = AppNotification::forUser($user->id)
            ->selectRaw('type, COUNT(*) as aggregate')
            ->groupBy('type')
            ->pluck('aggregate', 'type');

        $categoryCounts = ['all' => (int) $typeCounts->sum()];
        foreach (self::CATEGORIES as $key => $types) {
            $categoryCounts[$key] = (int) $typeCounts->only($types)->sum();
        }

        return Inertia::render('Notifications/Index', [
            'notifications'  => $notifications,
            'filters'        => [
                'category' => $category,
                'search'   => $search,
            ],
            'categoryCounts' => $categoryCounts,
            'unreadCount'    => AppNotification::forUser($user->id)->unread()->count(),
        ]);
    }

    /**
     * API endpoint for header bell component.
     */
    public function getUnread(Request $request)
    {
        $userId = auth()->id();

        if (!$userId) {
            return response()->json(['unread_count' => 0, 'recent' => []]);
        }

        $unreadCount = AppNotification::forUser($userId)->unread()->count();

        // The bell is an inbox: unread only. History lives on /notifications.
        $recent = AppNotification::forUser($userId)
            ->unread()
            ->orderByDesc('created_at')
            ->limit(8)
            ->get();

        return response()->json([
            'unread_count' => $unreadCount,
            'recent'       => $recent,
        ]);
    }

    /**
     * Mark a single notification as read.
     */
    public function markAsRead(Request $request, $id)
    {
        $userId = auth()->id();

        $notification = AppNotification::forUser($userId)->where('id', $id)->firstOrFail();

        $notification->update([
            'is_read' => true,
            'read_at' => now(),
        ]);

        if ($request->wantsJson()) {
            return response()->json(['success' => true]);
        }

        return redirect()->back()->with('success', 'Notification marked as read.');
    }

    /**
     * Mark all notifications for the current user as read.
     */
    public function markAllAsRead(Request $request)
    {
        $userId = auth()->id();

        AppNotification::forUser($userId)
            ->unread()
            ->update([
                'is_read' => true,
                'read_at' => now(),
            ]);

        if ($request->wantsJson()) {
            return response()->json(['success' => true]);
        }

        return redirect()->back()->with('success', 'All notifications marked as read.');
    }

    /**
     * Delete a single notification.
     */
    public function destroy(Request $request, $id)
    {
        $userId = auth()->id();

        $notification = AppNotification::forUser($userId)->where('id', $id)->firstOrFail();
        $notification->delete();

        if ($request->wantsJson()) {
            return response()->json(['success' => true]);
        }

        return redirect()->back()->with('success', 'Notification deleted.');
    }

    /**
     * Delete only the current user's read notifications; unread ones are kept.
     */
    public function clearRead(Request $request)
    {
        AppNotification::forUser(auth()->id())
            ->where('is_read', true)
            ->delete();

        if ($request->wantsJson()) {
            return response()->json(['success' => true]);
        }

        return redirect()->back()->with('success', 'Read notifications cleared.');
    }

    /**
     * Clear all notifications for the current user.
     */
    public function clearAll(Request $request)
    {
        $userId = auth()->id();

        AppNotification::forUser($userId)->delete();

        if ($request->wantsJson()) {
            return response()->json(['success' => true]);
        }

        return redirect()->back()->with('success', 'All notifications cleared.');
    }
}
