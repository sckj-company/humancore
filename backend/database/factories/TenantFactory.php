<?php

namespace Database\Factories;

use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Tenant>
 */
class TenantFactory extends Factory
{
    protected $model = Tenant::class;

    public function definition(): array
    {
        $name = fake()->unique()->company();

        return [
            'name' => $name,
            'slug' => Str::slug($name).'-'.Str::lower(Str::random(4)),
            'email' => fake()->companyEmail(),
            'phone' => fake()->phoneNumber(),
            'tax_id' => fake()->numerify('############'),
            'address' => fake()->streetAddress(),
            'city' => fake()->city(),
            'country' => 'Angola',
            'currency' => 'AOA',
            'locale' => 'pt',
            'timezone' => 'Africa/Luanda',
            'date_format' => 'd/m/Y',
            'status' => 'active',
            'config' => [],
        ];
    }
}
