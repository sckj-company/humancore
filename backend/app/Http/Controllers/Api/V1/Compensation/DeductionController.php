<?php

namespace App\Http\Controllers\Api\V1\Compensation;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\DeductionResource;
use App\Models\Deduction;
use App\Models\DeductionInstallment;
use App\Models\Employee;
use App\Services\CloudinaryService;
use Barryvdh\DomPDF\Facade\Pdf;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

class DeductionController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Deduction::class);
        $allowedDepartmentIds = $request->user()?->allowedDepartmentIds();

        $deductions = Deduction::query()
            ->with([
                'employee:id,first_name,last_name,employee_code',
                'approver:id,name',
                'installments.payrollPeriod:id,name',
            ])
            ->when($allowedDepartmentIds !== null, fn ($q) => $q->whereHas('employee', fn ($eq) => $eq->whereIn('department_id', $allowedDepartmentIds)))
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = $request->string('search');
                $q->where(function ($sq) use ($term) {
                    $sq->where('name', 'like', "%{$term}%")
                        ->orWhereHas('employee', function ($eq) use ($term) {
                            $eq->where(function ($inner) use ($term) {
                                $inner->where('first_name', 'like', "%{$term}%")
                                    ->orWhere('last_name', 'like', "%{$term}%")
                                    ->orWhere('employee_code', 'like', "%{$term}%");
                            });
                        });
                });
            })
            ->when($request->filled('deduction_type'), fn ($q) => $q->where('deduction_type', $request->string('deduction_type')))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('employee_id'), fn ($q) => $q->where('employee_id', $request->integer('employee_id')))
            ->orderBy($request->string('sort_by', 'created_at'), $request->string('sort_dir', 'desc'))
            ->paginate($request->integer('per_page', 15));

        return $this->paginated(DeductionResource::collection($deductions));
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Deduction::class);

        $data = $request->validate([
            'employee_id' => ['required', 'integer', Rule::exists('employees', 'id')->where('tenant_id', tenant_id())],
            'name' => ['required', 'string', 'max:255'],
            'deduction_type' => ['required', 'string', 'max:50'],
            'amount_type' => ['required', 'in:'.implode(',', array_keys(Deduction::AMOUNT_TYPES))],
            'amount' => [
                Rule::requiredIf(fn () => $request->input('amount_type') === 'fixed' && ! $request->filled('installments') && ! $request->filled('total_amount')),
                'nullable',
                'numeric',
                'min:0',
            ],
            'percentage' => ['required_if:amount_type,percentage', 'nullable', 'numeric', 'min:0', 'max:100'],
            'total_amount' => [
                'nullable',
                'numeric',
                'min:0',
                Rule::requiredIf(fn () => ($request->input('amount_type') === 'percentage' && $request->filled('installment_count'))
                    || $request->filled('installments')),
            ],
            'installment_count' => ['nullable', 'integer', 'min:1'],
            'start_period' => ['sometimes', 'nullable', 'date_format:Y-m'],
            'requested_at' => ['sometimes', 'nullable', 'date'],
            'installments' => ['sometimes', 'nullable', 'array', 'min:1', 'max:60'],
            'installments.*.reference_month' => ['required_with:installments', 'date_format:Y-m'],
            'installments.*.percentage' => ['required_with:installments', 'numeric', 'gt:0', 'lte:100'],
            'installments.*.amount' => ['sometimes', 'nullable', 'numeric', 'gt:0'],
            'is_recurring' => ['nullable', 'boolean'],
            'is_mandatory' => ['nullable', 'boolean'],
            'legal_basis' => ['nullable', 'string', 'max:1000'],
            'status' => ['nullable', 'in:'.implode(',', array_keys(Deduction::STATUSES))],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        $employee = Employee::find($data['employee_id']);
        if ($employee && ! $employee->isApproved()) {
            return $this->error('Funcionário aguarda aprovação e verificação dos documentos.', 422);
        }

        $customInstallments = $data['installments'] ?? null;
        unset($data['installments']);

        if ($customInstallments !== null) {
            $this->validateInstallmentsSchedule($customInstallments, (float) ($data['total_amount'] ?? 0));
        }

        $data['tenant_id'] = tenant_id();
        $data['status'] = $data['status'] ?? 'active';
        $data['paid_amount'] = 0;
        $data['requested_at'] = filled($data['requested_at'] ?? null) ? Carbon::parse($data['requested_at']) : now();

        if (array_key_exists('start_period', $data)) {
            $data['starts_at'] = filled($data['start_period']) ? $data['start_period'].'-01' : null;
            unset($data['start_period']);
        }

        if ($customInstallments !== null) {
            $totalAmount = round((float) $data['total_amount'], 2);
            $count = count($customInstallments);
            $months = collect($customInstallments)->pluck('reference_month')->sort()->values();
            $data['total_amount'] = $totalAmount;
            $data['installment_count'] = $count;
            $data['starts_at'] = $months->first().'-01';
            $data['installment_amount'] = round($totalAmount / $count, 2);
            $data['amount'] = $data['amount_type'] === 'fixed' ? $data['installment_amount'] : (float) ($data['amount'] ?? 0);
            $data['is_recurring'] = false;
        } elseif (($data['amount_type'] ?? '') === 'fixed' && filled($data['installment_count'] ?? null)) {
            $count = (int) $data['installment_count'];
            if (filled($data['total_amount'] ?? null) && filled($data['amount'] ?? null) && (float) $data['amount'] > 0) {
                $expectedPerInstallment = round((float) $data['total_amount'] / $count, 2);
                if (abs($expectedPerInstallment - round((float) $data['amount'], 2)) > 0.01) {
                    throw ValidationException::withMessages([
                        'total_amount' => 'A soma das parcelas não corresponde ao valor total do desconto.',
                    ]);
                }
            }
            $data['total_amount'] = filled($data['total_amount'] ?? null)
                ? (float) $data['total_amount']
                : round((float) ($data['amount'] ?? 0) * $count, 2);
            $data['installment_amount'] = round($data['total_amount'] / $count, 2);
            $data['amount'] = $data['installment_amount'];
        } else {
            $data['amount'] = $data['amount'] ?? 0;
            $data['installment_amount'] = null;
        }

        $deduction = DB::transaction(function () use ($data, $customInstallments): Deduction {
            $deduction = Deduction::query()->create($data);
            $this->syncInstallments($deduction, $customInstallments);

            return $deduction;
        });

        return $this->success(
            new DeductionResource($deduction->load(['employee', 'approver', 'installments.payrollPeriod'])),
            'Desconto criado com sucesso.',
            201,
        );
    }

    public function show(Deduction $deduction): JsonResponse
    {
        $this->authorize('view', $deduction);

        return $this->success(
            new DeductionResource($deduction->load(['employee', 'approver', 'installments.payrollPeriod']))
        );
    }

    public function update(Request $request, Deduction $deduction): JsonResponse
    {
        $this->authorize('update', $deduction);

        $data = $request->validate([
            'employee_id' => ['sometimes', 'integer', Rule::exists('employees', 'id')->where('tenant_id', tenant_id())],
            'name' => ['sometimes', 'string', 'max:255'],
            'deduction_type' => ['sometimes', 'string', 'max:50'],
            'amount_type' => ['sometimes', 'in:'.implode(',', array_keys(Deduction::AMOUNT_TYPES))],
            'amount' => ['nullable', 'numeric', 'min:0'],
            'percentage' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'total_amount' => [
                'nullable',
                'numeric',
                'min:0',
                Rule::requiredIf(fn () => ($request->input('amount_type', $deduction->amount_type) === 'percentage'
                    && ($request->exists('installment_count')
                        ? $request->filled('installment_count')
                        : $deduction->installment_count !== null))
                    || $request->filled('installments')),
            ],
            'installment_count' => ['nullable', 'integer', 'min:1'],
            'start_period' => ['sometimes', 'nullable', 'date_format:Y-m'],
            'requested_at' => ['sometimes', 'nullable', 'date'],
            'installments' => ['sometimes', 'nullable', 'array', 'min:1', 'max:60'],
            'installments.*.reference_month' => ['required_with:installments', 'date_format:Y-m'],
            'installments.*.percentage' => ['required_with:installments', 'numeric', 'gt:0', 'lte:100'],
            'installments.*.amount' => ['sometimes', 'nullable', 'numeric', 'gt:0'],
            'is_recurring' => ['nullable', 'boolean'],
            'is_mandatory' => ['sometimes', 'boolean'],
            'legal_basis' => ['nullable', 'string', 'max:1000'],
            'status' => ['sometimes', 'in:'.implode(',', array_keys(Deduction::STATUSES))],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        $customInstallments = $data['installments'] ?? null;
        $hasInstallmentsInput = array_key_exists('installments', $data);
        unset($data['installments']);

        if ($customInstallments !== null) {
            if ($deduction->installments()->where('status', 'paid')->exists()) {
                return $this->error('Não é possível redefinir o plano porque já existem parcelas pagas/descontadas.', 422);
            }
            $targetTotal = (float) ($data['total_amount'] ?? $deduction->total_amount ?? 0);
            $this->validateInstallmentsSchedule($customInstallments, $targetTotal);
        }

        $amountType = $data['amount_type'] ?? $deduction->amount_type;
        if (array_key_exists('start_period', $data)) {
            $data['starts_at'] = filled($data['start_period']) ? $data['start_period'].'-01' : null;
            unset($data['start_period']);
        }
        if (array_key_exists('requested_at', $data) && filled($data['requested_at'])) {
            $data['requested_at'] = Carbon::parse($data['requested_at']);
        }

        $totalAmount = array_key_exists('total_amount', $data) ? $data['total_amount'] : $deduction->total_amount;
        $installmentCount = array_key_exists('installment_count', $data) ? $data['installment_count'] : $deduction->installment_count;

        if ($customInstallments !== null) {
            $resolvedTotal = round((float) $totalAmount, 2);
            $count = count($customInstallments);
            $months = collect($customInstallments)->pluck('reference_month')->sort()->values();
            $data['total_amount'] = $resolvedTotal;
            $data['installment_count'] = $count;
            $data['starts_at'] = $months->first().'-01';
            $data['installment_amount'] = round($resolvedTotal / $count, 2);
            $data['amount'] = $amountType === 'fixed' ? $data['installment_amount'] : ($data['amount'] ?? $deduction->amount);
            $data['is_recurring'] = false;
        } elseif ($amountType === 'fixed' && filled($installmentCount)) {
            $count = (int) $installmentCount;
            if (filled($totalAmount) && filled($data['amount'] ?? null) && (float) $data['amount'] > 0) {
                $expectedPerInstallment = round((float) $totalAmount / $count, 2);
                if (abs($expectedPerInstallment - round((float) $data['amount'], 2)) > 0.01) {
                    throw ValidationException::withMessages([
                        'total_amount' => 'A soma das parcelas não corresponde ao valor total do desconto.',
                    ]);
                }
            }
            $totalAmount = filled($totalAmount)
                ? (float) $totalAmount
                : round((float) ($data['amount'] ?? $deduction->amount) * $count, 2);
            $data['total_amount'] = $totalAmount;
            $data['installment_amount'] = round(((float) $totalAmount) / $count, 2);
            $data['amount'] = $data['installment_amount'];
        } else {
            $data['installment_amount'] = null;
        }

        DB::transaction(function () use ($deduction, $data, $customInstallments, $hasInstallmentsInput): void {
            $deduction->update($data);
            if ($hasInstallmentsInput || ($customInstallments === null && ! $deduction->installments()->where('status', 'paid')->exists() && ($deduction->starts_at && $deduction->total_amount && $deduction->installment_count))) {
                $this->syncInstallments($deduction->fresh(), $customInstallments);
            }
        });

        return $this->success(
            new DeductionResource($deduction->fresh()->load(['employee', 'approver', 'installments.payrollPeriod'])),
            'Desconto atualizado com sucesso.',
        );
    }

    public function destroy(Request $request, Deduction $deduction): JsonResponse
    {
        $this->authorize('delete', $deduction);

        $data = $request->validate([
            'reason' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ]);

        if (filled($data['reason'] ?? null)) {
            $deduction->update([
                'deletion_reason' => trim((string) $data['reason']),
            ]);
        }

        $deduction->delete();

        return $this->success(null, 'Desconto removido com sucesso.');
    }

    public function cancel(Request $request, Deduction $deduction): JsonResponse
    {
        $this->authorize('update', $deduction);

        if ($deduction->status === 'cancelled') {
            return $this->error('Este desconto/adiantamento já está cancelado.', 422);
        }

        if ($deduction->status === 'completed') {
            return $this->error('Não é possível cancelar um desconto/adiantamento já concluído.', 422);
        }

        $data = $request->validate([
            'reason' => ['required', 'string', 'min:3', 'max:1000'],
        ]);

        DB::transaction(function () use ($deduction, $data, $request): void {
            $deduction->update([
                'status' => 'cancelled',
                'cancellation_reason' => trim((string) $data['reason']),
                'cancelled_at' => now(),
                'cancelled_by' => $request->user()?->id,
            ]);

            $deduction->installments()
                ->where('status', 'pending')
                ->update(['status' => 'cancelled']);
        });

        return $this->success(
            new DeductionResource($deduction->fresh()->load(['employee', 'approver', 'installments.payrollPeriod'])),
            'Adiantamento/desconto cancelado com sucesso.',
        );
    }

    public function approve(Request $request, Deduction $deduction): JsonResponse
    {
        $this->authorize('approve', $deduction);

        if ($deduction->status !== 'active') {
            return $this->error('Só descontos ativos podem ser aprovados.', 422);
        }

        $deduction->update([
            'approved_by' => $request->user()->id,
            'approved_at' => now(),
        ]);

        return $this->success(
            new DeductionResource($deduction->fresh()->load(['employee', 'approver', 'installments.payrollPeriod'])),
            'Desconto aprovado com sucesso.',
        );
    }

    public function receiptPdf(Request $request, Deduction $deduction): SymfonyResponse
    {
        $this->authorize('view', $deduction);

        $deduction->loadMissing([
            'tenant',
            'employee.department',
            'employee.position',
            'approver:id,name',
            'installments.payrollPeriod:id,name',
        ]);

        $pdf = \App\Support\PdfDocument::make(
            view: 'pdf.deduction-receipt',
            data: [
                'deduction' => $deduction,
                'operatorName' => $request->user()?->name ?? 'Sistema',
            ],
            paper: 'a4',
            orientation: 'portrait',
            lang: $request->query('lang'),
        );

        $code = $deduction->employee?->employee_code ?? $deduction->employee_id;
        $filename = str_replace(['/', '\\', ' '], '-', "comprovativo-{$deduction->deduction_type}-{$code}-{$deduction->id}.pdf");

        return $pdf->download($filename);
    }

    public function uploadSignedDocument(Request $request, Deduction $deduction, CloudinaryService $cloudinary): JsonResponse
    {
        $this->authorize('update', $deduction);

        $rawFile = $request->file('document');
        if ($rawFile !== null && ! $rawFile->isValid()) {
            $errorCode = $rawFile->getError();
            $message = match ($errorCode) {
                UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'O ficheiro excede o limite máximo permitido pelo servidor PHP ('.ini_get('upload_max_filesize').').',
                UPLOAD_ERR_PARTIAL => 'O carregamento do ficheiro foi interrompido. Tente novamente.',
                UPLOAD_ERR_NO_TMP_DIR, UPLOAD_ERR_CANT_WRITE, UPLOAD_ERR_EXTENSION => 'Erro interno no diretório temporário ao gravar o ficheiro.',
                default => 'Não foi possível carregar o ficheiro selecionado.',
            };

            return $this->error($message, 422);
        }

        $oldPath = $deduction->signed_document_path;
        $hasCloudinary = ! app()->runningUnitTests()
            && filled(config('services.cloudinary.cloud_name'))
            && filled(config('services.cloudinary.api_key'))
            && filled(config('services.cloudinary.api_secret'));

        $newPath = null;
        $tempFilePath = null;

        if ($request->filled('document_base64')) {
            $validated = $request->validate([
                'document_base64' => ['required', 'string'],
                'document_name' => ['nullable', 'string', 'max:255'],
                'document_mime' => ['nullable', 'string', 'max:100'],
            ]);

            $payload = (string) $validated['document_base64'];
            if (str_contains($payload, ',')) {
                [, $payload] = explode(',', $payload, 2);
            }
            $binary = base64_decode($payload, true);
            if ($binary === false || strlen($binary) === 0 || strlen($binary) > 10 * 1024 * 1024) {
                return $this->error('Ficheiro codificado inválido ou superior a 10 MB.', 422);
            }

            $ext = match (strtolower((string) ($validated['document_mime'] ?? ''))) {
                'application/pdf' => 'pdf',
                'image/jpeg', 'image/jpg' => 'jpg',
                'image/png' => 'png',
                'image/webp' => 'webp',
                default => strtolower(pathinfo((string) ($validated['document_name'] ?? 'documento.pdf'), PATHINFO_EXTENSION) ?: 'pdf'),
            };
            if (! in_array($ext, ['pdf', 'jpg', 'jpeg', 'png', 'webp'], true)) {
                return $this->error('Formato não suportado. Envie PDF, JPG, PNG ou WEBP.', 422);
            }

            $relativePath = 'tenants/'.$deduction->tenant_id.'/deduction-documents/'.uniqid('signed_', true).'.'.$ext;
            Storage::disk('local')->put($relativePath, $binary);

            if ($hasCloudinary) {
                $tempFilePath = Storage::disk('local')->path($relativePath);
                try {
                    $newPath = $cloudinary->upload(
                        $tempFilePath,
                        'humancore/tenants/'.$deduction->tenant_id.'/deduction-documents',
                        'auto'
                    )['url'];
                    Storage::disk('local')->delete($relativePath);
                } catch (\Throwable) {
                    $newPath = $relativePath;
                }
            } else {
                $newPath = $relativePath;
            }
        } else {
            $validated = $request->validate([
                'document' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png,webp', 'max:10240'],
            ]);

            if ($hasCloudinary) {
                try {
                    $newPath = $cloudinary->upload(
                        $validated['document'],
                        'humancore/tenants/'.$deduction->tenant_id.'/deduction-documents',
                        'auto'
                    )['url'];
                } catch (\Throwable) {
                    $newPath = null;
                }
            }

            if (! $newPath) {
                $newPath = $validated['document']->store(
                    'tenants/'.$deduction->tenant_id.'/deduction-documents',
                    'local'
                );
            }
        }

        $deduction->update([
            'signed_document_path' => $newPath,
            'signed_document_uploaded_at' => now(),
        ]);

        if ($oldPath) {
            if ($cloudinary->isCloudinaryUrl($oldPath)) {
                $cloudinary->delete($oldPath);
            } else {
                Storage::disk('local')->delete($oldPath);
            }
        }

        return $this->success(
            new DeductionResource($deduction->fresh()->load(['employee', 'approver', 'installments.payrollPeriod'])),
            'Comprovativo assinado carregado com sucesso.'
        );
    }

    public function downloadSignedDocument(Deduction $deduction, CloudinaryService $cloudinary): Response|StreamedResponse|RedirectResponse|JsonResponse
    {
        $this->authorize('view', $deduction);

        $path = $deduction->signed_document_path;
        if (! $path) {
            return $this->error('Comprovativo assinado não encontrado.', 404);
        }

        if ($cloudinary->isCloudinaryUrl($path)) {
            try {
                $remote = Http::timeout(20)->get($path);
                if ($remote->successful()) {
                    $ext = pathinfo((string) parse_url($path, PHP_URL_PATH), PATHINFO_EXTENSION) ?: 'pdf';
                    $contentType = $remote->header('Content-Type') ?: 'application/octet-stream';
                    $filename = "comprovativo-assinado-{$deduction->id}.{$ext}";

                    return response($remote->body(), 200, [
                        'Content-Type' => $contentType,
                        'Content-Disposition' => 'attachment; filename="'.$filename.'"',
                    ]);
                }
            } catch (\Throwable) {
                // Fall through to error response below
            }

            return $this->error('Não foi possível transferir o comprovativo assinado.', 502);
        }

        if (! Storage::disk('local')->exists($path)) {
            return $this->error('Comprovativo assinado não encontrado.', 404);
        }

        return Storage::disk('local')->download($path);
    }

    /**
     * @param  array<int, array{reference_month: string, percentage: numeric, amount?: numeric|null}>  $rows
     */
    private function validateInstallmentsSchedule(array $rows, float $totalAmount): void
    {
        $resolvedTotal = round($totalAmount, 2);
        if ($resolvedTotal <= 0) {
            throw ValidationException::withMessages([
                'total_amount' => 'Indique um valor total superior a zero para definir parcelas.',
            ]);
        }

        $totalPct = round(collect($rows)->sum(fn ($r) => round((float) $r['percentage'], 2)), 2);
        if (abs($totalPct - 100.0) > 0.001) {
            throw ValidationException::withMessages([
                'installments' => "A soma das parcelas deve ser exatamente igual ao total do desconto (100% / {$resolvedTotal} Kz; soma atual: {$totalPct}%).",
            ]);
        }

        $hasExplicitAmounts = collect($rows)->every(fn ($r) => isset($r['amount']) && $r['amount'] !== null);
        if ($hasExplicitAmounts) {
            $explicitSum = round(collect($rows)->sum(fn ($r) => round((float) $r['amount'], 2)), 2);
            if (abs($explicitSum - $resolvedTotal) > 0.001) {
                throw ValidationException::withMessages([
                    'installments' => "A soma dos valores das parcelas ({$explicitSum}) deve ser exatamente igual ao total do desconto ({$resolvedTotal}).",
                ]);
            }
        }

        // Simulate resulting installment amounts and ensure every installment is positive and sums to total_amount
        $sorted = collect($rows)->sortBy('reference_month')->values();
        $count = $sorted->count();
        $accumulated = 0.0;
        $computedSum = 0.0;
        foreach ($sorted as $index => $row) {
            $pct = round((float) $row['percentage'], 2);
            $isLast = $index === ($count - 1);
            $amount = $isLast
                ? round(max(0, $resolvedTotal - $accumulated), 2)
                : round($resolvedTotal * ($pct / 100), 2);
            if ($amount <= 0) {
                throw ValidationException::withMessages([
                    'installments' => 'Todas as parcelas devem resultar num valor superior a zero e somar exatamente ao total do desconto.',
                ]);
            }
            $accumulated = round($accumulated + $amount, 2);
            $computedSum = round($computedSum + $amount, 2);
        }

        if (abs($computedSum - $resolvedTotal) > 0.001) {
            throw ValidationException::withMessages([
                'installments' => "A soma das parcelas ({$computedSum}) não coincide com o total do desconto ({$resolvedTotal}).",
            ]);
        }
    }

    /**
     * @param  array<int, array{reference_month: string, percentage: numeric}>|null  $customInstallments
     */
    private function syncInstallments(Deduction $deduction, ?array $customInstallments): void
    {
        $deduction->installments()->delete();

        $totalAmount = (float) ($deduction->total_amount ?? 0);
        if ($totalAmount <= 0) {
            return;
        }

        if ($customInstallments !== null && count($customInstallments) > 0) {
            $sorted = collect($customInstallments)
                ->sortBy('reference_month')
                ->values();
            $count = $sorted->count();
            $accumulated = 0.0;

            foreach ($sorted as $index => $row) {
                $pct = round((float) $row['percentage'], 2);
                $isLast = $index === ($count - 1);
                $amount = $isLast
                    ? round(max(0, $totalAmount - $accumulated), 2)
                    : round($totalAmount * ($pct / 100), 2);
                $accumulated = round($accumulated + $amount, 2);

                DeductionInstallment::query()->create([
                    'tenant_id' => $deduction->tenant_id,
                    'deduction_id' => $deduction->id,
                    'employee_id' => $deduction->employee_id,
                    'installment_number' => $index + 1,
                    'reference_month' => (string) $row['reference_month'],
                    'percentage' => $pct,
                    'amount' => $amount,
                    'status' => $deduction->status === 'cancelled' ? 'cancelled' : 'pending',
                ]);
            }

            return;
        }

        // Legacy fallback when caller sets total_amount + installment_count + start_period explicitly
        $count = (int) ($deduction->installment_count ?? 0);
        if ($count <= 0 || ! $deduction->starts_at) {
            return;
        }

        $startMonth = Carbon::parse($deduction->starts_at)->startOfMonth();
        $basePct = round(100 / $count, 2);
        $accumulatedAmount = 0.0;
        $accumulatedPct = 0.0;

        for ($i = 0; $i < $count; $i++) {
            $isLast = $i === ($count - 1);
            $pct = $isLast ? round(max(0, 100 - $accumulatedPct), 2) : $basePct;
            $amount = $isLast
                ? round(max(0, $totalAmount - $accumulatedAmount), 2)
                : round($totalAmount * ($pct / 100), 2);
            $accumulatedPct = round($accumulatedPct + $pct, 2);
            $accumulatedAmount = round($accumulatedAmount + $amount, 2);

            DeductionInstallment::query()->create([
                'tenant_id' => $deduction->tenant_id,
                'deduction_id' => $deduction->id,
                'employee_id' => $deduction->employee_id,
                'installment_number' => $i + 1,
                'reference_month' => $startMonth->copy()->addMonthsNoOverflow($i)->format('Y-m'),
                'percentage' => $pct,
                'amount' => $amount,
                'status' => $deduction->status === 'cancelled' ? 'cancelled' : 'pending',
            ]);
        }
    }
}
