<?php

declare(strict_types=1);

/**
 * Single front controller - every request (per public/.htaccess's
 * rewrite rule) enters here. This file, and only this file, is meant to
 * be web-accessible; everything it needs lives one directory above
 * (app/, config/, database/, resources/, storage/), which cPanel serves
 * only if the document root is pointed at this public/ folder or, on a
 * host where that isn't configurable, is kept safe by .htaccess deny
 * rules - see CPANEL_DEPLOYMENT_NOTES.md for both cases.
 */

require_once dirname(__DIR__) . '/app/bootstrap.php';

use App\Helpers\ErrorHandler;
use App\Router;
use App\Services\SessionBootstrap;

ErrorHandler::register();
SessionBootstrap::start();

$router = new Router();
(require dirname(__DIR__) . '/app/routes.php')($router);

$router->dispatch($_SERVER['REQUEST_METHOD'] ?? 'GET', $_SERVER['REQUEST_URI'] ?? '/');
