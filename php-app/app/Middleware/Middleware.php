<?php

declare(strict_types=1);

namespace App\Middleware;

interface Middleware
{
    /** Throws App\Helpers\HttpException to short-circuit the request. */
    public function handle(): void;
}
