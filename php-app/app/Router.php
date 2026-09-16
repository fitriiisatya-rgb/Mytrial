<?php

declare(strict_types=1);

namespace App;

/**
 * Minimal front-controller router. No framework dependency - a route is
 * [METHOD, pattern, handler, middleware[]]; pattern supports {param}
 * segments. Deliberately small: this app has ~dozens of routes across
 * the full migration, not thousands, so a regex-per-route match is fine
 * and keeps the "how does a URL become a Controller call" path fully
 * readable in one file, which matters more here than raw router
 * throughput.
 */
final class Router
{
    /** @var list<array{method: string, pattern: string, handler: callable, middleware: list<object|class-string>}> */
    private array $routes = [];

    /** @param list<object|class-string> $middleware a class-string is instantiated with no args; pass an object (e.g. `new RoleMiddleware([...])`) when a middleware needs constructor arguments. */
    public function get(string $pattern, callable $handler, array $middleware = []): void
    {
        $this->add('GET', $pattern, $handler, $middleware);
    }

    public function post(string $pattern, callable $handler, array $middleware = []): void
    {
        $this->add('POST', $pattern, $handler, $middleware);
    }

    private function add(string $method, string $pattern, callable $handler, array $middleware): void
    {
        $this->routes[] = [
            'method' => $method,
            'pattern' => $pattern,
            'handler' => $handler,
            'middleware' => $middleware,
        ];
    }

    /**
     * Dispatches $method/$uri against the registered routes. Every
     * middleware in a matched route's list runs (in order) before the
     * handler - a middleware may throw (e.g. HttpException) to short
     * circuit, which is how AuthMiddleware/CsrfMiddleware/RoleMiddleware
     * reject a request before any Controller code runs.
     */
    public function dispatch(string $method, string $uri): void
    {
        $path = rtrim((string) parse_url($uri, PHP_URL_PATH), '/');
        if ($path === '') {
            $path = '/';
        }

        foreach ($this->routes as $route) {
            if ($route['method'] !== $method) {
                continue;
            }
            $params = $this->match($route['pattern'], $path);
            if ($params === null) {
                continue;
            }

            foreach ($route['middleware'] as $middleware) {
                $instance = is_string($middleware) ? new $middleware() : $middleware;
                $instance->handle();
            }

            ($route['handler'])($params);
            return;
        }

        http_response_code(404);
        echo '404 Not Found';
    }

    /** @return array<string, string>|null */
    private function match(string $pattern, string $path): ?array
    {
        $regex = preg_replace('#\{([a-zA-Z_][a-zA-Z0-9_]*)\}#', '(?P<$1>[^/]+)', $pattern);
        $regex = '#^' . $regex . '$#';
        if (preg_match($regex, $path, $matches) !== 1) {
            return null;
        }
        $params = [];
        foreach ($matches as $key => $value) {
            if (is_string($key)) {
                $params[$key] = $value;
            }
        }
        return $params;
    }
}
