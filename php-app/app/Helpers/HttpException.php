<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Thrown by Middleware/Controllers to short-circuit a request with a
 * specific HTTP status (401/403/404/419 for CSRF, etc). Caught once, in
 * public/index.php's top-level handler, which is also where the status
 * code actually gets sent - nothing downstream calls http_response_code()
 * directly, so the "what status did this request get" answer lives in
 * exactly one place.
 */
final class HttpException extends \RuntimeException
{
    public function __construct(private readonly int $statusCode, string $message = '')
    {
        parent::__construct($message !== '' ? $message : self::defaultMessage($statusCode));
    }

    public function statusCode(): int
    {
        return $this->statusCode;
    }

    private static function defaultMessage(int $statusCode): string
    {
        return match ($statusCode) {
            401 => 'Unauthorized',
            403 => 'Forbidden',
            404 => 'Not Found',
            419 => 'CSRF token mismatch',
            default => 'Error',
        };
    }
}
