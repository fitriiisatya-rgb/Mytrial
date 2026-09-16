<?php

declare(strict_types=1);

/**
 * Schema migration runner - the PHP/cPanel-friendly equivalent of
 * `supabase db reset`. Applies every database/schema/*.sql file in
 * filename order that isn't already recorded in schema_migrations,
 * inside one transaction per file. Safe to re-run: an already-applied
 * file is skipped, never re-executed.
 *
 * Usage:
 *   php database/migrate.php            # apply pending schema files
 *   php database/migrate.php --seed      # also apply database/seeds/*.sql
 *
 * On a cPanel host without SSH, the very first run instead happens by
 * importing database/schema/*.sql directly via phpMyAdmin in filename
 * order (schema_migrations is still created by 0001, so a later CLI
 * run - if SSH ever becomes available - correctly sees those as already
 * applied and does not re-run them). See CPANEL_DEPLOYMENT_NOTES.md.
 */

require_once __DIR__ . '/../app/bootstrap.php';

use App\Database\Connection;

function migrate_apply_directory(string $dir, PDO $pdo, bool $trackApplied): void
{
    $files = glob($dir . '/*.sql');
    if ($files === false) {
        return;
    }
    sort($files, SORT_STRING);

    $applied = [];
    if ($trackApplied) {
        $stmt = $pdo->query('SELECT id FROM schema_migrations');
        $applied = $stmt ? $stmt->fetchAll(PDO::FETCH_COLUMN) : [];
    }

    foreach ($files as $file) {
        $name = basename($file);
        if ($trackApplied && in_array($name, $applied, true)) {
            echo "  skip  (already applied) {$name}\n";
            continue;
        }

        $sql = file_get_contents($file);
        if ($sql === false) {
            throw new RuntimeException("Could not read migration file: {$file}");
        }

        echo "  apply {$name}\n";
        // NOTE: DDL (CREATE TABLE, ALTER TABLE, ...) causes an implicit
        // COMMIT in MySQL/InnoDB - a schema file cannot be wrapped in one
        // rollback-able transaction the way a Postgres migration could.
        // Every CREATE TABLE below uses "IF NOT EXISTS" specifically so a
        // migration that fails partway through can simply be re-run after
        // the underlying issue is fixed, rather than needing manual cleanup.
        try {
            foreach (migrate_split_statements($sql) as $statement) {
                $statement = trim($statement);
                if ($statement === '') {
                    continue;
                }
                $pdo->exec($statement);
            }
            if ($trackApplied) {
                $insert = $pdo->prepare('INSERT INTO schema_migrations (id) VALUES (:id)');
                $insert->execute(['id' => $name]);
            }
        } catch (Throwable $e) {
            throw new RuntimeException("Migration failed in {$name}: " . $e->getMessage(), 0, $e);
        }
    }
}

/**
 * Splits a .sql file into individual statements on a semicolon at the
 * end of a line, skipping '--' comment-only lines. Deliberately simple
 * (no full SQL parser) - every schema file in this project is written
 * with one statement per logical block and no semicolons inside string
 * literals, which is true of every schema/*.sql file we write ourselves.
 *
 * @return list<string>
 */
function migrate_split_statements(string $sql): array
{
    $lines = explode("\n", $sql);
    $statements = [];
    $current = '';
    foreach ($lines as $line) {
        $trimmed = ltrim($line);
        if (str_starts_with($trimmed, '--')) {
            continue;
        }
        $current .= $line . "\n";
        if (str_ends_with(rtrim($line), ';')) {
            $statements[] = $current;
            $current = '';
        }
    }
    if (trim($current) !== '') {
        $statements[] = $current;
    }
    return $statements;
}

$pdo = Connection::instance();

// schema_migrations itself must exist before we can query it - 0001's
// first statement creates it "IF NOT EXISTS", so this bootstrap query is
// safe even on a completely empty database.
$pdo->exec('CREATE TABLE IF NOT EXISTS schema_migrations (
  id VARCHAR(255) NOT NULL PRIMARY KEY,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

echo "Applying schema migrations...\n";
migrate_apply_directory(__DIR__ . '/schema', $pdo, true);

if (in_array('--seed', $argv, true)) {
    echo "Applying seeds...\n";
    migrate_apply_directory(__DIR__ . '/seeds', $pdo, false);
}

echo "Done.\n";
