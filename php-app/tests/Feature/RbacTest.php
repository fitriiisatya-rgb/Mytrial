<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Helpers\HttpException;
use App\Middleware\RoleMiddleware;
use App\Policies\Policy;
use App\Repositories\ProfileRepository;
use App\Services\AuthService;

final class RbacTest extends TestCase
{
    /** 7. role permission allow/deny works */
    public function testRolePermissionAllowDenyWorks(): void
    {
        (new AuthService())->login('accounting@example.com', self::PASSWORD);
        $accounting = AuthService::currentUser();
        self::assertTrue(Policy::can($accounting, 'demo.manage'));

        $this->startFreshSession();
        (new AuthService())->login('investor@example.com', self::PASSWORD);
        $investor = AuthService::currentUser();
        self::assertFalse(Policy::can($investor, 'demo.manage'));
    }

    /** 8. repository row scope works - an investor's own-profile lookup can only ever return their own row. */
    public function testRepositoryRowScopeWorks(): void
    {
        $repo = new ProfileRepository();

        $own = $repo->findOwnProfileOnly(self::INVESTOR_ID);
        self::assertNotNull($own);
        self::assertSame(self::INVESTOR_ID, $own['id']);

        // There is no parameter this method accepts that could make it
        // return the accounting profile instead - by construction, not
        // by an if-check that could be forgotten in a future edit.
        self::assertNotSame(self::ACCOUNTING_ID, $own['id']);
    }

    /** 9. investor cannot access internal route */
    public function testInvestorCannotAccessInternalRoute(): void
    {
        (new AuthService())->login('investor@example.com', self::PASSWORD);

        $middleware = new RoleMiddleware(['super_admin', 'accounting', 'finance_manager', 'management']);

        $this->expectException(HttpException::class);
        try {
            $middleware->handle();
        } catch (HttpException $e) {
            self::assertSame(403, $e->statusCode());
            throw $e;
        }
    }

    public function testStaffCanAccessInternalRoute(): void
    {
        (new AuthService())->login('accounting@example.com', self::PASSWORD);

        $middleware = new RoleMiddleware(['super_admin', 'accounting', 'finance_manager', 'management']);
        $middleware->handle();

        self::assertTrue(true); // no exception thrown = pass
    }

    public function testAccessDeniedIsAudited(): void
    {
        (new AuthService())->login('investor@example.com', self::PASSWORD);

        try {
            (new RoleMiddleware(['accounting']))->handle();
        } catch (HttpException) {
            // expected
        }

        self::assertSame(1, $this->countAuditLogs('access_denied'));
    }
}
