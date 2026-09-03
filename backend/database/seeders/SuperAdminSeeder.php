<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class SuperAdminSeeder extends Seeder
{
    public function run(): void
    {
        $superAdmin = User::updateOrCreate(
            ['email' => 'superadmin@hrms.local'],
            [
                'tenant_id' => null,
                'name' => 'Super Administrator',
                'password' => Hash::make('password'),
                'email_verified_at' => now(),
                'locale' => 'pt',
                'timezone' => 'Africa/Luanda',
                'is_active' => true,
            ],
        );

        $superAdmin->assignRole('super-admin');
    }
}
