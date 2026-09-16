<?php

declare(strict_types=1);

use App\Controllers\AuthController;
use App\Controllers\DemoController;
use App\Controllers\HomeController;
use App\Middleware\AuthMiddleware;
use App\Middleware\CsrfMiddleware;
use App\Middleware\RoleMiddleware;
use App\Router;

/**
 * Every route in the application, registered against one Router
 * instance. Kept as plain data (no attribute/annotation magic) so "what
 * routes exist and what protects each one" is readable top-to-bottom in
 * a single file - important for a security review of an app with no
 * database-level RLS backstop anymore.
 */
return function (Router $router): void {
    $router->get('/login', fn () => (new AuthController())->showLogin());
    $router->post('/login', fn () => (new AuthController())->login(), [new CsrfMiddleware()]);
    $router->post('/logout', fn () => (new AuthController())->logout(), [new AuthMiddleware(), new CsrfMiddleware()]);

    $router->get('/', fn () => (new HomeController())->index(), [new AuthMiddleware()]);

    // Phase 1 RBAC/row-scoping demo routes - see app/Controllers/DemoController.php.
    $router->get('/demo/internal', fn () => (new DemoController())->internal(), [
        new AuthMiddleware(),
        new RoleMiddleware(['super_admin', 'accounting', 'finance_manager', 'management']),
    ]);
    $router->get('/demo/profile', fn () => (new DemoController())->profile(), [new AuthMiddleware()]);
    $router->get('/demo/manage', fn () => (new DemoController())->manage(), [new AuthMiddleware()]);
};
