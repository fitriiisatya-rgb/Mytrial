<?php

declare(strict_types=1);

/**
 * Deletes abandoned temp uploads from storage/uploads/import-tmp/ - a
 * file lands there the moment someone uploads a Buku Bank export
 * (UploadValidator::validateAndStore()) and is only ever cleaned up by
 * the app itself on a successful confirm or an explicit cancel
 * (BankExpenseImportController::confirm()/cancel()). A user who closes
 * the tab at the preview/select-header step instead leaves the file
 * behind indefinitely - on cPanel shared hosting's limited disk quota
 * that is worth clearing out on a schedule rather than never.
 *
 * Intended as a cPanel Cron Job (not a persistent process - see
 * CPANEL_DEPLOYMENT_NOTES.md's "Cron assumptions"):
 *   php /home/youraccount/php-app/cron/cleanup_import_tmp.php
 * Safe to run as often as hourly; anything older than 24h is removed.
 */

require_once dirname(__DIR__) . '/app/bootstrap.php';

const MAX_AGE_SECONDS = 24 * 60 * 60;

$dir = config('app.storage_path') . '/uploads/import-tmp';
if (!is_dir($dir)) {
    exit(0);
}

$now = time();
$removed = 0;
foreach (scandir($dir) ?: [] as $entry) {
    if ($entry === '.' || $entry === '..' || $entry === '.gitkeep') {
        continue;
    }
    $path = $dir . '/' . $entry;
    if (is_file($path) && ($now - (int) filemtime($path)) > MAX_AGE_SECONDS) {
        @unlink($path);
        $removed++;
    }
}

echo "cleanup_import_tmp: removed {$removed} file(s) older than 24h from {$dir}\n";
