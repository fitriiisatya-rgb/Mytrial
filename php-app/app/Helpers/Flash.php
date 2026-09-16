<?php

declare(strict_types=1);

namespace App\Helpers;

/** One-time session flash messages (create/update success or validation-error feedback after a redirect). */
final class Flash
{
    public static function set(string $type, string $message): void
    {
        $_SESSION['_flash'][$type] = $message;
    }

    /** @return array<string, string> */
    public static function consume(): array
    {
        $flash = $_SESSION['_flash'] ?? [];
        unset($_SESSION['_flash']);
        return is_array($flash) ? $flash : [];
    }
}
