<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Helpers\Csrf;
use App\Helpers\HttpException;

/**
 * Applied to every route registered with a state-changing HTTP method
 * (POST/PUT/DELETE). Runs before the Controller - a request with a
 * missing or wrong token never reaches business logic.
 */
final class CsrfMiddleware implements Middleware
{
    public function handle(): void
    {
        if ($_SERVER['REQUEST_METHOD'] === 'GET' || $_SERVER['REQUEST_METHOD'] === 'HEAD') {
            return;
        }

        $submitted = $_POST['_csrf_token'] ?? null;
        if (!Csrf::verify(is_string($submitted) ? $submitted : null)) {
            throw new HttpException(419, 'CSRF token mismatch');
        }
    }
}
