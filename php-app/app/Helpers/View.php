<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Tiny plain-PHP template renderer (no Blade/Twig dependency, matching
 * the "native PHP structured" default from MIGRATION_TO_CPANEL_MYSQL_PLAN.md
 * sec.10). A view is just a .php file under resources/views/ that reads
 * variables extracted into local scope; it must escape every dynamic
 * value itself via e() - this class does not auto-escape.
 */
final class View
{
    public static function render(string $view, array $data = []): string
    {
        $path = APP_BASE_PATH . '/resources/views/' . $view . '.php';
        if (!is_file($path)) {
            throw new \RuntimeException("View not found: {$view}");
        }

        extract($data, EXTR_SKIP);
        ob_start();
        require $path;
        return (string) ob_get_clean();
    }
}
