<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\View;
use App\Services\AuthService;

/**
 * Base Controller. Deliberately thin: a Controller's job is to (1) read
 * request input, (2) call exactly one Service/Repository method, (3)
 * render a response - it must never contain a raw SQL query or a
 * business rule itself. See CPANEL_MYSQL_IMPLEMENTATION_PLAN.md's
 * "Target Folder Architecture" note on why Repositories, not
 * Controllers, own every query.
 */
abstract class Controller
{
    protected function view(string $view, array $data = []): void
    {
        echo View::render($view, $data);
    }

    protected function redirect(string $to): void
    {
        header('Location: ' . $to, true, 302);
    }

    protected function json(array $data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_SLASHES);
    }

    protected function input(string $key, mixed $default = null): mixed
    {
        return $_POST[$key] ?? $_GET[$key] ?? $default;
    }

    /** @return array{id: string, role: string, name: string, email: string}|null */
    protected function currentUser(): ?array
    {
        return AuthService::currentUser();
    }
}
