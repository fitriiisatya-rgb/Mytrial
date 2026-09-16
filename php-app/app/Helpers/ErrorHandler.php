<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Registered once in public/index.php. Logs every uncaught throwable to
 * storage/logs/app.log (never to a web-visible path) and shows a generic
 * message unless APP_DEBUG is true - a stack trace in a production
 * response is itself a disclosure (schema names, file paths, sometimes
 * query fragments), so this is a security control, not just polish.
 */
final class ErrorHandler
{
    public static function register(): void
    {
        set_exception_handler(static function (\Throwable $e): void {
            self::log($e);
            self::render($e);
        });

        set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
            if (!(error_reporting() & $severity)) {
                return false;
            }
            throw new \ErrorException($message, 0, $severity, $file, $line);
        });
    }

    private static function log(\Throwable $e): void
    {
        $logDir = config('app.storage_path') . '/logs';
        if (!is_dir($logDir)) {
            @mkdir($logDir, 0755, true);
        }
        $line = sprintf(
            "[%s] %s: %s in %s:%d\n%s\n",
            date('Y-m-d H:i:s'),
            $e::class,
            $e->getMessage(),
            $e->getFile(),
            $e->getLine(),
            $e->getTraceAsString()
        );
        @file_put_contents($logDir . '/app.log', $line, FILE_APPEND | LOCK_EX);
    }

    private static function render(\Throwable $e): void
    {
        $status = $e instanceof HttpException ? $e->statusCode() : 500;
        http_response_code($status);

        if (config('app.debug', false)) {
            header('Content-Type: text/plain; charset=utf-8');
            echo $e::class . ': ' . $e->getMessage() . "\n\n" . $e->getTraceAsString();
            return;
        }

        header('Content-Type: text/html; charset=utf-8');
        $message = $status === 404 ? 'Not Found' : ($status === 403 ? 'Forbidden' : 'Something went wrong.');
        echo '<!doctype html><html><head><meta charset="utf-8"><title>Error</title></head><body>'
            . '<h1>' . e((string) $status) . '</h1><p>' . e($message) . '</p></body></html>';
    }
}
