<?php

declare(strict_types=1);

use App\Controllers\AuthController;
use App\Controllers\BankController;
use App\Controllers\BankExpenseImportController;
use App\Controllers\CoaController;
use App\Controllers\ContractController;
use App\Controllers\DemoController;
use App\Controllers\EntityController;
use App\Controllers\HomeController;
use App\Controllers\ImportHistoryController;
use App\Controllers\ImportSourceController;
use App\Controllers\InvestorController;
use App\Controllers\OutletController;
use App\Controllers\OwnershipController;
use App\Controllers\RevenueImportController;
use App\Middleware\AuthMiddleware;
use App\Middleware\CsrfMiddleware;
use App\Middleware\PolicyMiddleware;
use App\Middleware\RoleMiddleware;
use App\Router;

/**
 * Every route in the application, registered against one Router
 * instance. Kept as plain data (no attribute/annotation magic) so "what
 * routes exist and what protects each one" is readable top-to-bottom in
 * a single file - important for a security review of an app with no
 * database-level RLS backstop anymore.
 *
 * Master Data routing convention (Phase 2, spec K/L): EVERY /master/*
 * route requires AuthMiddleware + a staff-only RoleMiddleware - investor
 * is structurally excluded from the allowed-roles list on every single
 * one, so there is no /master/* URL an investor session can ever reach,
 * regardless of which specific action it is (spec L's exact scenario:
 * GET /master/outlets/{id} and POST /master/banks/{id} must both be
 * denied). A write action (create/store/edit/update) additionally
 * requires PolicyMiddleware for the narrower banks/contracts/ownerships
 * roles (excludes `management`) - see app/Policies/Policy.php.
 */
return function (Router $router): void {
    $router->get('/login', fn () => (new AuthController())->showLogin());
    $router->post('/login', fn () => (new AuthController())->login(), [new CsrfMiddleware()]);
    $router->post('/logout', fn () => (new AuthController())->logout(), [new AuthMiddleware(), new CsrfMiddleware()]);

    $router->get('/', fn () => (new HomeController())->index(), [new AuthMiddleware()]);

    // Phase 1 RBAC/row-scoping demo routes - see app/Controllers/DemoController.php.
    $router->get('/demo/internal', fn () => (new DemoController())->internal(), [
        new AuthMiddleware(),
        new RoleMiddleware(['super_admin', 'accounting', 'finance_manager', 'management']),
    ]);
    $router->get('/demo/profile', fn () => (new DemoController())->profile(), [new AuthMiddleware()]);
    $router->get('/demo/manage', fn () => (new DemoController())->manage(), [new AuthMiddleware()]);

    // ---- Master Data ---------------------------------------------------
    $staffOnly = [new AuthMiddleware(), new RoleMiddleware(['super_admin', 'accounting', 'finance_manager', 'management'])];
    $csrf = new CsrfMiddleware();

    $entityWrite = array_merge($staffOnly, [$csrf, new PolicyMiddleware('master.entities.write')]);
    $router->get('/master/entities', fn () => (new EntityController())->index(), $staffOnly);
    $router->get('/master/entities/create', fn () => (new EntityController())->create(), $entityWrite);
    $router->post('/master/entities', fn () => (new EntityController())->store(), $entityWrite);
    $router->get('/master/entities/{id}', fn ($p) => (new EntityController())->show($p), $staffOnly);
    $router->get('/master/entities/{id}/edit', fn ($p) => (new EntityController())->edit($p), $entityWrite);
    $router->post('/master/entities/{id}', fn ($p) => (new EntityController())->update($p), $entityWrite);

    $outletWrite = array_merge($staffOnly, [$csrf, new PolicyMiddleware('master.outlets.write')]);
    $router->get('/master/outlets', fn () => (new OutletController())->index(), $staffOnly);
    $router->get('/master/outlets/create', fn () => (new OutletController())->create(), $outletWrite);
    $router->post('/master/outlets', fn () => (new OutletController())->store(), $outletWrite);
    $router->get('/master/outlets/{id}', fn ($p) => (new OutletController())->show($p), $staffOnly);
    $router->get('/master/outlets/{id}/edit', fn ($p) => (new OutletController())->edit($p), $outletWrite);
    $router->post('/master/outlets/{id}', fn ($p) => (new OutletController())->update($p), $outletWrite);

    $coaWrite = array_merge($staffOnly, [$csrf, new PolicyMiddleware('master.coa.write')]);
    $router->get('/master/coa', fn () => (new CoaController())->index(), $staffOnly);
    $router->get('/master/coa/create', fn () => (new CoaController())->create(), $coaWrite);
    $router->post('/master/coa', fn () => (new CoaController())->store(), $coaWrite);
    $router->get('/master/coa/{id}', fn ($p) => (new CoaController())->show($p), $staffOnly);
    $router->get('/master/coa/{id}/edit', fn ($p) => (new CoaController())->edit($p), $coaWrite);
    $router->post('/master/coa/{id}', fn ($p) => (new CoaController())->update($p), $coaWrite);

    $bankWrite = array_merge($staffOnly, [$csrf, new PolicyMiddleware('master.banks.write')]);
    $router->get('/master/banks', fn () => (new BankController())->index(), $staffOnly);
    $router->get('/master/banks/create', fn () => (new BankController())->create(), $bankWrite);
    $router->post('/master/banks', fn () => (new BankController())->store(), $bankWrite);
    $router->get('/master/banks/{id}', fn ($p) => (new BankController())->show($p), $staffOnly);
    $router->get('/master/banks/{id}/edit', fn ($p) => (new BankController())->edit($p), $bankWrite);
    $router->post('/master/banks/{id}', fn ($p) => (new BankController())->update($p), $bankWrite);

    $investorWrite = array_merge($staffOnly, [$csrf, new PolicyMiddleware('master.investors.write')]);
    $router->get('/master/investors', fn () => (new InvestorController())->index(), $staffOnly);
    $router->get('/master/investors/create', fn () => (new InvestorController())->create(), $investorWrite);
    $router->post('/master/investors', fn () => (new InvestorController())->store(), $investorWrite);
    $router->get('/master/investors/{id}', fn ($p) => (new InvestorController())->show($p), $staffOnly);
    $router->get('/master/investors/{id}/edit', fn ($p) => (new InvestorController())->edit($p), $investorWrite);
    $router->post('/master/investors/{id}', fn ($p) => (new InvestorController())->update($p), $investorWrite);

    $contractWrite = array_merge($staffOnly, [$csrf, new PolicyMiddleware('master.contracts.write')]);
    $router->get('/master/contracts', fn () => (new ContractController())->index(), $staffOnly);
    $router->get('/master/contracts/create', fn () => (new ContractController())->create(), $contractWrite);
    $router->post('/master/contracts', fn () => (new ContractController())->store(), $contractWrite);
    $router->get('/master/contracts/{id}', fn ($p) => (new ContractController())->show($p), $staffOnly);
    $router->get('/master/contracts/{id}/edit', fn ($p) => (new ContractController())->edit($p), $contractWrite);
    $router->post('/master/contracts/{id}', fn ($p) => (new ContractController())->update($p), $contractWrite);

    $ownershipWrite = array_merge($staffOnly, [$csrf, new PolicyMiddleware('master.ownerships.write')]);
    $router->get('/master/ownerships', fn () => (new OwnershipController())->index(), $staffOnly);
    $router->get('/master/ownerships/create', fn () => (new OwnershipController())->create(), $ownershipWrite);
    $router->post('/master/ownerships', fn () => (new OwnershipController())->store(), $ownershipWrite);
    $router->get('/master/ownerships/{id}/end', fn ($p) => (new OwnershipController())->endForm($p), $ownershipWrite);
    $router->post('/master/ownerships/{id}/end', fn ($p) => (new OwnershipController())->end($p), $ownershipWrite);

    // ---- Transaction Import (Phase 3) -----------------------------------
    // Same staff-only/investor-excluded convention as Master Data (spec
    // X): every /import/* URL is unreachable by an investor session,
    // and every mutating action (upload/preview/confirm/cancel) further
    // requires 'import.write' - management can view the upload form and
    // batch results but never trigger an import (see Policy::ABILITIES).
    $importWrite = array_merge($staffOnly, [$csrf, new PolicyMiddleware('import.write')]);
    $router->get('/import/bank-expense', fn () => (new BankExpenseImportController())->form(), $staffOnly);
    $router->post('/import/bank-expense/preview', fn () => (new BankExpenseImportController())->preview(), $importWrite);
    $router->post('/import/bank-expense/confirm', fn () => (new BankExpenseImportController())->confirm(), $importWrite);
    $router->post('/import/bank-expense/cancel', fn () => (new BankExpenseImportController())->cancel(), $importWrite);
    $router->get('/import/bank-expense/batches/{id}', fn ($p) => (new BankExpenseImportController())->showBatch($p), $staffOnly);

    $router->get('/import/revenue', fn () => (new RevenueImportController())->form(), $staffOnly);
    $router->post('/import/revenue/preview', fn () => (new RevenueImportController())->preview(), $importWrite);
    $router->post('/import/revenue/confirm', fn () => (new RevenueImportController())->confirm(), $importWrite);
    $router->post('/import/revenue/cancel', fn () => (new RevenueImportController())->cancel(), $importWrite);
    $router->get('/import/revenue/batches/{id}', fn ($p) => (new RevenueImportController())->showBatch($p), $staffOnly);

    $router->get('/import/history', fn () => (new ImportHistoryController())->index(), $staffOnly);

    $importSourcesWrite = array_merge($staffOnly, [$csrf, new PolicyMiddleware('import.sources.write')]);
    $router->get('/import/sources', fn () => (new ImportSourceController())->index(), $staffOnly);
    $router->get('/import/sources/create', fn () => (new ImportSourceController())->create(), $importSourcesWrite);
    $router->post('/import/sources', fn () => (new ImportSourceController())->store(), $importSourcesWrite);
    $router->get('/import/sources/{id}/edit', fn ($p) => (new ImportSourceController())->edit($p), $importSourcesWrite);
    $router->post('/import/sources/{id}', fn ($p) => (new ImportSourceController())->update($p), $importSourcesWrite);
};
