<?php

namespace App\Http\Controllers\Api\V1\Audit;

use App\Http\Controllers\Api\V1\BaseController;
use App\Models\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Audit::class);

        $audits = Audit::query()
            ->with('user:id,name,email')
            ->when($request->string('event')->toString(), fn ($q, $e) => $q->where('event', $e))
            ->when($request->string('user_id')->toString(), fn ($q, $u) => $q->where('user_id', $u))
            ->when($request->string('auditable_type')->toString(), fn ($q, $t) => $q->where('auditable_type', 'like', "%{$t}%"))
            ->when($request->string('start_date')->toString(), fn ($q, $d) => $q->where('created_at', '>=', $d))
            ->when($request->string('end_date')->toString(), fn ($q, $d) => $q->where('created_at', '<=', $d))
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 30))
            ->withQueryString();

        $audits->getCollection()->transform(function (Audit $a) {
            return [
                'id' => $a->id,
                'user' => $a->user ? [
                    'id' => $a->user->id,
                    'name' => $a->user->name,
                    'email' => $a->user->email,
                ] : null,
                'event' => $a->event,
                'auditable_type' => class_basename($a->auditable_type),
                'auditable_id' => $a->auditable_id,
                'old_values' => $a->old_values,
                'new_values' => $a->new_values,
                'ip_address' => $a->ip_address,
                'user_agent' => $a->user_agent,
                'created_at' => $a->created_at?->toDateTimeString(),
            ];
        });

        return $this->paginated($audits);
    }

    public function show(Audit $audit): JsonResponse
    {
        $this->authorize('view', $audit);

        $audit->load('user');

        return $this->success([
            'id' => $audit->id,
            'user' => $audit->user,
            'event' => $audit->event,
            'auditable_type' => $audit->auditable_type,
            'auditable_id' => $audit->auditable_id,
            'old_values' => $audit->old_values,
            'new_values' => $audit->new_values,
            'ip_address' => $audit->ip_address,
            'user_agent' => $audit->user_agent,
            'created_at' => $audit->created_at?->toDateTimeString(),
        ]);
    }
}
