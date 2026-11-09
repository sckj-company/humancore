<?php

return [
    'code_ttl_minutes' => (int) env('PASSWORD_RESET_CODE_TTL', 15),
    'max_attempts' => (int) env('PASSWORD_RESET_MAX_ATTEMPTS', 5),
];
