FROM php:8.4-apache

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        libcurl4-openssl-dev \
        libfreetype6-dev \
        libicu-dev \
        libjpeg62-turbo-dev \
        libonig-dev \
        libpng-dev \
        libzip-dev \
        poppler-utils \
        unzip \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" \
        bcmath \
        curl \
        gd \
        intl \
        mbstring \
        opcache \
        pdo_mysql \
        pcntl \
        zip \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && a2enmod headers rewrite \
    && sed -ri 's!/var/www/html!/var/www/html/public!g' /etc/apache2/sites-available/000-default.conf \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /var/www/html
COPY . .

RUN mkdir -p storage/app/private storage/app/public storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache public/uploads \
    && composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader \
    && php artisan storage:link \
    && chown -R www-data:www-data storage bootstrap/cache public/uploads \
    && rm /usr/bin/composer

EXPOSE 80
