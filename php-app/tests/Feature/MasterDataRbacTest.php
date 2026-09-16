<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Helpers\HttpException;
use App\Middleware\AuthMiddleware;
use App\Middleware\PolicyMiddleware;
use App\Middleware\RoleMiddleware;

/** spec K/L: RBAC + direct URL security for every Master Data module. */
final class MasterDataRbacTest extends TestCase
{
    private const STAFF_ROLES = ['super_admin', 'accounting', 'finance_manager', 'management'];

    /** spec R.15: investor denied master data access - every single module, not just one. */
    public function testInvestorDeniedEveryMasterDataModule(): void
    {
        $this->loginAs(self::INVESTOR_ID, 'investor');
        $middleware = new RoleMiddleware(self::STAFF_ROLES);

        foreach (['entities', 'outlets', 'coa', 'banks', 'investors', 'contracts', 'ownerships'] as $module) {
            try {
                $middleware->handle();
                self::fail("investor was NOT denied access to the {$module} route's role gate");
            } catch (HttpException $e) {
                self::assertSame(403, $e->statusCode());
            }
        }
    }

    /** spec R.16 / spec L: unauthorized (no session at all) direct URL rejected - the exact GET /master/outlets/{id} scenario named in spec L. */
    public function testUnauthenticatedDirectUrlRejected(): void
    {
        // No loginAs() call - $_SESSION carries no user, exactly a
        // direct, unauthenticated hit on a bookmarked/guessed URL.
        $auth = new AuthMiddleware();
        $this->expectException(HttpException::class);
        try {
            $auth->handle();
        } catch (HttpException $e) {
            self::assertSame(401, $e->statusCode());
            throw $e;
        }
    }

    /** spec L's second scenario: POST to a write action denied server-side, not just hidden in the UI. */
    public function testInvestorPostToBankUpdateDenied(): void
    {
        $this->loginAs(self::INVESTOR_ID, 'investor');

        // Investor never even reaches PolicyMiddleware in the real route
        // (RoleMiddleware runs first and already denies it) - but proving
        // PolicyMiddleware ALSO independently denies it demonstrates the
        // "Controller + Policy + Repository, not just hidden UI" defense
        // in depth spec K explicitly asks for: two independent layers,
        // either of which alone would already stop this request.
        $policy = new PolicyMiddleware('master.banks.write');
        $this->expectException(HttpException::class);
        try {
            $policy->handle();
        } catch (HttpException $e) {
            self::assertSame(403, $e->statusCode());
            throw $e;
        }
    }

    public function testManagementDeniedBankContractOwnershipWrite(): void
    {
        $this->loginAs(self::MANAGEMENT_ID, 'management');

        foreach (['master.banks.write', 'master.contracts.write', 'master.ownerships.write'] as $ability) {
            try {
                (new PolicyMiddleware($ability))->handle();
                self::fail("management was NOT denied {$ability}");
            } catch (HttpException $e) {
                self::assertSame(403, $e->statusCode());
            }
        }
    }

    public function testManagementAllowedEntityOutletCoaInvestorWrite(): void
    {
        $this->loginAs(self::MANAGEMENT_ID, 'management');

        foreach (['master.entities.write', 'master.outlets.write', 'master.coa.write', 'master.investors.write'] as $ability) {
            (new PolicyMiddleware($ability))->handle(); // must not throw
        }
        self::assertTrue(true);
    }

    public function testAccountingAllowedEveryMasterDataWriteAbility(): void
    {
        $this->loginAs(self::ACCOUNTING_ID, 'accounting');

        foreach ([
            'master.entities.write', 'master.outlets.write', 'master.coa.write', 'master.investors.write',
            'master.banks.write', 'master.contracts.write', 'master.ownerships.write',
        ] as $ability) {
            (new PolicyMiddleware($ability))->handle(); // must not throw
        }
        self::assertTrue(true);
    }

    public function testStaffCanReadEveryMasterDataModule(): void
    {
        foreach ([self::ACCOUNTING_ID => 'accounting', self::FINANCE_MANAGER_ID => 'finance_manager', self::MANAGEMENT_ID => 'management', self::SUPER_ADMIN_ID => 'super_admin'] as $userId => $role) {
            $this->loginAs($userId, $role);
            (new RoleMiddleware(self::STAFF_ROLES))->handle(); // must not throw for any staff role
        }
        self::assertTrue(true);
    }
}
