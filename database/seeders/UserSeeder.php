<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Carbon\Carbon;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        DB::table('users')->insert([
            [
                'email' => 'admin@imaps.com',
                'password_hash' => Hash::make('password123'),
                'name' => 'Vico Sotto',
                'role' => 'Admin',
                'is_active' => true,
                'last_login' => null,
                'created_at' => Carbon::now(),
                'updated_at' => Carbon::now(),
            ],
            [
                'email' => 'planner@imaps.com',
                'password_hash' => Hash::make('password123'),
                'name' => 'Blaster Salonga',
                'role' => 'Planning Officer',
                'is_active' => true,
                'last_login' => null,
                'created_at' => Carbon::now(),
                'updated_at' => Carbon::now(),
            ],
        ]);
    }
}
