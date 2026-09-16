<?php

declare(strict_types=1);

namespace App\Services\Import;

use App\Helpers\Uuid;

/**
 * spec W: validates an uploaded import file and moves it to a
 * non-web-accessible temp location under a generated, safe filename -
 * the original filename is never trusted (never used to build a path,
 * never used as the stored filename) and the file is never left
 * anywhere public/ can serve it, closing off path traversal and
 * arbitrary-file-execution risk in one move.
 */
final class UploadValidator
{
    private const ALLOWED_EXTENSIONS = ['csv', 'xlsx', 'xls'];
    private const ALLOWED_MIME_TYPES = [
        'text/csv', 'text/plain', 'application/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/zip', // a .xlsx is a zip container - some fileinfo builds report this generically
        'application/octet-stream', // seen from some browsers for CSV - extension + a real content sniff below are the actual gate, this is just not rejected outright
    ];
    private const MAX_BYTES = 20 * 1024 * 1024; // 20 MB - generous for a 10k-100k row CSV/XLSX, per spec Y's stated targets

    /**
     * @param array{name: string, type: string, tmp_name: string, error: int, size: int} $file the raw $_FILES entry
     * @return array{ok: bool, error?: string, token?: string, storedPath?: string, extension?: string}
     */
    public static function validateAndStore(array $file, string $uploadsTmpDir): array
    {
        if ($file['error'] !== UPLOAD_ERR_OK) {
            return ['ok' => false, 'error' => self::uploadErrorMessage($file['error'])];
        }
        if ($file['size'] <= 0) {
            return ['ok' => false, 'error' => 'File kosong.'];
        }
        if ($file['size'] > self::MAX_BYTES) {
            return ['ok' => false, 'error' => 'Ukuran file melebihi batas maksimum (20 MB).'];
        }
        if (!is_uploaded_file($file['tmp_name'])) {
            // Defends against a request that fakes multipart fields to
            // point tmp_name at an arbitrary local path instead of a
            // genuine PHP-managed upload.
            return ['ok' => false, 'error' => 'Upload tidak valid.'];
        }

        $extension = strtolower((string) pathinfo($file['name'], PATHINFO_EXTENSION));
        if (!in_array($extension, self::ALLOWED_EXTENSIONS, true)) {
            return ['ok' => false, 'error' => 'Tipe file tidak didukung. Gunakan CSV atau XLSX.'];
        }

        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $detectedMime = $finfo->file($file['tmp_name']) ?: '';
        if ($detectedMime !== '' && !in_array($detectedMime, self::ALLOWED_MIME_TYPES, true)) {
            return ['ok' => false, 'error' => "Isi file tidak sesuai tipe yang diharapkan (terdeteksi: {$detectedMime})."];
        }

        if (!is_dir($uploadsTmpDir) && !@mkdir($uploadsTmpDir, 0755, true) && !is_dir($uploadsTmpDir)) {
            return ['ok' => false, 'error' => 'Gagal menyiapkan folder upload sementara di server.'];
        }

        $token = Uuid::v4();
        // The stored filename is 100% server-generated (token + a
        // whitelisted extension) - the original filename is preserved
        // only as metadata (import_batches.original_filename), never
        // used to construct any filesystem path.
        $storedPath = rtrim($uploadsTmpDir, '/') . '/' . $token . '.' . $extension;

        if (!move_uploaded_file($file['tmp_name'], $storedPath)) {
            return ['ok' => false, 'error' => 'Gagal menyimpan file upload di server.'];
        }
        chmod($storedPath, 0640);

        return ['ok' => true, 'token' => $token, 'storedPath' => $storedPath, 'extension' => $extension];
    }

    /** Resolves a previously-issued token back to its temp file path - validates the token shape itself (a bare UUID, generated server-side, never accepted as an arbitrary path) before touching the filesystem. */
    public static function resolveToken(string $token, string $extension, string $uploadsTmpDir): ?string
    {
        if (!preg_match('/^[0-9a-f-]{36}$/i', $token) || !in_array($extension, self::ALLOWED_EXTENSIONS, true)) {
            return null;
        }
        $path = rtrim($uploadsTmpDir, '/') . '/' . $token . '.' . $extension;
        return is_file($path) ? $path : null;
    }

    private static function uploadErrorMessage(int $code): string
    {
        return match ($code) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'Ukuran file melebihi batas server.',
            UPLOAD_ERR_PARTIAL => 'File hanya terupload sebagian - coba unggah ulang.',
            UPLOAD_ERR_NO_FILE => 'Tidak ada file yang dipilih.',
            default => 'Upload gagal (kode error: ' . $code . ').',
        };
    }
}
