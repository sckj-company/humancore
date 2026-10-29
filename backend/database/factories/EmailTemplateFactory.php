<?php

namespace Database\Factories;

use App\Models\EmailTemplate;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<EmailTemplate>
 */
class EmailTemplateFactory extends Factory
{
    public function definition(): array
    {
        return [
            'name' => fake()->words(3, true),
            'code' => fake()->unique()->slug(2),
            'event' => 'custom',
            'subject' => 'Notificação — {{company_name}}',
            'body' => "Olá {{employee_name}},\n\nEste é um aviso automático da {{company_name}}.\n\nCumprimentos,",
            'variables' => EmailTemplate::DEFAULT_VARIABLES,
            'is_active' => true,
            'is_system' => false,
        ];
    }
}
