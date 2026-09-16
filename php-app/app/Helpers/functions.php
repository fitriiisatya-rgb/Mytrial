<?php

declare(strict_types=1);

use App\Helpers\Html;

/**
 * Global helper functions, loaded eagerly via composer.json's
 * autoload.files (not PSR-4 class-autoloaded) so they are always
 * available in every view without a `use` statement - this file is
 * required unconditionally, unlike a class which only autoloads on
 * first reference.
 */

if (!function_exists('e')) {
    function e(mixed $value): string
    {
        return Html::e($value);
    }
}

// config() itself is defined in app/bootstrap.php, which always runs
// before this file is of any use (it requires vendor/autoload.php,
// which is what makes autoload.files - including this file - load in
// the first place) - so it is intentionally not redeclared here.
