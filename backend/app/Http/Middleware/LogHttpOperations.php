<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Illuminate\Auth\AuthenticationException;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

class LogHttpOperations
{
    public function handle(Request $request, Closure $next): Response
    {
        $startedAt = microtime(true);
        $requestId = (string) Str::uuid();
        $status = Response::HTTP_INTERNAL_SERVER_ERROR;
        $exceptionClass = null;

        try {
            $response = $next($request);
            $status = $response->getStatusCode();
            $response->headers->set('X-Request-ID', $requestId);

            return $response;
        } catch (Throwable $exception) {
            $exceptionClass = $exception::class;

            if ($exception instanceof ValidationException) {
                $status = $exception->status;
            } elseif ($exception instanceof HttpExceptionInterface) {
                $status = $exception->getStatusCode();
            } elseif ($exception instanceof AuthenticationException) {
                $status = Response::HTTP_UNAUTHORIZED;
            } elseif ($exception instanceof AuthorizationException) {
                $status = Response::HTTP_FORBIDDEN;
            }

            throw $exception;
        } finally {
            Log::channel('audit')->info('http.operation', [
                'request_id' => $requestId,
                'method' => $request->method(),
                'path' => '/'.$request->path(),
                'route' => $request->route()?->getName(),
                'status' => $status,
                'exception' => $exceptionClass,
                'duration_ms' => (int) round((microtime(true) - $startedAt) * 1000),
                'user_id' => $request->user()?->getAuthIdentifier(),
                'tenant_id' => app()->bound('currentTenant') ? app('currentTenant')?->id : null,
                'ip' => $request->ip(),
            ]);
        }
    }
}
