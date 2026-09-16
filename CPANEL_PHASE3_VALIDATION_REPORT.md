# cPanel MySQL Phase 3 Validation Report — Transaction Import

Builds on Phase 1 Core Foundation (PASS) and Phase 2 Master Data (PASS). Implements `CPANEL_MYSQL_IMPLEMENTATION_PLAN.md`'s Phase 3 for the PHP/MySQL track: Bank Expense import and Revenue import, both CSV *and* XLSX, under `php-app/`. No Phase 1/2 architecture was changed without strong reason — only two shared files were touched at all (`app/Policies/Policy.php` gained two new abilities, additive; `resources/views/layouts/app.php` gained one new sidebar link, additive) and `tests/Feature/TestCase.php` gained schema/table-reset entries for the new tables, none of which alter any existing behavior.

## Pages Built

- `/import/bank-expense` — upload form, preview (auto or manual header-row selection), confirm, batch detail
- `/import/revenue` — same flow, Revenue's simpler field set (no debit/credit ladder)
- `/import/history` — combined batch history across both source types, filterable by type/status/entity
- `/import/sources` (+ create/edit) — named, reusable upload sources with an optional saved column mapping (spec O)

All four render behind one small server-rendered "tab bar" (this app has no client-side JS framework — tabs are four ordinary links, the active one highlighted) satisfying the "4 tabs: Pengeluaran Bank, Penerimaan, Riwayat Import, Sumber Data" requirement without introducing any new frontend dependency.

## Tables / Migrations

`database/schema/0003_transaction_import.sql` — `import_sources`, `import_batches`, `raw_import_rows`, `normalized_bank_transactions`, `normalized_revenue_transactions`. All `InnoDB`/`utf8mb4`, `CHAR(36)` app-generated UUIDs, `DECIMAL(20,2)` money (never `FLOAT`), every index from spec Z's list present (`fingerprint`, `dedupe_key` `UNIQUE`, `duplicate_status`, `validation_status`, `transaction_date`, `bank_account_id`/`outlet_id`, batch, source_type, created_at). Verified installing cleanly from empty both via `php database/migrate.php` (idempotent — a second run correctly reports all three schema files "already applied") and via the exact raw-SQL-import path PHPUnit's own `TestCase::ensureSchema()` exercises on every single test run (94 runs during this validation, 0 failures).

## Money / Date / Fingerprint Parsing

`MoneyParser` (sen-integer, never a float) handles dot-thousands, comma-thousands, dot-thousands+comma-decimal, comma-thousands+dot-decimal, single-separator digit-count disambiguation, and parentheses-as-negative — all verified against the exact examples in the spec plus the sanitized fixture's own values (`1.500,50` → 150050 sen, `(50.000)` → −5000000 sen). `DateParser` tries `d/m/Y`, `d-m-Y`, `Y-m-d`, `Y/m/d` in order with strict `checkdate()` validation (a calendar-impossible date like `31/02/2026` returns `null`, never a "closest guess") plus Excel serial-number support for XLSX cells PhpSpreadsheet leaves as raw numbers. `FingerprintCalculator` hashes the normalized identity fields per transaction type (bank expense: bank+date+classification+description+credit; revenue: outlet+date+category+description+amount+external reference) — deliberately **not** the sole duplicate signal (see Duplicate Detection below).

## CSV + XLSX Readers

`CsvReader` streams via `fopen`/`fgetcsv` (BOM-strip, delimiter-sniff) with zero runtime dependency. `XlsxReader` wraps PhpSpreadsheet (`setReadDataOnly(true)`, `getFormattedValue()` on every cell) so both readers emit the same plain display strings into the identical downstream classify/normalize pipeline — verified directly: `tests/Feature/BankImportPipelineTest::testSanitizedFixtureCsvAndXlsxProduceIdenticalClassification()` runs the *same* fixture content through both readers and asserts every row's classification (fingerprint, occurrence_index, validation_status, transaction_type, parsed amounts) is identical between formats.

## Header Detection + Column Mapping

`HeaderDetector::detect()` scores each of the first 30 rows against a known column-label signature and returns the best match only above a minimum threshold — never assumes row 1, correctly finds the header past a multi-row title block + blank line (verified both as a unit test and inside the sanitized fixture, whose header sits on row 4). Below-threshold/no-match returns `null`, and the Controller falls back to a manual header-row-selection page listing the first 30 rows for a human to pick from — verified live via HTTP with a deliberately unrecognizable header row, including the follow-up case where the *chosen* row still fails column mapping (missing a required field), which correctly re-shows the same manual-selection page with a specific error rather than dead-ending. `ColumnMapper` maps by header-label synonym by default, or uses a saved `import_sources.column_mapping` verbatim when one is selected on upload — verified live: a file whose header row uses completely unrecognized labels ("Acc,Dt,Branch,Type,Note,Out,In,Bal") still classifies every row correctly once a saved source's mapping is applied, proving the saved mapping genuinely bypasses re-detection rather than merely supplementing it.

## Bank Matching + Row Classification

`BankMatcher`/`OutletMatcher` do exact match then normalized-exact (trim/lowercase/collapse-whitespace) only — never fuzzy, never auto-creates a missing bank/outlet. `BankRowClassifier` runs the validation ladder (invalid_date > invalid_amount > negative_amount > both_debit_credit > bank_not_found > valid) and the transaction-type decision (expense_candidate / debit_only_ignored / not_candidate / invalid) exactly per spec; `RevenueRowClassifier` is the simpler analogous ladder (invalid_date > invalid_amount > outlet_not_found > valid) with **no accounting treatment decided here at all** — Revenue import creates no journal entries and hardcodes no Dr/Cr account, exactly as required.

## Duplicate Detection — the critical requirement

Two independent, deliberately layered signals, exactly per spec J:

1. **Whole-file SHA-256 checksum** against a prior **completed** batch of the same `source_type` is the authoritative "is this literally the same file again" signal — a failed/never-finished batch never counts (its rows never survived the rolled-back transaction, so there's nothing to be a duplicate of). This is what makes same-file re-import provably idempotent, verified for both Bank Expense and Revenue: importing a file, then re-importing the byte-identical file, produces zero new database rows and flags every row `duplicate_exact`.
2. **Fingerprint + purely-intra-file occurrence_index** is the fallback signal for "does this row's content pattern resemble something already imported from a DIFFERENT file" — flagged `duplicate_suspected` and **always inserted, never silently discarded**, because a fingerprint match alone is not proof of an actual duplicate (spec's carried-over lesson: two genuinely repeated real transactions, same day/amount/description/classification, must never be treated as duplicates of each other). occurrence_index is computed purely from a row's position among same-fingerprint rows *within the current file's own order* — never from cumulative database state — which is exactly what keeps re-importing the identical file byte-for-byte reproducible.

`dedupe_key` folds the file's own checksum (truncated) into `fingerprint#occurrence_index`, closing a real bug found during Phase 3 development (see Bugs Found & Fixed #1) where a `duplicate_suspected` row from a different file could otherwise collide on the `UNIQUE` constraint against an unrelated row that happened to land on the same in-file occurrence number.

## Bank Expense Import (upload → preview → confirm)

`BankImportPipeline::analyze()` is read-only (safe to call repeatedly — the preview page calls it, and `commit()` calls it again fresh rather than trusting a client-supplied preview result) and `commit()` performs the actual writes inside one MySQL transaction. Row-level fault tolerance confirmed: a single row's insert failure is recorded against its own `raw_import_rows` entry (never a duplicate second raw-row insert for the same source line) and the batch continues — only a file-unreadable/header-unmappable/database-transaction-fatal error aborts the whole batch. `UploadValidator` handles the upload→temp-storage step (see Upload Security below); a `cron/cleanup_import_tmp.php` job (new, cPanel Cron, not a resident process) sweeps any abandoned temp upload older than 24 hours.

## Revenue Import

Same upload→preview→confirm shape as Bank Expense, its own Controller/Pipeline/Classifier (kept separate rather than parameterized — the field sets and validation ladders differ enough that sharing would mean branching throughout, which is harder to follow than two small parallel implementations). Outlet matching, date/amount validation, and the identical two-signal duplicate-detection discipline all verified with dedicated tests and live HTTP smoke tests, including the case where two same-day/same-amount rows carry *different* external references and correctly remain distinct (never conflated) because the reference is folded into the fingerprint.

## Import History + Sources UI

`/import/history` lists every batch (both source types) with source_type/status/entity filters, each row linking to its own type-specific detail page. `/import/sources` is a small CRUD (name, source_type, optional entity, optional JSON column-mapping, active/inactive) — a blank mapping means "use default synonym detection"; a non-blank one is validated field-name-by-field-name against `ColumnMapper`'s recognized fields for that source type before being saved, so a saved source can never later feed the pipeline a mapping that silently omits a required field. Selecting a saved source on upload auto-fills the source name and passes its mapping straight into `analyze()`/`commit()`, verified live end-to-end (see Header Detection above).

## RBAC

Same two-layer discipline as every prior phase, applied uniformly to all four `/import/*` areas:
1. **Route-level `RoleMiddleware`** (`super_admin`/`accounting`/`finance_manager`/`management`) on every read route — investor is structurally absent from that list, confirmed by direct HTTP request for every one of: upload forms, batch detail pages (both source types — including via the raw normalized-row detail table, never just the summary), history, and sources.
2. **`PolicyMiddleware('import.write')` / `PolicyMiddleware('import.sources.write')`** on every write route (preview/confirm/cancel/source create+update) — excludes `management`, mirroring the banks/contracts/ownerships pattern from Phase 2 (management may view import results but never trigger an import or manage sources). Verified live: management gets 403 on `GET /import/sources/create` (blocked before ever reaching a CSRF-protected form) and on `POST /import/bank-expense/preview` / `POST /import/revenue/preview` / `POST /import/sources`; accounting/finance_manager/super_admin confirmed allowed on all of the above.

## Audit

Batch-level only, never per-row (explicit spec requirement, to avoid a 12,000-row import producing 12,000 audit rows) — `AuditService::log('import_batch_completed', ...)` fires exactly once per successfully completed batch, verified directly: `ImportRbacAuditTest::testImportProducesExactlyOneBatchLevelAuditEntryNeverPerRow()` imports the 10-row sanitized fixture and asserts the audit-log count increases by exactly 1. `ImportSourceService` create/update also each log one entry, same existing `AuditService` infrastructure, no new mechanism introduced.

## Upload Security

`UploadValidator` checks (in order): PHP-level upload error code, size bounds (0 < size ≤ 20MB), `is_uploaded_file()` (rejects a request faking multipart fields to point at an arbitrary local path), extension whitelist (`csv`/`xlsx`/`xls`), and MIME-sniffing via `finfo` against an allow-list. Every accepted file is renamed to a server-generated UUID before being written — the original filename is kept only as display metadata, never used to build any filesystem path — and stored `chmod 0640` under `storage/uploads/import-tmp/`, outside `public/`. Reading a file back on confirm (`resolveToken()`) requires the token to match a bare-UUID shape via regex *before* any path is built — verified live with an actual path-traversal payload (`../../../../etc/passwd`) as the token, which is rejected by the shape check alone, never reaching the filesystem, and confirmed again as a dedicated PHPUnit test (`ImportUploadSecurityTest`).

## MySQL Validation

All against the same real, locally-installed MariaDB 10.11 instance every prior phase used (never mocked):

- Schema 0003 installs cleanly from empty, confirmed via `php database/migrate.php` (fresh + idempotent re-run) and via PHPUnit's own fresh-schema-per-suite path.
- Every FK relationship (`import_batches→import_sources`/`entities`/`profiles`, `raw_import_rows→import_batches` CASCADE, `normalized_bank_transactions→import_batches` CASCADE/`raw_import_rows`/`banks`, `normalized_revenue_transactions→import_batches` CASCADE/`raw_import_rows`/`outlets`) confirmed working via successful inserts across every test and smoke run.
- `UNIQUE` constraint on `dedupe_key` confirmed doing its actual job: a genuine same-file re-import's rows are skipped *before* ever reaching the insert (via the checksum + `duplicate_exact` short-circuit in `commit()`), while a cross-file `duplicate_suspected` row's key is proven collision-free (checksum-prefixed) and does get inserted — both directions verified live and in `BankImportPipelineTest`.
- Real MySQL/PDO mechanics correctly handled: `ATTR_EMULATE_PREPARES = false` real prepared statements throughout every new Repository (no repeated placeholder names, learned from Phase 1/2's own bug history and written correctly from the start this time).

## Real/Sanitized Data Validation Run + Statistics

No real Buku Bank file exists anywhere in this environment (there never was one available to this session, consistent with the standing rule that a real file must never be committed) — validation instead used (a) the committed sanitized fixture's 10 documented edge cases and (b) a synthetic, invented-data file sized to the spec's stated performance target, generated and immediately discarded (never committed):

**Sanitized fixture (`tests/Fixtures/bank_expense_sanitized.{csv,xlsx}`, 10 edge cases, both formats)**: header found on row 4 (index 3) despite a 2-row title block + blank line, full 8/8 signature score; a repeated identical transaction correctly gets distinct occurrence_index 1/2 and both are kept; dot-thousands and dot-thousands+comma-decimal money formats both parse correctly; parentheses-negative correctly flags `negative_amount`; debit-only correctly `debit_only_ignored`; both-debit-and-credit correctly `both_debit_credit`; an unmatched bank label correctly `bank_not_found` while still counting as a candidate; a calendar-impossible date correctly `invalid_date` with a `null` parsed date. CSV and XLSX produce byte-for-byte identical classification for all 9 substantive rows (CSV's 10th row is a trailing blank line the format itself represents as a row; XLSX has no equivalent row since an empty XLSX row with no cells set isn't materialized — a known, harmless format difference, not a classification discrepancy).

**Synthetic performance run (12,000 rows, 1.06 MB CSV, invented data, discarded after the run)**:
```
analyze() time:  2.863s
commit() time:   8.304s   (includes an internal second analyze() call)
reimport time:   2.465s   (all 12,000 rows correctly duplicate_exact, 0 new rows)

stats: {
  "total_rows": 12000, "candidate_rows": 10800, "valid_rows": 10200,
  "ignored_rows": 600, "duplicate_rows": 0, "suspected_duplicate_rows": 0,
  "error_rows": 600, "bank_matched_rows": 10800, "bank_not_found_rows": 1200
}
DB rows after commit: normalized_bank_transactions=12000, raw_import_rows=12000
DB rows after reimport (unchanged): 12000
```
This run is what surfaced Bugs Found & Fixed #2 below — no fixture used earlier in development had exceeded the header-detector's 30-row peek window, so the crash it caused was latent until this exact validation step. Meets spec Y's stated "10k+ rows/file" target with comfortable headroom (~8.3s, against a recommended 120s `max_execution_time` — see `CPANEL_DEPLOYMENT_NOTES.md`). The DEV database and all synthetic rows/entities created for this run were deleted immediately afterward; nothing synthetic was left behind.

## cPanel Compatibility

- `composer.json` gains its **first real runtime dependency**: `phpoffice/phpspreadsheet` (^5.9), used by exactly one class (`XlsxReader`) — CSV import has zero dependency on it. `vendor/` remains git-ignored and built locally/CI (`composer install --no-dev --optimize-autoloader`); **Composer itself never needs to run on the cPanel server**, satisfying the standing constraint unchanged from Phase 1.
- `CPANEL_DEPLOYMENT_NOTES.md` updated with: the new extensions PhpSpreadsheet needs (`zip`, `xml`/`xmlreader`/`xmlwriter`, already-present `mbstring`), recommended `upload_max_filesize`/`post_max_size`/`max_execution_time`/`max_input_time`/`memory_limit` values sized directly against this phase's own measured 12,000-row run, the new `storage/uploads/import-tmp/` folder permissions, the new `cron/cleanup_import_tmp.php` cron line, and Phase-3-specific upload-security notes.
- No Node runtime, no persistent worker/daemon, no Redis, no Docker, no Supabase/Postgres dependency anywhere in the new code — the only thing resembling a "background process" is the cron-triggered cleanup script, which runs once, does its work, and exits, exactly matching every other scheduled task in this project's design.

## Bugs Found & Fixed

1. **`dedupe_key` collision silently swallowing a genuine `duplicate_suspected` row.** Original `dedupe_key` was `fingerprint#occurrence_index` alone. Since `occurrence_index` is computed purely from position *within one file*, a different file's row sharing a fingerprint with an already-imported row could get the *same* occurrence_index as that earlier row, colliding on the `UNIQUE` constraint — the insert then threw, was caught by the generic per-row error handler, and was silently counted as an "error" row instead of the intended "suspected duplicate, still inserted" outcome. Caught via live smoke-testing two related files. **Fixed** by prefixing the key with the importing file's own truncated checksum, making every genuinely-inserted row's key globally unique across different files while a true same-file re-import still reproduces the identical key deterministically (moot in practice, since those rows are `duplicate_exact` and skipped before ever reaching the insert). Re-verified via the exact repro sequence plus a dedicated regression test (`BankImportPipelineTest::testCrossFileSharedFingerprintFlaggedSuspectedAndStillInserted`).
2. **Fatal "Cannot rewind a generator that was already run" on any file larger than the 30-row header-detection peek window.** `analyze()` peeks up to 30 rows into a buffer via `foreach ($generator as ...)`, then needed to keep reading the rest of a larger file from the *same* still-open generator — the original code did this with a *second* `foreach`, but `foreach` always calls `Generator::rewind()` first, which PHP throws on for any generator already advanced past its first element. Every file with more than 30 data rows hit this immediately; every fixture used up to that point in development (including all 20+ dedicated PHPUnit tests) happened to be under 30 rows, so the bug was completely latent until the Real/Sanitized Data Validation Run's 12,000-row synthetic file (this task, #105) surfaced it on the very first attempt. **Fixed** in both `BankImportPipeline` and `RevenueImportPipeline` by continuing the same generator's own cursor (`key()`/`current()`/`next()`) in a `while` loop instead of a second `foreach`. Re-verified: the 12,000-row run then completed successfully end-to-end (analyze, commit, and idempotent reimport all correct), and a dedicated 50-row regression test now exists in both pipeline test files specifically to keep this path exercised at normal test-suite scale, not just at synthetic-performance scale.
3. **Duplicate `raw_import_rows` entries on a per-row insert failure.** Originally, catching an exception during the normalized-row insert called `insertRawRow()` a *second* time with `parse_status='error'`, creating a second raw-row entry for the same source line (the first one, marked `'ok'`, already existed from earlier in the loop). **Fixed** by tracking the first insert's row id and calling a new `markRawRowError()` repository method (an `UPDATE`, not a second `INSERT`) on a later failure instead.

None of these were design flaws in the business rules themselves (the two-signal duplicate-detection strategy, the row-level fault-tolerance requirement, and the streaming-reader approach were all correct in intent from the start) — all three were PHP/PDO/MySQL mechanics-level bugs caught by writing and running real tests and real smoke tests against real data at realistic scale, exactly the discipline every prior phase's report has followed, and a direct demonstration of why this task (#105, running a real validation pass at the spec's actual stated scale) exists as its own required step rather than being assumed covered by smaller unit tests.

## Remaining Risks

1. **No real cPanel account was available to test the actual phpMyAdmin-import/upload flow, or the recommended `upload_max_filesize`/`memory_limit` INI values, on a real shared-hosting environment** — same standing caveat as every prior phase's report. The schema is plain, portable SQL; the recommended PHP settings are derived from a real measured run, not guesswork, but the specific hosting provider's actual enforcement of those settings (some cheap shared plans cap `max_execution_time` below what a host-level admin can override) remains unverified until a real deployment.
2. **No real Buku Bank or Revenue export file was ever available in this environment** to validate against — the sanitized fixture is deliberately designed to cover every documented edge case from the spec's carried-over lessons, and the synthetic performance file proves scale, but neither is a substitute for a first real production import being watched closely the first few times it runs.
3. **The "future 1M rows" target is explicitly out of scope for Phase 3 as built** (documented in `CPANEL_DEPLOYMENT_NOTES.md`) — a single PHP-per-request import at that scale would need chunked/background processing, which is a different design, not a bigger timeout.
4. **A saved Import Source's column mapping, once saved, is not re-validated against a specific upload's actual header row shape until that upload happens** — an intentionally recognized tradeoff (the mapping is validated field-name-by-field-name at save time against the source type's known fields, which is the failure mode that actually matters: a mapping that omits a required field). If a saved mapping's column *indices* stop matching a since-changed export format, the resulting misclassification would only surface at preview time, where the reviewer is expected to check the stats/samples before confirming — this is the same trust boundary every ad-hoc (non-saved-source) upload already has.

## Gate

- [x] PHP lint PASS — every file under `app/`, `config/`, `database/`, `resources/`, `tests/`, `cron/`, 0 syntax errors
- [x] Unit/integration tests PASS — 94/94 PHPUnit tests, 300/300 assertions, 0 failures, 0 deprecations (60 pre-existing Phase 1/2 tests + 34 new Phase 3 tests, well over the 20 required scenarios)
- [x] MySQL migration fresh install PASS — verified via `php database/migrate.php` (idempotent) and PHPUnit's own fresh-schema path (94 runs)
- [x] Sanitized fixture PASS — all 10 documented edge cases correct, CSV and XLSX produce identical classification
- [x] Real/sanitized-scale performance PASS — 12,000-row synthetic run completes in ~8.3s, fully idempotent on reimport, meets spec Y's 10k+ rows/file target
- [x] Duplicate detection PASS — same-file reimport 100% idempotent; cross-file suspected duplicates correctly inserted, never silently dropped; genuinely repeated same-day/amount/description transactions never falsely deduped
- [x] RBAC tests PASS — investor denied every import route (upload, preview/confirm/cancel, batch detail, history, sources — read and write); management denied all import/source write actions while retaining read access; accounting/finance_manager/super_admin full access confirmed
- [x] Audit PASS — exactly one batch-level entry per completed import, never per-row
- [x] Upload security PASS — extension/MIME/size validation, non-web-accessible storage, path-traversal-resistant token resolution, all verified live and via dedicated tests
- [x] No secret committed — `.env`/`.env.testing`/`vendor/`/`.phpunit.result.cache`/log files/`storage/uploads/*` all confirmed `.gitignore`d and absent from `git status`; no real Buku Bank/Revenue file exists anywhere in this repository
- [x] No production-breaking dependency — the one new runtime dependency (`phpoffice/phpspreadsheet`) is documented, `vendor/`-built-locally, never requires Composer on the production server; zero Node/Redis/Docker/Supabase/Postgres references anywhere in the new code

cPanel MySQL Phase 3 Import PASS. Ready for Phase 4 Mapping / Exception.
