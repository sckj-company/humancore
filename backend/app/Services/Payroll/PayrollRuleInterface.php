<?php

namespace App\Services\Payroll;

interface PayrollRuleInterface
{
    public function getCode(): string;

    public function getName(): string;

    public function getType(): string;

    public function getPriority(): int;

    public function isMandatory(): bool;

    /**
     * Calculate the amount for the rule.
     * Returns positive for earnings/benefits, negative for deductions/taxes.
     */
    public function calculate(PayrollContext $context): float;

    /**
     * Whether this rule applies to the given context.
     */
    public function applies(PayrollContext $context): bool;
}
