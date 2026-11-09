<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Api\V1\BaseController;
use App\Services\Auth\PasswordResetService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PasswordResetController extends BaseController
{
    public function requestCode(Request $request, PasswordResetService $passwordReset): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:255'],
        ]);

        $passwordReset->requestCode($data['email']);

        return $this->success(null, 'Se o email estiver registado, será enviado um código de verificação.');
    }

    public function verifyCode(Request $request, PasswordResetService $passwordReset): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'code' => ['required', 'string', 'regex:/^\d{6}$/'],
        ]);

        return $this->success([
            'reset_token' => $passwordReset->verifyCode($data['email'], $data['code']),
        ], 'Código confirmado. Já pode definir uma nova palavra-passe.');
    }

    public function resetPassword(Request $request, PasswordResetService $passwordReset): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'reset_token' => ['required', 'string', 'size:64'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $passwordReset->resetPassword($data['email'], $data['reset_token'], $data['password']);

        return $this->success(null, 'Palavra-passe redefinida com sucesso. Já pode iniciar sessão.');
    }
}
