<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/login', function (Request $request) {
    if ($request->is('api/*') || $request->expectsJson()) {
        return response()->json([
            'success' => false,
            'data' => null,
            'message' => 'Não autenticado',
        ], 401);
    }

    return redirect('/');
})->name('login');
