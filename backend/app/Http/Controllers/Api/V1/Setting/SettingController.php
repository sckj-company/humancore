<?php

namespace App\Http\Controllers\Api\V1\Setting;

use App\Http\Controllers\Api\V1\BaseController;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class SettingController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Setting::class);

        $group = $request->string('group')->toString();

        $settings = Setting::query()
            ->when($group, fn ($q) => $q->where('group', $group))
            ->orderBy('group')
            ->orderBy('key')
            ->get()
            ->groupBy('group');

        return $this->success($settings);
    }

    public function update(Request $request): JsonResponse
    {
        $this->authorize('update', Setting::class);

        $validated = Validator::make($request->all(), [
            'group' => ['required', 'string'],
            'key' => ['required', 'string'],
            'value' => ['required'],
        ])->validate();

        $setting = Setting::updateOrCreate(
            ['tenant_id' => tenant_id(), 'group' => $validated['group'], 'key' => $validated['key']],
            ['value' => $validated['value']],
        );

        return $this->success($setting, 'Configuração atualizada com sucesso.');
    }
}
