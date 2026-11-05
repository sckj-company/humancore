<?php

namespace App\Services\Payroll;

class SalaryComponentFormulaEvaluator
{
    private array $tokens = [];

    private array $variables = [];

    private int $position = 0;

    public function evaluate(string $formula, array $variables): ?float
    {
        $formula = ltrim(trim($formula), '=');
        if ($formula === '' || preg_match_all('/\s*(\d+(?:\.\d+)?|[a-zA-Z_][a-zA-Z0-9_]*|[+\-*\/()])/', $formula, $matches) === false) {
            return null;
        }

        $tokens = $matches[1];
        $normalizedFormula = preg_replace('/\s+/', '', $formula);
        if (implode('', $tokens) !== $normalizedFormula) {
            return null;
        }

        $this->tokens = $tokens;
        $this->variables = array_change_key_case($variables, CASE_LOWER);
        $this->position = 0;

        $result = $this->parseExpression();

        return $result !== null && $this->position === count($this->tokens) && is_finite($result)
            ? $result
            : null;
    }

    private function parseExpression(): ?float
    {
        $value = $this->parseTerm();
        while ($value !== null && in_array($this->peek(), ['+', '-'], true)) {
            $operator = $this->tokens[$this->position++];
            $right = $this->parseTerm();
            if ($right === null) {
                return null;
            }
            $value = $operator === '+' ? $value + $right : $value - $right;
        }

        return $value;
    }

    private function parseTerm(): ?float
    {
        $value = $this->parseFactor();
        while ($value !== null && in_array($this->peek(), ['*', '/'], true)) {
            $operator = $this->tokens[$this->position++];
            $right = $this->parseFactor();
            if ($right === null || ($operator === '/' && $right == 0.0)) {
                return null;
            }
            $value = $operator === '*' ? $value * $right : $value / $right;
        }

        return $value;
    }

    private function parseFactor(): ?float
    {
        $token = $this->peek();
        if ($token === null) {
            return null;
        }

        if ($token === '+' || $token === '-') {
            $this->position++;
            $value = $this->parseFactor();

            return $value === null ? null : ($token === '-' ? -$value : $value);
        }

        if ($token === '(') {
            $this->position++;
            $value = $this->parseExpression();
            if ($this->peek() !== ')') {
                return null;
            }
            $this->position++;

            return $value;
        }

        $this->position++;
        if (is_numeric($token)) {
            return (float) $token;
        }

        $value = $this->variables[strtolower($token)] ?? null;

        return is_numeric($value) ? (float) $value : null;
    }

    private function peek(): ?string
    {
        return $this->tokens[$this->position] ?? null;
    }
}