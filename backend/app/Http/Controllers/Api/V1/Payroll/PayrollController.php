<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Requests\V1\Payroll\StorePeriodRequest;
use App\Http\Resources\V1\PayrollPeriodResource;
use App\Http\Resources\V1\PayrollRecordResource;
use App\Jobs\ProcessPayrollJob;
use App\Models\PayrollPeriod;
use App\Models\PayrollRecord;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PayrollController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', PayrollPeriod::class);

        $periods = PayrollPeriod::query()
            ->orderByDesc('period_start')
            ->paginate($request->integer('per_page', 15));

        return $this->paginated(PayrollPeriodResource::collection($periods));
    }

    public function store(StorePeriodRequest $request): JsonResponse
    {
        $this->authorize('create', PayrollPeriod::class);

        $data = $request->validated();
        if (! isset($data['name'])) {
            $data['name'] = Carbon::parse($data['period_start'])->format('F/Y');
        }

        $period = PayrollPeriod::query()->create($data);

        return $this->success(new PayrollPeriodResource($period), 'Período criado com sucesso.', 201);
    }

    public function show(PayrollPeriod $period): JsonResponse
    {
        $this->authorize('view', $period);

        $period->load('records.employee');

        return $this->success(new PayrollPeriodResource($period));
    }

    public function process(PayrollPeriod $period): JsonResponse
    {
        $this->authorize('process', $period);

        if ($period->isClosed()) {
            return $this->error('Não é possível processar um período fechado.', 422);
        }

        ProcessPayrollJob::dispatch($period->id);

        $period->update(['status' => 'processing']);

        return $this->success(null, 'Processamento iniciado em background.');
    }

    public function approve(PayrollPeriod $period): JsonResponse
    {
        $this->authorize('approve', $period);

        $period->records()->update(['status' => 'approved', 'approved_at' => now(), 'approved_by' => auth()->id()]);
        $period->update(['status' => 'completed']);

        return $this->success(null, 'Folha aprovada com sucesso.');
    }

    public function close(PayrollPeriod $period): JsonResponse
    {
        $this->authorize('close', $period);

        $period->update(['status' => 'closed', 'closed_at' => now()]);

        return $this->success(null, 'Período fechado com sucesso.');
    }

    public function records(PayrollPeriod $period): JsonResponse
    {
        $this->authorize('viewAny', PayrollRecord::class);

        $records = $period->records()->with('employee')->get();

        return $this->success(PayrollRecordResource::collection($records));
    }
}
