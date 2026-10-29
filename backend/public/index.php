<?php

use Illuminate\Foundation\Application;
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

// When served under a sub-path (e.g. http://localhost/hrms), strip the prefix
// so Laravel routing sees the canonical URI (api/v1/...).
if (isset($_SERVER['REQUEST_URI']) && str_starts_with($_SERVER['REQUEST_URI'], '/hrms')) {
    $stripped = substr($_SERVER['REQUEST_URI'], strlen('/hrms')) ?: '/';
    if (! str_starts_with($stripped, '/')) {
        $stripped = '/'.$stripped;
    }
    $_SERVER['REQUEST_URI'] = $stripped;
}

// Determine if the application is in maintenance mode...
if (file_exists($maintenance = __DIR__.'/../storage/framework/maintenance.php')) {
    require $maintenance;
}

// Register the Composer autoloader...
require __DIR__.'/../vendor/autoload.php';

// Bootstrap Laravel and handle the request...
/** @var Application $app */
$app = require_once __DIR__.'/../bootstrap/app.php';

$app->handleRequest(Request::capture());
