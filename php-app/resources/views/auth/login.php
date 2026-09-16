<?php

use App\Helpers\Csrf;

/** @var string|null $error */
?>
<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>Login - Partnership Finance System</title>
</head>
<body>
  <main style="max-width:360px;margin:4rem auto;font-family:sans-serif;">
    <h1>Login</h1>
    <?php if ($error !== null): ?>
      <p style="color:#b00020;"><?= e($error) ?></p>
    <?php endif; ?>
    <form method="post" action="/login">
      <?= Csrf::field() ?>
      <div>
        <label for="email">Email</label><br>
        <input type="email" id="email" name="email" required autofocus>
      </div>
      <div>
        <label for="password">Password</label><br>
        <input type="password" id="password" name="password" required>
      </div>
      <button type="submit">Log in</button>
    </form>
  </main>
</body>
</html>
