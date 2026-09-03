<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Requests\V1\Auth\LoginRequest;
use App\Http\Resources\V1\AuthResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

class AuthController extends BaseController
{
    public function login(LoginRequest $request): JsonResponse
    {
        $credentials = $request->only('email', 'password');

        if (! auth()->attempt($credentials)) {
            throw ValidationException::withMessages([
                'email' => ['As credenciais fornecidas estão incorretas.'],
            ]);
        }

        /** @var User $user */
        $user = auth()->user();

        if (! $user->is_active) {
            auth()->logout();

            throw ValidationException::withMessages([
                'email' => ['A sua conta foi desativada. Contacte o administrador.'],
            ]);
        }

        $user->forceFill([
            'last_login_at' => now(),
            'last_login_ip' => $request->ip(),
        ])->save();

        RateLimiter::clear('login:'.$request->ip());

        $token = $user->createToken('api-token', ['*'])->plainTextToken;

        return $this->success([
            'access_token' => $token,
            'token_type' => 'Bearer',
            'user' => new AuthResource($user->loadMissing('roles', 'employee')),
        ], 'Login realizado com sucesso.');
    }

    public function me(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return $this->success(new AuthResource($user->loadMissing('roles', 'employee')));
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return $this->success(null, 'Logout realizado com sucesso.');
    }
}
