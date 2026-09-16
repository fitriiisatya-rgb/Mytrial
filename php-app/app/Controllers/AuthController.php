<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\AuthService;

final class AuthController extends Controller
{
    public function showLogin(): void
    {
        if ($this->currentUser() !== null) {
            $this->redirect('/');
            return;
        }
        $this->view('auth/login', ['error' => null]);
    }

    public function login(): void
    {
        $email = (string) $this->input('email', '');
        $password = (string) $this->input('password', '');

        $auth = new AuthService();
        $result = $auth->login($email, $password, $_SERVER['REMOTE_ADDR'] ?? null);

        if (!$result['success']) {
            // Deliberately generic user-facing message regardless of
            // internal reason (invalid_credentials/account_disabled/
            // locked_out) - avoids confirming to an attacker whether an
            // email exists at all. The distinct internal `reason` is
            // still what tests assert against.
            $this->view('auth/login', ['error' => 'Invalid email or password.']);
            return;
        }

        $this->redirect('/');
    }

    public function logout(): void
    {
        (new AuthService())->logout();
        $this->redirect('/login');
    }
}
