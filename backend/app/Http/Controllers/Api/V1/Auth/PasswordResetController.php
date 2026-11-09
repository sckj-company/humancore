<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Api\V1\BaseController;
use App\Services\Auth\PasswordResetService;
use App\Services\Mail\BrevoConfigurationException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class PasswordResetController extends BaseController
{
    public function requestCode(Request $request, PasswordResetService $passwordReset): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:255'],
        ]);

        try {
            $passwordReset->requestCode($data['email']);
        } catch (ConnectionException|RequestException|BrevoConfigurationException $exception) {
            Log::error('password_reset.email_delivery_failed', [
                'exception' => $exception::class,
                'reason' => match (true) {
                    $exception instanceof RequestException => 'brevo_http_rejected',
                    $exception instanceof BrevoConfigurationException => 'brevo_configuration_incomplete',
                    default => 'brevo_connection_failed',
                },
                'brevo_status' => $exception instanceof RequestException
                    ? $exception->response->status()
                    : null,
            ]);

            return $this->error('O serviço de email está temporariamente indisponível. Tente novamente mais tarde.', 503);
        }

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
