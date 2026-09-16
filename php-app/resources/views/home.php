<?php

use App\Helpers\Csrf;

/** @var array{id: string, role: string, name: string, email: string} $user */
?>
<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>Partnership Finance System</title>
</head>
<body>
  <main style="max-width:480px;margin:4rem auto;font-family:sans-serif;">
    <h1>Selamat datang, <?= e($user['name']) ?></h1>
    <p>Role: <strong><?= e($user['role']) ?></strong></p>
    <p>Ini adalah landing page Phase 1 - modul bisnis (Master Data, Import, Journal, ...) dibangun mulai Phase 2.</p>
    <form method="post" action="/logout">
      <?= Csrf::field() ?>
      <button type="submit">Logout</button>
    </form>
  </main>
</body>
</html>
