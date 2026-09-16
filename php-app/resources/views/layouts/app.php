<?php

use App\Helpers\Flash;

/**
 * @var string $title
 * @var string $active nav key: entities|outlets|coa|banks|investors|contracts|ownerships
 * @var array{id:string,role:string,name:string,email:string} $user
 * @var string $content pre-rendered HTML from the child view
 */
$nav = [
    'entities' => ['/master/entities', 'Entitas'],
    'outlets' => ['/master/outlets', 'Outlet'],
    'coa' => ['/master/coa', 'COA'],
    'banks' => ['/master/banks', 'Rekening Bank'],
    'investors' => ['/master/investors', 'Investor'],
    'contracts' => ['/master/contracts', 'Kontrak Kemitraan'],
    'ownerships' => ['/master/ownerships', 'Kepemilikan Investor'],
  'import' => ['/import/bank-expense', 'Import Transaksi'],
];
$flash = Flash::consume();
?>
<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= e($title) ?> - Partnership Finance System</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Segoe UI, sans-serif; margin: 0; background: #f5f6f8; color: #1a1a1a; }
    .layout { display: flex; min-height: 100vh; }
    nav.sidebar { width: 220px; background: #1e2530; color: #cfd6e0; padding: 1rem 0; flex-shrink: 0; }
    nav.sidebar h2 { font-size: .8rem; text-transform: uppercase; letter-spacing: .05em; padding: 0 1rem; color: #7c8aa0; margin: .5rem 0; }
    nav.sidebar a { display: block; padding: .5rem 1rem; color: #cfd6e0; text-decoration: none; font-size: .9rem; }
    nav.sidebar a:hover { background: #2a3342; }
    nav.sidebar a.active { background: #34506e; color: #fff; font-weight: 600; }
    main { flex: 1; padding: 1.5rem 2rem; max-width: 1100px; }
    .topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .topbar form { display: inline; }
    table { width: 100%; border-collapse: collapse; background: #fff; }
    th, td { text-align: left; padding: .5rem .6rem; border-bottom: 1px solid #e5e7eb; font-size: .9rem; }
    th { background: #eef1f5; font-weight: 600; }
    .btn { display: inline-block; padding: .4rem .8rem; border-radius: 4px; border: 1px solid #34506e; background: #34506e; color: #fff; text-decoration: none; font-size: .85rem; cursor: pointer; }
    .btn.secondary { background: #fff; color: #34506e; }
    .btn.danger { background: #fff; border-color: #b00020; color: #b00020; }
    .badge { display: inline-block; padding: .15rem .5rem; border-radius: 3px; font-size: .75rem; }
    .badge.active { background: #dcfce7; color: #166534; }
    .badge.inactive { background: #f3f4f6; color: #6b7280; }
    .badge.warning { background: #fef3c7; color: #92400e; }
    .badge.invalid { background: #fee2e2; color: #991b1b; }
    .badge.none { background: #e5e7eb; color: #4b5563; }
    .flash { padding: .6rem 1rem; border-radius: 4px; margin-bottom: 1rem; font-size: .9rem; }
    .flash.success { background: #dcfce7; color: #166534; }
    .flash.error { background: #fee2e2; color: #991b1b; }
    .field { margin-bottom: .9rem; }
    .field label { display: block; font-size: .85rem; font-weight: 600; margin-bottom: .25rem; }
    .field input, .field select, .field textarea { width: 100%; max-width: 420px; padding: .4rem .5rem; border: 1px solid #d1d5db; border-radius: 4px; font-size: .9rem; }
    .field .error { color: #b00020; font-size: .8rem; margin-top: .2rem; }
    .filters { display: flex; gap: .5rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .filters input, .filters select { padding: .35rem .5rem; border: 1px solid #d1d5db; border-radius: 4px; font-size: .85rem; }
    .empty-state { padding: 2rem; text-align: center; color: #6b7280; background: #fff; }
    .pagination { display: flex; gap: .5rem; margin-top: 1rem; align-items: center; font-size: .85rem; }
  </style>
</head>
<body>
<div class="layout">
  <nav class="sidebar">
    <h2>Master Data</h2>
    <?php foreach ($nav as $key => [$href, $label]): ?>
      <a href="<?= e($href) ?>" class="<?= $active === $key ? 'active' : '' ?>"><?= e($label) ?></a>
    <?php endforeach; ?>
  </nav>
  <main>
    <div class="topbar">
      <div>Login sebagai <strong><?= e($user['name']) ?></strong> (<?= e($user['role']) ?>)</div>
      <form method="post" action="/logout"><?= \App\Helpers\Csrf::field() ?><button class="btn secondary" type="submit">Logout</button></form>
    </div>
    <?php foreach ($flash as $type => $message): ?>
      <div class="flash <?= e($type) ?>"><?= e($message) ?></div>
    <?php endforeach; ?>
    <?= $content ?>
  </main>
</div>
</body>
</html>
