<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Server-side pagination (spec Q: "Jangan load semua 500 investor atau
 * 100 outlet ke browser"). Every list Repository method takes a
 * Paginator's offset()/perPage() into its SQL LIMIT/OFFSET - nothing is
 * ever paginated after fetching the full table into PHP.
 */
final class Paginator
{
    private function __construct(
        public readonly int $page,
        public readonly int $perPage,
        public readonly int $total
    ) {
    }

    public static function fromRequest(int $total, int $defaultPerPage = 20): self
    {
        $page = max(1, (int) ($_GET['page'] ?? 1));
        $perPage = max(1, min(100, (int) ($_GET['per_page'] ?? $defaultPerPage)));
        return new self($page, $perPage, $total);
    }

    public function offset(): int
    {
        return ($this->page - 1) * $this->perPage;
    }

    public function lastPage(): int
    {
        return max(1, (int) ceil($this->total / $this->perPage));
    }

    public function hasPrevious(): bool
    {
        return $this->page > 1;
    }

    public function hasNext(): bool
    {
        return $this->page < $this->lastPage();
    }
}
