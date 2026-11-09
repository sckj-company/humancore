<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'brevo' => [
        'smtp_username' => env('BREVO_SMTP_LOGIN', env('BREVO_SMTP_USERNAME', env('MAIL_USERNAME'))),
        'smtp_key' => env('BREVO_SMTP_KEY', env('MAIL_PASSWORD')),
        'sender_email' => env('BREVO_SENDER_EMAIL', env('MAIL_FROM_ADDRESS')),
        'sender_name' => env('BREVO_SENDER_NAME', env('MAIL_FROM_NAME', env('APP_NAME', 'Laravel'))),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'cloudinary' => [
        'cloud_name' => env('CLOUDINARY_CLOUD_NAME'),
        'api_key' => env('CLOUDINARY_API_KEY'),
        'api_secret' => env('CLOUDINARY_API_SECRET'),
    ],

    'groq' => [
        'key' => env('GROQ_API_KEY'),
        'base_url' => env('GROQ_BASE_URL', 'https://api.groq.com/openai/v1'),
        'model' => env('GROQ_OCR_MODEL', 'qwen/qwen3.8-27b'),
        'max_images' => (int) env('GROQ_OCR_MAX_IMAGES', 3),
        'max_pdf_pages' => (int) env('GROQ_OCR_MAX_PDF_PAGES', 3),
        'max_completion_tokens' => (int) env('GROQ_OCR_MAX_COMPLETION_TOKENS', 256),
        'max_prompt_words' => (int) env('GROQ_OCR_MAX_PROMPT_WORDS', 80),
        'max_image_bytes' => (int) env('GROQ_OCR_MAX_IMAGE_BYTES', 12582912),
    ],

];
