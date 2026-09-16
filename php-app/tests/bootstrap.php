<?php

declare(strict_types=1);

putenv('PFS_ENV_FILE=' . dirname(__DIR__) . '/.env.testing');

require_once dirname(__DIR__) . '/app/bootstrap.php';
