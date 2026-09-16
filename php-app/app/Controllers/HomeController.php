<?php

declare(strict_types=1);

namespace App\Controllers;

final class HomeController extends Controller
{
    public function index(): void
    {
        $this->view('home', ['user' => $this->currentUser()]);
    }
}
