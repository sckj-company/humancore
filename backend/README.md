<p align="center"><a href="https://laravel.com" target="_blank"><img src="https://raw.githubusercontent.com/laravel/art/master/logo-lockup/5%20SVG/2%20CMYK/1%20Full%20Color/laravel-logolockup-cmyk-red.svg" width="400" alt="Laravel Logo"></a></p>

<p align="center">
<a href="https://github.com/laravel/framework/actions"><img src="https://github.com/laravel/framework/workflows/tests/badge.svg" alt="Build Status"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/dt/laravel/framework" alt="Total Downloads"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/v/laravel/framework" alt="Latest Stable Version"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/l/laravel/framework" alt="License"></a>
</p>

## Redefinição de palavra-passe e Mailgun

A recuperação pública está disponível em `/forgot-password`. O sistema envia um código de seis dígitos pela API de envio do Mailgun; o código expira em 15 minutos, aceita no máximo cinco tentativas e é substituído por uma credencial temporária após a confirmação. Para habilitar o envio, configure no ambiente do backend:

```env
MAILGUN_API_KEY=chave-da-api
MAILGUN_DOMAIN=mg.seudominio.com
MAILGUN_REGION=us
MAIL_FROM_ADDRESS=no-reply@seudominio.com
MAIL_FROM_NAME=HumanCore
PASSWORD_RESET_CODE_TTL=15
PASSWORD_RESET_MAX_ATTEMPTS=5
```

O domínio deve estar adicionado e validado na conta Mailgun, e o endereço do remetente deve pertencer a esse domínio. Domínios `sandbox` só enviam para destinatários autorizados no Mailgun; para envio geral, use um domínio de envio próprio validado. Use `MAILGUN_REGION=eu` para uma conta/domínio hospedado na região europeia; a região padrão é `us`. Depois de configurar as variáveis, atualize a configuração em cache, se aplicável, e execute `php artisan migrate --force` para adicionar o contador de tentativas. O super administrador também pode definir diretamente uma nova palavra-passe na gestão de utilizadores; essa ação revoga os tokens existentes do utilizador.

## Logs operacionais e auditoria no terminal

O canal padrão (`LOG_STACK=stderr,single`) envia os logs para o `stderr` do processo e também para `storage/logs/laravel.log`. As operações HTTP são registadas com identificador de pedido, método, rota, resultado, duração, utilizador, empresa e IP; eventos de auditoria de modelos e de negócio também são enviados ao canal `audit`. Os corpos das requisições e as credenciais não são registados. Comandos de servidor devem manter o `stderr` visível ou recolhido pelo gestor de processos para consultar os eventos em tempo real.

## About Laravel

Laravel is a web application framework with expressive, elegant syntax. We believe development must be an enjoyable and creative experience to be truly fulfilling. Laravel takes the pain out of development by easing common tasks used in many web projects, such as:

- [Simple, fast routing engine](https://laravel.com/docs/routing).
- [Powerful dependency injection container](https://laravel.com/docs/container).
- Multiple back-ends for [session](https://laravel.com/docs/session) and [cache](https://laravel.com/docs/cache) storage.
- Expressive, intuitive [database ORM](https://laravel.com/docs/eloquent).
- Database agnostic [schema migrations](https://laravel.com/docs/migrations).
- [Robust background job processing](https://laravel.com/docs/queues).
- [Real-time event broadcasting](https://laravel.com/docs/broadcasting).

Laravel is accessible, powerful, and provides tools required for large, robust applications.

## Learning Laravel

Laravel has the most extensive and thorough [documentation](https://laravel.com/docs) and video tutorial library of all modern web application frameworks, making it a breeze to get started with the framework.

In addition, [Laracasts](https://laracasts.com) contains thousands of video tutorials on a range of topics including Laravel, modern PHP, unit testing, and JavaScript. Boost your skills by digging into our comprehensive video library.

You can also watch bite-sized lessons with real-world projects on [Laravel Learn](https://laravel.com/learn), where you will be guided through building a Laravel application from scratch while learning PHP fundamentals.

## Agentic Development

Laravel's predictable structure and conventions make it ideal for AI coding agents like Claude Code, Cursor, and GitHub Copilot. Install [Laravel Boost](https://laravel.com/docs/ai) to supercharge your AI workflow:

```bash
composer require laravel/boost --dev

php artisan boost:install
```

Boost provides your agent 15+ tools and skills that help agents build Laravel applications while following best practices.

## Contributing

Thank you for considering contributing to the Laravel framework! The contribution guide can be found in the [Laravel documentation](https://laravel.com/docs/contributions).

## Code of Conduct

In order to ensure that the Laravel community is welcoming to all, please review and abide by the [Code of Conduct](https://laravel.com/docs/contributions#code-of-conduct).

## Security Vulnerabilities

If you discover a security vulnerability within Laravel, please send an e-mail to Taylor Otwell via [taylor@laravel.com](mailto:taylor@laravel.com). All security vulnerabilities will be promptly addressed.

## License

The Laravel framework is open-sourced software licensed under the [MIT license](https://opensource.org/licenses/MIT).
