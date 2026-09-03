<?php

namespace App\Services\Payroll\Rules;

use App\Services\Payroll\PayrollContext;
use App\Services\Payroll\PayrollRuleInterface;

abstract class AbstractPayrollRule implements PayrollRuleInterface
{
    public function applies(PayrollContext $context): bool
    {
        return true;
    }

    protected function setting(PayrollContext $context, string $key, mixed $default = null): mixed
    {
        return $context->setting($key, $default);
    }
}
