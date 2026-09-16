<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Services\Import\UploadValidator;

/** spec W: upload validation and safe temp-file resolution - path traversal, arbitrary extensions, and oversized files must never reach the filesystem or the import pipeline. */
final class ImportUploadSecurityTest extends TestCase
{
    public function testUploadValidatorRejectsOversizedAndErroredUploads(): void
    {
        $tooLarge = [
            'name' => 'huge.csv', 'type' => 'text/csv', 'tmp_name' => '/tmp/does-not-matter',
            'error' => UPLOAD_ERR_OK, 'size' => 21 * 1024 * 1024, // over the 20MB cap
        ];
        $result = UploadValidator::validateAndStore($tooLarge, sys_get_temp_dir());
        self::assertFalse($result['ok']);
        self::assertStringContainsString('20 MB', $result['error']);

        $phpLevelTooLarge = [
            'name' => 'x.csv', 'type' => 'text/csv', 'tmp_name' => '',
            'error' => UPLOAD_ERR_INI_SIZE, 'size' => 0,
        ];
        $result = UploadValidator::validateAndStore($phpLevelTooLarge, sys_get_temp_dir());
        self::assertFalse($result['ok']);

        $empty = [
            'name' => 'empty.csv', 'type' => 'text/csv', 'tmp_name' => '/tmp/does-not-matter',
            'error' => UPLOAD_ERR_OK, 'size' => 0,
        ];
        $result = UploadValidator::validateAndStore($empty, sys_get_temp_dir());
        self::assertFalse($result['ok']);
    }

    /** A request that fakes multipart fields but never went through a real HTTP upload (is_uploaded_file() false) is rejected even with an otherwise-valid size/error/extension. */
    public function testUploadValidatorRejectsNonGenuineUpload(): void
    {
        $fakeTmpPath = tempnam(sys_get_temp_dir(), 'not_a_real_upload_');
        file_put_contents($fakeTmpPath, 'a,b,c');
        try {
            $result = UploadValidator::validateAndStore([
                'name' => 'fake.csv', 'type' => 'text/csv', 'tmp_name' => $fakeTmpPath,
                'error' => UPLOAD_ERR_OK, 'size' => 5,
            ], sys_get_temp_dir());
            self::assertFalse($result['ok']);
        } finally {
            @unlink($fakeTmpPath);
        }
    }

    /** spec: a token must be a bare, server-generated UUID shape before any path is built from it - a path-traversal payload or a malformed token is rejected without ever touching the filesystem at an attacker-controlled path. */
    public function testResolveTokenRejectsPathTraversalAndMalformedTokens(): void
    {
        $dir = sys_get_temp_dir() . '/pfs_upload_test_' . bin2hex(random_bytes(4));
        mkdir($dir);
        try {
            self::assertNull(UploadValidator::resolveToken('../../../../etc/passwd', 'csv', $dir));
            self::assertNull(UploadValidator::resolveToken('not-a-uuid-at-all', 'csv', $dir));
            self::assertNull(UploadValidator::resolveToken('', 'csv', $dir));
            // A syntactically valid UUID with a disallowed extension is also rejected.
            self::assertNull(UploadValidator::resolveToken('11111111-1111-1111-1111-111111111111', 'php', $dir));

            // Positive control: a real, server-generated-shaped token whose file actually exists resolves correctly.
            $token = '22222222-2222-2222-2222-222222222222';
            $expectedPath = $dir . '/' . $token . '.csv';
            file_put_contents($expectedPath, 'a,b,c');
            self::assertSame($expectedPath, UploadValidator::resolveToken($token, 'csv', $dir));
        } finally {
            array_map('unlink', glob($dir . '/*') ?: []);
            rmdir($dir);
        }
    }
}
