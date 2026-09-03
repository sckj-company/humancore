<?php

namespace App\Http\Controllers\Api\V1\Notification;

use App\Http\Controllers\Api\V1\BaseController;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Notifications\DatabaseNotification;

class NotificationController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $notifications = auth()->user()
            ->notifications()
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 20))
            ->through(fn (DatabaseNotification $n) => [
                'id' => $n->id,
                'data' => $n->data,
                'read_at' => $n->read_at?->toIso8601String(),
                'created_at' => $n->created_at?->toIso8601String(),
            ]);

        return $this->paginated($notifications, 'Notificações obtidas com sucesso.');
    }

    public function unreadCount(): JsonResponse
    {
        $count = auth()->user()->unreadNotifications()->count();

        return $this->success(['unread' => $count]);
    }

    public function markRead(DatabaseNotification $notification): JsonResponse
    {
        if ($notification->notifiable_id !== auth()->id()) {
            return $this->error('Notificação não encontrada.', 403);
        }

        $notification->markAsRead();

        return $this->success(['id' => $notification->id, 'read_at' => $notification->read_at]);
    }

    public function markAllRead(): JsonResponse
    {
        auth()->user()->unreadNotifications()->update(['read_at' => now()]);

        return $this->success(['unread' => 0], 'Todas as notificações marcadas como lidas.');
    }
}
