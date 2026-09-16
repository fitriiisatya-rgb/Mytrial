<?php

declare(strict_types=1);

namespace App\Services;

/** Thrown inside OwnershipService::create()'s transaction when a new ownership row would push an outlet's overlapping total above 100% (spec I). */
final class OwnershipTotalExceededException extends \RuntimeException
{
}
