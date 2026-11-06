<?php

namespace App\Http\Controllers\Api\V1\Employee;

use App\Exceptions\IdentityDocumentOcrException;
use App\Http\Controllers\Api\V1\BaseController;
use App\Models\Employee;
use App\Services\IdentityDocumentOcrService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Log;

class EmployeeIdentityOcrController extends BaseController
{
    public function __invoke(Request $request, IdentityDocumentOcrService $ocr): JsonResponse
    {
        $this->authorize('create', Employee::class);

        $validated = $request->validate([
            'image' => ['required', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:5120'],
        ]);

        if (blank(config('services.ocr_space.key'))) {
            return $this->error('O serviço de leitura do BI não está configurado.', 503);
        }

        try {
            $fields = $ocr->extract($validated['image']);
        } catch (IdentityDocumentOcrException $exception) {
            Log::warning('OCR.space could not process employee identity document', [
                'reason' => $exception->getMessage(),
                'mime_type' => $validated['image']->getMimeType(),
                'size_bytes' => $validated['image']->getSize(),
            ]);

            $reason = $exception->getMessage() ?: 'O fornecedor não forneceu detalhes.';

            return $this->error(
                'O OCR.space não conseguiu ler este documento. Confirme se o ficheiro é válido e tente novamente. Detalhe: '.$reason,
                422,
            );
        } catch (RequestException $exception) {
            $providerResponse = $exception->response->json();
            $providerMessages = [];
            if (is_array($providerResponse)) {
                foreach (['ErrorMessage', 'ErrorDetails', 'message'] as $key) {
                    $value = $providerResponse[$key] ?? null;
                    if (is_string($value) && trim($value) !== '') {
                        $providerMessages[] = trim($value);
                    } elseif (is_array($value)) {
                        foreach ($value as $message) {
                            if (is_string($message) && trim($message) !== '') {
                                $providerMessages[] = trim($message);
                            }
                        }
                    }
                }
            }

            Log::warning('OCR.space returned an unsuccessful HTTP response', [
                'http_status' => $exception->response->status(),
                'provider_message' => mb_substr(implode(' | ', array_unique($providerMessages)), 0, 500),
                'mime_type' => $validated['image']->getMimeType(),
                'size_bytes' => $validated['image']->getSize(),
            ]);

            return $this->error(
                'O OCR.space respondeu com erro HTTP '.$exception->response->status().'. Tente novamente mais tarde.',
                502,
            );
        } catch (ConnectionException $exception) {
            Log::warning('Could not connect to OCR.space', [
                'reason' => $exception->getMessage(),
                'mime_type' => $validated['image']->getMimeType(),
                'size_bytes' => $validated['image']->getSize(),
            ]);

            return $this->error('Não foi possível processar o documento neste momento. Tente novamente.', 502);
        }

        if ($fields === []) {
            return $this->error('Não foram identificados dados legíveis. Tente um documento mais nítido e bem iluminado.', 422);
        }

        return $this->success($fields, 'Dados do documento lidos. Confirme e corrija os campos antes de continuar.');
    }
}
