<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Minimal input-validation helper. Every Controller/Service validates
 * input at the boundary (never trusts $_POST shape downstream) - this
 * class exists so that validation is at least uniform in *how* it fails
 * (a ValidationException carrying a field=>message map), not to be a
 * full framework validator. Later phases extend the $rules vocabulary
 * as new field types show up (money, date, enum-of-COA-ids, ...).
 */
final class Validation
{
    /**
     * @param array<string, mixed> $data
     * @param array<string, string> $rules field => 'required|email' style pipe-separated rule list
     * @return array<string, string> field => first failing message; empty array means valid
     */
    public static function validate(array $data, array $rules): array
    {
        $errors = [];

        foreach ($rules as $field => $ruleString) {
            $value = $data[$field] ?? null;
            foreach (explode('|', $ruleString) as $rule) {
                $error = self::applyRule($field, $value, $rule);
                if ($error !== null) {
                    $errors[$field] = $error;
                    break;
                }
            }
        }

        return $errors;
    }

    private static function applyRule(string $field, mixed $value, string $rule): ?string
    {
        [$name, $param] = array_pad(explode(':', $rule, 2), 2, null);

        return match ($name) {
            'required' => (is_string($value) && trim($value) === '') || $value === null
                ? "{$field} is required" : null,
            'email' => is_string($value) && $value !== '' && filter_var($value, FILTER_VALIDATE_EMAIL) === false
                ? "{$field} must be a valid email" : null,
            'min' => is_string($value) && $param !== null && strlen($value) < (int) $param
                ? "{$field} must be at least {$param} characters" : null,
            'max' => is_string($value) && $param !== null && strlen($value) > (int) $param
                ? "{$field} must be at most {$param} characters" : null,
            'in' => $param !== null && $value !== null && !in_array((string) $value, explode(',', $param), true)
                ? "{$field} has an invalid value" : null,
            default => null,
        };
    }
}
