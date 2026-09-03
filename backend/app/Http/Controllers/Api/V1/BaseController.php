<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;

abstract class BaseController extends Controller
{
    use AuthorizesRequests;

    protected function success(mixed $data = null, string $message = 'Operação realizada com sucesso', int $status = 200): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $data,
            'message' => $message,
        ], $status);
    }

    protected function paginated(mixed $data, string $message = 'Operação realizada com sucesso'): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => [
                'data' => $data->items(),
                'meta' => [
                    'current_page' => $data->currentPage(),
                    'last_page' => $data->lastPage(),
                    'per_page' => $data->perPage(),
                    'total' => $data->total(),
                ],
            ],
            'message' => $message,
        ]);
    }

    protected function error(string $message = 'Ocorreu um erro', int $status = 400, ?array $errors = null): JsonResponse
    {
        return response()->json([
            'success' => false,
            'data' => null,
            'message' => $message,
            'errors' => $errors,
        ], $status);
    }
}
