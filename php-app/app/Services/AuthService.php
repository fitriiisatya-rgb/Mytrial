<?php

declare(strict_types=1);

namespace App\Services;

use App\Database\Connection;
use App\Repositories\ProfileRepository;

/**
 * Login/logout/current-user + brute-force rate limiting. Every write
 * this Service makes (attempt log, session regeneration) is deliberate
 * and testable in isolation - see tests/Feature/AuthTest.php for the
 * 13 required Phase 1 scenarios this class must satisfy.
 */
final class AuthService
{
    public function __construct(private readonly ProfileRepository $profiles = new ProfileRepository())
    {
    }

    /**
     * @return array{success: bool, reason?: string, user?: array}
     */
    public function login(string $email, string $password, ?string $ip = null): array
    {
        $email = trim($email);

        if ($this->isLockedOut($email)) {
            return ['success' => false, 'reason' => 'locked_out'];
        }

        $profile = $this->profiles->findByEmail($email);

        if ($profile === null) {
            $this->recordAttempt($email, $ip, false);
            AuditService::log(null, 'login_failed', 'profiles', null, null, ['email' => $email, 'reason' => 'not_found']);
            return ['success' => false, 'reason' => 'invalid_credentials'];
        }

        if ((int) $profile['is_active'] !== 1) {
            $this->recordAttempt($email, $ip, false);
            AuditService::log($profile['id'], 'login_failed', 'profiles', $profile['id'], null, ['reason' => 'account_disabled']);
            return ['success' => false, 'reason' => 'account_disabled'];
        }

        if (!password_verify($password, $profile['password_hash'])) {
            $this->recordAttempt($email, $ip, false);
            AuditService::log($profile['id'], 'login_failed', 'profiles', $profile['id'], null, ['reason' => 'invalid_password']);
            return ['success' => false, 'reason' => 'invalid_credentials'];
        }

        $this->recordAttempt($email, $ip, true);

        // Session fixation prevention: a brand new session id is issued
        // the moment authentication succeeds, so a session id an
        // attacker may have fixed pre-login is never the one that
        // carries an authenticated identity.
        session_regenerate_id(true);

        $_SESSION['user_id'] = $profile['id'];
        $_SESSION['role'] = $profile['role'];
        $_SESSION['name'] = $profile['name'];
        $_SESSION['email'] = $profile['email'];

        AuditService::log($profile['id'], 'login_succeeded', 'profiles', $profile['id']);

        return [
            'success' => true,
            'user' => [
                'id' => $profile['id'],
                'name' => $profile['name'],
                'email' => $profile['email'],
                'role' => $profile['role'],
            ],
        ];
    }

    public function logout(): void
    {
        $userId = $_SESSION['user_id'] ?? null;
        if (is_string($userId) && $userId !== '') {
            AuditService::log($userId, 'logout', 'profiles', $userId);
        }

        $_SESSION = [];

        if (session_id() !== '') {
            Connection::instance()
                ->prepare('DELETE FROM sessions WHERE id = :id')
                ->execute(['id' => session_id()]);
        }

        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires' => time() - 42000,
                'path' => $params['path'],
                'domain' => $params['domain'],
                'secure' => $params['secure'],
                'httponly' => $params['httponly'],
                'samesite' => $params['samesite'] ?? 'Lax',
            ]);
        }

        session_destroy();
    }

    /**
     * Re-checks the DB on every call (not just $_SESSION) so a user
     * deactivated mid-session is locked out immediately rather than only
     * on next login - a deliberate correctness-over-microperformance
     * choice for a finance system. Static because every call site
     * (Controller::currentUser(), Middleware) needs this ambiently and
     * has no reason to inject a fake ProfileRepository - unlike
     * login()/logout(), which stay instance methods for testability.
     *
     * @return array{id: string, role: string, name: string, email: string}|null
     */
    public static function currentUser(): ?array
    {
        $userId = $_SESSION['user_id'] ?? null;
        if (!is_string($userId) || $userId === '') {
            return null;
        }

        $profile = (new ProfileRepository())->findById($userId);
        if ($profile === null || (int) $profile['is_active'] !== 1) {
            return null;
        }

        return [
            'id' => $profile['id'],
            'role' => $profile['role'],
            'name' => $profile['name'],
            'email' => $profile['email'],
        ];
    }

    private function recordAttempt(string $identifier, ?string $ip, bool $succeeded): void
    {
        Connection::instance()
            ->prepare('INSERT INTO login_attempts (identifier, ip_address, succeeded) VALUES (:identifier, :ip, :succeeded)')
            ->execute([
                'identifier' => $identifier,
                'ip' => $ip,
                'succeeded' => $succeeded ? 1 : 0,
            ]);
    }

    private function isLockedOut(string $identifier): bool
    {
        $maxAttempts = (int) config('app.login.max_attempts', 5);
        $lockoutMinutes = (int) config('app.login.lockout_minutes', 15);

        $stmt = Connection::instance()->prepare(
            'SELECT COUNT(*) AS failures FROM login_attempts
             WHERE identifier = :identifier
               AND succeeded = 0
               AND attempted_at > DATE_SUB(NOW(), INTERVAL :minutes MINUTE)'
        );
        $stmt->execute(['identifier' => $identifier, 'minutes' => $lockoutMinutes]);
        $row = $stmt->fetch();

        return $row !== false && (int) $row['failures'] >= $maxAttempts;
    }
}
