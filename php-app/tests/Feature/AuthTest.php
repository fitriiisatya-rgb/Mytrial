<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Database\Connection;
use App\Helpers\Csrf;
use App\Helpers\HttpException;
use App\Middleware\AuthMiddleware;
use App\Middleware\CsrfMiddleware;
use App\Services\AuthService;

/**
 * Covers Phase 1 test scenarios 1-6 and 10-13 from the approved spec.
 * Scenarios 7-9 (role permission allow/deny, repository row scope,
 * investor-denied-internal-route) are in RbacTest.php.
 */
final class AuthTest extends TestCase
{
    /** 1. valid login works */
    public function testValidLoginWorks(): void
    {
        $result = (new AuthService())->login('accounting@example.com', self::PASSWORD);

        self::assertTrue($result['success']);
        self::assertSame(self::ACCOUNTING_ID, $result['user']['id']);
        self::assertSame('accounting', $_SESSION['role']);
    }

    /** 2. invalid password rejected */
    public function testInvalidPasswordRejected(): void
    {
        $result = (new AuthService())->login('accounting@example.com', 'wrong-password');

        self::assertFalse($result['success']);
        self::assertSame('invalid_credentials', $result['reason']);
        self::assertArrayNotHasKey('user_id', $_SESSION);
    }

    /** 3. disabled user rejected */
    public function testDisabledUserRejected(): void
    {
        $result = (new AuthService())->login('disabled@example.com', self::PASSWORD);

        self::assertFalse($result['success']);
        self::assertSame('account_disabled', $result['reason']);
    }

    /** 4. session created in DB */
    public function testSessionCreatedInDb(): void
    {
        (new AuthService())->login('accounting@example.com', self::PASSWORD);
        session_write_close();

        self::assertTrue($this->sessionRowExists(session_id()));

        $stmt = Connection::instance()->prepare('SELECT user_id FROM sessions WHERE id = :id');
        $stmt->execute(['id' => session_id()]);
        $row = $stmt->fetch();
        self::assertSame(self::ACCOUNTING_ID, $row['user_id']);
    }

    /** 5. logout invalidates session */
    public function testLogoutInvalidatesSession(): void
    {
        (new AuthService())->login('accounting@example.com', self::PASSWORD);
        session_write_close();
        $sessionId = session_id();
        self::assertTrue($this->sessionRowExists($sessionId));

        // logout() destroys the current session - re-open it under the
        // same id first (mirrors a real request: the id arrives via the
        // cookie, PHP re-attaches to it, then logout() is called).
        SessionBootstrapReopen($sessionId);
        (new AuthService())->logout();

        self::assertFalse($this->sessionRowExists($sessionId));
        self::assertArrayNotHasKey('user_id', $_SESSION);
    }

    /** 6. CSRF invalid request rejected */
    public function testCsrfInvalidRequestRejected(): void
    {
        $_SERVER['REQUEST_METHOD'] = 'POST';
        $_POST['_csrf_token'] = 'not-the-real-token';
        Csrf::token(); // ensures a real token exists in the session to mismatch against

        $this->expectException(HttpException::class);
        try {
            (new CsrfMiddleware())->handle();
        } catch (HttpException $e) {
            self::assertSame(419, $e->statusCode());
            throw $e;
        }
    }

    public function testCsrfValidRequestPasses(): void
    {
        $_SERVER['REQUEST_METHOD'] = 'POST';
        $token = Csrf::token();
        $_POST['_csrf_token'] = $token;

        (new CsrfMiddleware())->handle();
        self::assertTrue(true); // no exception thrown = pass
    }

    /** 10. audit log created for critical action */
    public function testAuditLogCreatedForLogin(): void
    {
        self::assertSame(0, $this->countAuditLogs('login_succeeded'));

        (new AuthService())->login('accounting@example.com', self::PASSWORD);

        self::assertSame(1, $this->countAuditLogs('login_succeeded'));
    }

    /** 11. SQL injection attempt does not break query */
    public function testSqlInjectionAttemptDoesNotBreakQuery(): void
    {
        $before = Connection::instance()->query('SELECT COUNT(*) AS c FROM profiles')->fetch();

        $result = (new AuthService())->login("x' OR '1'='1", 'whatever');

        self::assertFalse($result['success']);
        self::assertSame('invalid_credentials', $result['reason']);

        // The injection string must have been treated as literal data,
        // never as SQL - every seeded profile must still exist untouched
        // (not just "some" - the exact same count as before the attempt).
        $after = Connection::instance()->query('SELECT COUNT(*) AS c FROM profiles')->fetch();
        self::assertSame((int) $before['c'], (int) $after['c']);
    }

    /** 12. session fixation mitigated */
    public function testSessionFixationMitigated(): void
    {
        $preLoginSessionId = session_id();

        (new AuthService())->login('accounting@example.com', self::PASSWORD);

        self::assertNotSame($preLoginSessionId, session_id());
    }

    /** 13. unauthorized direct URL request rejected */
    public function testUnauthorizedDirectUrlRequestRejected(): void
    {
        // No login() call in this test - $_SESSION carries no user_id,
        // exactly the state a direct, unauthenticated URL hit would have.
        $this->expectException(HttpException::class);
        try {
            (new AuthMiddleware())->handle();
        } catch (HttpException $e) {
            self::assertSame(401, $e->statusCode());
            throw $e;
        }
    }
}

/**
 * Test-only helper: re-attaches the PHP session machinery to an
 * already-known session id (simulating "the request arrived with this
 * cookie") before calling AuthService::logout(), which operates on
 * session_id() ambiently exactly like a real request would.
 */
function SessionBootstrapReopen(string $sessionId): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
    \App\Services\SessionBootstrap::reset();
    session_id($sessionId);
    \App\Services\SessionBootstrap::start();
}
