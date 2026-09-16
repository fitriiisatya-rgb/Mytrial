# cPanel Deployment Notes

Covers the PHP application under `php-app/` in this repository. Written for whoever performs the actual cPanel deployment (you, or hosting support) — read this before uploading anything.

## PHP version requirement

- **PHP 8.1 or newer** (developed and tested against PHP 8.4; `composer.json` declares `"php": ">=8.1"`). Set this in cPanel's "MultiPHP Manager" (or "Select PHP Version") for the domain/subdomain before uploading — the app will fatal-error on PHP 7.x (uses constructor property promotion, readonly properties, `match`, first-class enum-free typed unions — all 8.0+/8.1+ syntax).
- Confirm via SSH (`php -v`) if available, or by uploading a throwaway `phpinfo.php` to a test path and deleting it immediately after checking (never leave a `phpinfo()` file reachable — it discloses server configuration).

## Required PHP extensions

All of these are enabled by default on virtually every cPanel PHP build, but confirm in "MultiPHP INI Editor" → PHP Extensions before deploying:

| Extension | Used for |
|---|---|
| `pdo_mysql` | The only database driver this app uses — `App\Database\Connection` |
| `mbstring` | UTF-8-safe string handling (Indonesian text, Rupiah formatting) |
| `json` | `audit_log` JSON columns, JSON API responses |
| `session` | Core PHP session support (the app supplies its own DB-backed save handler on top of this) |
| `openssl` or `sodium` (either) | `random_bytes()` (UUIDs, CSRF tokens, session ids) — PHP's CSPRNG works via either; virtually always available regardless of which |

Phase 1/2 required no Composer package at runtime. **Phase 3 (Import) adds the first real runtime dependency: `phpoffice/phpspreadsheet` (^5.9)**, used for `.xlsx` reading (`App\Services\Import\XlsxReader`) — CSV import (`App\Services\Import\CsvReader`) still uses only native PHP (`fgetcsv`) and has no dependency at all. PhpSpreadsheet itself additionally needs:

| Extension | Used for |
|---|---|
| `zip` | Reading the `.xlsx` container (an XLSX file is a ZIP archive internally) |
| `xml` / `xmlreader` / `xmlwriter` | Parsing the XLSX's internal XML sheet data |
| `gd` or `mbstring` (mbstring already required above) | String/formatting helpers PhpSpreadsheet's reader path touches — `gd` specifically only matters for chart/image features this app never uses, so its absence is not a blocker for import |

All of the above are standard on cPanel's default PHP builds; confirm in "MultiPHP INI Editor" → PHP Extensions same as the Phase 1 list. `phpunit/phpunit` remains `require-dev` (tests only, never uploaded — see "vendor/ upload notes" below).

## Folder permissions

| Path | Permission | Why |
|---|---|---|
| `storage/logs/` | `755` dir, writable by the PHP process (`chmod 755` is usually enough on cPanel's suPHP/PHP-FPM-as-account-user setup; if the host runs PHP as a different user than file ownership, `775` or a cPanel-specific ACL may be needed — check with hosting support) | `App\Helpers\ErrorHandler` writes here on every uncaught exception |
| `storage/uploads/import-tmp/` | Same as above, `chmod 0640` on files created within it (done automatically by `UploadValidator`) | Phase 3's temp holding area for an uploaded Buku Bank/Revenue file between "upload" and "confirm" — outside `public/`, never web-servable, filenames are server-generated UUIDs (never the original filename) |
| `storage/sessions/` | Same as above | Currently unused (sessions are DB-backed by default — see below); kept only as the documented fallback path if a specific host makes DB sessions impractical |
| Everything else | `644` files / `755` dirs (cPanel's normal default) | No other path needs write access |
| `.env` | `600` if your hosting user allows it, `644` minimum otherwise | Contains DB credentials — never make this world-readable beyond what the hosting account's own isolation already requires |

**Never set `777` anywhere.** If a write fails with `777` unset, the actual problem is almost always the PHP process running as a different user than the file owner (common on some shared hosts) — fix via cPanel's file manager "Change Owner" or ask hosting support, don't loosen permissions as a workaround.

## PHP upload/execution settings (Phase 3 — Import)

Set these in cPanel's **"MultiPHP INI Editor"** (or a `php.ini`/`.user.ini` override if your plan allows it — a project-root `.htaccess` `php_value` directive works on `mod_php` but is ignored under `php-fpm`, which most modern cPanel accounts use, so the INI Editor is the reliable path). Values below were sized against a real measured run (Task #105's synthetic 12,000-row/1.06 MB Bank Expense file, timed end-to-end on this project's own dev box): `analyze()` ≈ 2.9s, full `commit()` ≈ 8.3s, idempotent re-import ≈ 2.5s — well inside every recommended value below, leaving headroom for slower shared-hosting CPU/disk and for `.xlsx` files (heavier to parse than CSV of the same row count).

| Setting | Recommended | Why |
|---|---|---|
| `upload_max_filesize` | `25M` | `UploadValidator::MAX_BYTES` caps an accepted upload at 20MB app-side — PHP's own ceiling must be set *above* that, or a 20MB file gets silently truncated/rejected by PHP itself before the app ever sees it (`$_FILES[...]['error'] === UPLOAD_ERR_INI_SIZE`, which `UploadValidator` already detects and reports, but better to never hit it for a file the app is supposed to accept). |
| `post_max_size` | `26M` | Must be ≥ `upload_max_filesize` (PHP's own rule — the whole POST body, including multipart overhead, has to fit) — one extra MB of headroom over the filesize cap. |
| `max_execution_time` | `120` (seconds) | Measured: 12,000 rows ≈ 8.3s. 120s gives roughly 15x headroom for a slower shared-hosting CPU and for `.xlsx` (PhpSpreadsheet is slower than `fgetcsv` per row) at the spec's stated "10k+ rows/file" target. Not the "future 1M rows" target — a file that large needs the async/batch approach noted below, not a bigger timeout. |
| `max_input_time` | `120` | Same reasoning as `max_execution_time` — this covers the time PHP spends *receiving* the upload, which for a slow client connection can matter independently of server-side processing time. |
| `memory_limit` | `256M` | PhpSpreadsheet's `.xlsx` reader, even with `setReadDataOnly(true)` (already set in `XlsxReader`), holds more in memory per row than `fgetcsv`'s pure streaming — 256M is comfortable for the 10k-row target with margin; raise it further only if a real `.xlsx` import is observed to hit the limit (check `storage/logs/app.log`, which logs the exception before showing the user a generic error). |

**A note on the stated "future 1M rows" target**: none of the settings above make a single PHP-per-request import of 1,000,000 rows practical or safe on shared hosting — that scale needs chunked/background processing (e.g. splitting the file client-side, or a queued multi-cron-tick approach), which is out of scope for Phase 3 as built. The current design's explicit, met target is 10k+ rows per file / 100k+ total database rows (server-side pagination on every list view, indexed lookups on every hot column — see `database/schema/0003_transaction_import.sql`'s index list) — treat "1M" as a documented future direction, not a Phase 3 claim.

## Database setup

1. In cPanel → **MySQL® Databases**: create a database (e.g. `youraccount_pfs`) and a database user with a strong, unique password; add the user to the database with **All Privileges**.
2. In **phpMyAdmin**: select the new database, go to **Import**, and import `php-app/database/schema/0001_core_foundation.sql`. This creates `schema_migrations`, `profiles`, `sessions`, `password_reset_tokens`, `login_attempts`, `audit_log` — all `InnoDB`, `utf8mb4`.
3. **Do not import `database/seeds/0001_core_foundation.sql` as-is on a real production database** — it creates demo accounts (`accounting@example.com` etc.) with a publicly-known password (`Password123!`), documented in that file's own header purely for local/CI/demo use. For production, either skip it entirely and create your real `super_admin` account through a one-time script (see below), or edit the seed file's values before importing.
4. **Creating the first real production user** (no seed data imported): since there is no UI yet to create the first `super_admin` (Master Data/user-management UI ships in a later phase), run this once via SSH if available:
   ```
   php -r "require 'php-app/app/bootstrap.php'; echo password_hash('YOUR-REAL-PASSWORD', PASSWORD_BCRYPT), PHP_EOL;"
   ```
   then insert one row into `profiles` via phpMyAdmin with that hash, a real UUID (any UUIDv4 generator, or reuse the `Uuid::v4()` snippet above), role `super_admin`. If SSH is unavailable, generate the hash by temporarily running the one-liner in a local PHP install (same PHP major version) instead — never invent or guess a bcrypt hash by hand.
5. Every future schema change ships as a new numbered file under `database/schema/` (Phase 2 onward) — import each new file via phpMyAdmin in filename order when a phase is deployed. If SSH + CLI PHP ever becomes available on your plan, `php database/migrate.php` does the same thing and is safely re-runnable (skips anything already recorded in `schema_migrations`), including files you already imported by hand via phpMyAdmin — it will correctly see them as already applied and not re-run them, since `INSERT ... ON DUPLICATE KEY UPDATE`/`IF NOT EXISTS` patterns are used consistently.

## Config setup

1. Copy `php-app/.env.example` to `php-app/.env` and fill in real values — **`.env` must never be a copy of `.env.example` left with placeholder values in production**, especially `APP_KEY`, `DB_PASSWORD`.
2. Set `APP_ENV=production` and `APP_DEBUG=false` — `APP_DEBUG=true` prints full stack traces (including file paths and sometimes query fragments) directly in the browser on any uncaught error; this is correct for local development and must never be true on a real deployment.
3. Set `SESSION_COOKIE_SECURE=true` (the `.env.example` default) — this requires the domain to actually be served over HTTPS. cPanel + AutoSSL (Let's Encrypt) is the standard, usually-free way to get this; confirm the padlock shows before going live. If, for some unusual reason, HTTPS truly cannot be enabled, setting this to `false` is the *only* acceptable reason to touch it, and it measurably weakens session security — treat it as a temporary state, not a target one.
4. **Where `.env` should physically live**: ideally one directory *above* `public_html` (i.e., outside any web-servable path at all), which some cPanel account types allow (a "reseller" or dedicated-account structure where `public_html` is one of several sibling folders under the account's home directory). If your plan's document root *is* the account's home directory with no folder above it to use, `.env` stays at the project root next to `public/` as shipped — `.htaccess` (both the one in `public/` and the defense-in-depth one at the project root) blocks direct web access to it either way; a dotfile is also invisible to plain directory listings by default on Apache. Never rely on the dotfile-naming convention alone as your only protection — the `.htaccess` deny rule is what actually matters.

## vendor/ upload notes

Phase 1 has **no `vendor/` dependency that matters in production** (`composer.json`'s runtime `require` is PHP-version-only) — you do not strictly need to upload `vendor/` at all for Phase 1 to work, *except* that Composer's own autoloader (`vendor/autoload.php`) is what `app/bootstrap.php` requires to load every class. So:

- Run `composer install --no-dev --optimize-autoloader` locally or in CI before uploading (`--no-dev` excludes PHPUnit — it has no place in production; `--optimize-autoloader` generates a faster classmap, worth doing even though this app is small).
- Upload the resulting `vendor/` folder alongside everything else. **Composer itself never needs to run on the cPanel server** — this satisfies the "don't make Composer mandatory in production" requirement exactly as asked.
- **Phase 3 update**: `composer.json` now has a real runtime dependency (`phpoffice/phpspreadsheet` ^5.9, for `.xlsx` import — see "Required PHP extensions" above for what it needs enabled). The workflow is unchanged: `composer install --no-dev --optimize-autoloader` locally/CI, re-upload the updated `vendor/` folder (noticeably larger now — PhpSpreadsheet pulls in several transitive packages). CSV import has zero dependency on this package at all (`CsvReader` is pure `fgetcsv`), so a deployment that skips `.xlsx` support entirely could in principle omit PhpSpreadsheet from `composer.json` — not recommended, since spec treats `.xlsx` as a mandatory input format, but worth knowing the dependency is scoped to exactly one reader class.

## Document root assumptions

The correct, secure setup points the domain/subdomain's document root directly at `php-app/public/` — then only `public/index.php` and `public/assets/` are ever web-reachable, and `app/`, `config/`, `database/`, `storage/`, `.env`, `vendor/`, `composer.json` all sit outside the web-servable tree entirely (the strongest possible protection — not reachable by any URL, regardless of `.htaccess`).

- In cPanel → **Domains** (or **Subdomains**), most modern cPanel builds let you set a custom document root per domain/subdomain — point it at `.../php-app/public`.
- **If your specific hosting plan does not allow a custom document root** (some entry-level shared plans restrict this to addon domains/subdomains only, not the primary domain) — upload the entire `php-app/` folder as `public_html` itself, i.e. `public_html/public/index.php`, `public_html/app/...`, etc. In this layout the project-root `.htaccess` (already included, denies all direct access) is what protects `app/`, `config/`, `database/`, `.env`, `vendor/` from being fetched by URL — and you must then either configure the domain to actually serve from `public_html/public/` via some other means, or accept the URL will have `/public/` in front of every path unless an additional rewrite is added. **The cleanest fix, if available at all, is always getting the document root changed** — treat the root-level `.htaccess` as a safety net for a constrained plan, not the primary design.
- Confirm whichever layout you use by trying to fetch `.env` and `composer.json` directly by URL after deploying (e.g. `https://yourdomain.com/.env`) — both must return a 403/404, never the file's contents. This is a mandatory post-deploy check, not optional.

## Cron assumptions

Phase 1/2 registered no cron job. This project's design deliberately avoids any persistent background worker/queue daemon (not available on shared hosting) in favor of **cPanel's own Cron Jobs** feature calling a PHP CLI script directly — no HTTP round-trip, no shared secret needed, and it fails loudly into `storage/logs/app.log` rather than silently.

**Phase 3 adds the first real cron job**: `php-app/cron/cleanup_import_tmp.php` deletes anything left in `storage/uploads/import-tmp/` older than 24 hours — a file lands there the moment someone uploads a Buku Bank/Revenue export and is only cleaned up by the app itself on a successful "confirm" or an explicit "cancel"; a user who closes the tab at the preview step instead leaves it behind indefinitely, which matters on shared hosting's limited disk quota. Add via cPanel → **Cron Jobs**:

```
0 3 * * *  php /home/youraccount/php-app/cron/cleanup_import_tmp.php >> /home/youraccount/php-app/storage/logs/cron_cleanup.log 2>&1
```

(daily at 03:00 server time; safe to run more often — it only ever deletes files past the 24h threshold, never anything freshly uploaded). Replace `/home/youraccount/php-app/` with the actual absolute path cPanel shows for your account. Phase 6 (Cashflow's Google Sheet sync) will add a second cron job at that point, following the same pattern.

## Security notes

- **Credentials**: every password is `password_hash()`/`password_verify()` (bcrypt, cost 12) — never stored or logged in plaintext. `AuditService` explicitly redacts any `password`/`password_hash` key before writing to `audit_log`, so even a bug that accidentally passed a credential into an audit call would not persist it.
- **Sessions**: DB-backed (`sessions` table), not PHP's default file-based handler — see `CPANEL_MYSQL_IMPLEMENTATION_PLAN.md`'s Auth/Session Architecture section for why (shared-hosting `/tmp` cleanup unpredictability, no visibility into active sessions). Cookie flags: `httponly`, `secure` (once HTTPS is confirmed), `samesite=Lax`. `session_regenerate_id(true)` fires immediately on every successful login (session fixation prevention).
- **CSRF**: every POST/PUT/DELETE route is behind `CsrfMiddleware`; a form without a valid `_csrf_token` is rejected with HTTP 419 before any Controller code runs.
- **SQL injection**: `App\Database\Connection` forces `PDO::ATTR_EMULATE_PREPARES = false` globally — every query is a real, server-side prepared statement; no Repository method ever concatenates a variable into a SQL string.
- **Output escaping**: every dynamic value in a view must go through `e()` (`htmlspecialchars`, `ENT_QUOTES`) — there is no auto-escaping template engine, so this is a manual discipline enforced by code review, not a framework guarantee. Treat any `<?= $value ?>` without `e()` around it as a bug.
- **Authorization**: enforced entirely server-side — `AuthMiddleware` (is there a session at all), `RoleMiddleware`/`Policy` (which role may do this), and Repository-level row scoping (which *rows* a given user's query may ever return, resolved inside the SQL itself, never as a client-trusted parameter or a UI-only hide). See `CPANEL_MYSQL_IMPLEMENTATION_PLAN.md`'s RBAC Architecture section for the full reasoning — there is no database-level RLS backstop in MySQL, so this discipline is the entire security boundary from Phase 1 onward.
- **Error disclosure**: `APP_DEBUG=false` in production means an uncaught exception shows only a generic "Something went wrong" (or the matching 401/403/404 status) — full details go only to `storage/logs/app.log`, never to the browser.
- **Rate limiting**: `login_attempts` tracks failures per identifier (email or IP); a configurable threshold (`LOGIN_MAX_ATTEMPTS`, default 5 within `LOGIN_LOCKOUT_MINUTES`, default 15) locks out further attempts — implemented in the database rather than an in-memory limiter, since shared hosting offers no persistent process to hold that state.
- **No daemon/background process anywhere** in this design, by construction — every requirement above is satisfied within a single PHP-per-request model, exactly matching the shared-hosting constraint (Phase 3's cleanup job runs via cPanel Cron, not a resident process, same as every other scheduled task in this project).
- **Phase 3 upload security**: `UploadValidator` rejects anything outside `csv`/`xlsx`/`xls` by extension *and* cross-checks the actual file content via `finfo` MIME sniffing (an attacker renaming a script to `.csv` does not get past the content check); every accepted file is renamed to a server-generated UUID before being written to disk (the original filename is kept only as display metadata, never used to build a path — closes path traversal at the write side) and stored under `storage/uploads/import-tmp/`, outside `public/`, `chmod 0640`. Reading a previously-uploaded file back (the "confirm" step) resolves its token through a regex that requires a bare UUID shape before any path is built (`UploadValidator::resolveToken()`) — a malformed or path-traversal token (`../../etc/passwd`) is rejected before the filesystem is ever touched, not just via a "file not found" side effect. This is unit-tested directly (`tests/Feature/ImportUploadSecurityTest.php`).

---

*This document will be extended (not replaced) as each subsequent phase adds its own deployment-relevant detail — new extensions, new cron jobs, new config values.*
