<?php

namespace App\Http\Controllers;

use App\Models\AppNotification;
use Illuminate\Http\Request;
use Inertia\Inertia;

class NotificationController extends Controller
{
    /**
     * Display the notifications page.
     */
    public function index(Request $request)
    {
        $user = auth()->user();
        $filter = $request->input('filter', 'all'); // 'all' or 'unread'
        $search = $request->input('search');

        $query = AppNotification::query()
            ->forUser($user->id);

        if ($filter === 'unread') {
            $query->unread();
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

        $unreadCount = AppNotification::forUser($user->id)->unread()->count();
        $totalCount = AppNotification::forUser($user->id)->count();

        return Inertia::render('Notifications/Index', [
            'notifications' => $notifications,
            'filters'       => [
                'filter' => $filter,
                'search' => $search,
            ],
            'unreadCount'   => $unreadCount,
            'totalCount'    => $totalCount,
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

        $recent = AppNotification::forUser($userId)
            ->orderByDesc('created_at')
            ->limit(5)
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
