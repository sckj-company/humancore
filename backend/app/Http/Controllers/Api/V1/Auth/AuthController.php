<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Requests\V1\Auth\LoginRequest;
use App\Http\Resources\V1\AuthResource;
use App\Models\User;
use App\Services\Audit\AuditService;
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

        AuditService::record('login', $user, ['login_at' => now()->toDateTimeString()]);

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
        $user = $request->user();

        AuditService::record('logout', $user, ['logout_at' => now()->toDateTimeString()]);

        $user->currentAccessToken()->delete();

        return $this->success(null, 'Logout realizado com sucesso.');
    }

    public function updateProfile(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => ['sometimes', 'email', 'max:255', 'unique:users,email,'.$user->id],
            'phone' => ['nullable', 'string', 'max:50'],
            'locale' => ['sometimes', 'in:pt,en,fr,zh'],
            'timezone' => ['sometimes', 'string', 'max:100'],
        ]);

        $user->update($validated);

        if ($user->employee) {
            $employeeData = $request->validate([
                'address' => ['nullable', 'string', 'max:500'],
                'city' => ['nullable', 'string', 'max:150'],
                'state' => ['nullable', 'string', 'max:100'],
                'postal_code' => ['nullable', 'string', 'max:20'],
            ]);

            if (! empty($employeeData)) {
                $user->employee->update($employeeData);
            }
        }

        return $this->success(new AuthResource($user->fresh()->loadMissing('roles', 'employee')), 'Perfil atualizado.');
    }

    public function updatePassword(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        if (! \Hash::check($validated['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['A palavra-passe atual está incorreta.'],
            ]);
        }

        $user->update(['password' => bcrypt($validated['password'])]);

        return $this->success(null, 'Palavra-passe atualizada com sucesso.');
    }

    public function uploadAvatar(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $request->validate([
            'avatar' => ['required', 'image', 'mimes:jpg,jpeg,png', 'max:2048'],
        ]);

        if (! $user->employee) {
            return $this->error('Utilizador sem funcionário associado.', 422);
        }

        $path = $request->file('avatar')->store('employees/'.$user->employee->id.'/avatars', 'public');
        $user->employee->update(['photo_path' => $path]);

        return $this->success([
            'photo_path' => $path,
        ], 'Foto atualizada com sucesso.');
    }
}
