<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('positions', function (Blueprint $table) {
            $table->foreignId('permission_group_id')
                ->nullable()
                ->after('is_management')
                ->constrained('permission_groups')
                ->nullOnDelete();
            $table->json('default_permissions')->nullable()->after('permission_group_id');
            $table->string('default_role_name', 50)->nullable()->after('default_permissions');
        });

        // Alinhar departamentos e cargos base criados pela migração anterior (apenas registos intactos)
        $deptRenames = [
            ['from_code' => 'DG', 'from_name' => 'Direção Geral', 'to_code' => 'GER', 'to_name' => 'Geral'],
            ['from_code' => 'RH', 'from_name' => 'Recursos Humanos', 'to_code' => 'RH', 'to_name' => 'RH'],
            ['from_code' => 'FIN', 'from_name' => 'Financeiro e Contabilidade', 'to_code' => 'FIN', 'to_name' => 'Finanças'],
            ['from_code' => 'ADM', 'from_name' => 'Administrativo', 'to_code' => 'ADM', 'to_name' => 'Administração'],
            ['from_code' => 'COM', 'from_name' => 'Comercial e Vendas', 'to_code' => 'COM', 'to_name' => 'Comercial'],
            ['from_code' => 'TI', 'from_name' => 'Tecnologia e Sistemas', 'to_code' => 'TI', 'to_name' => 'TI'],
        ];

        foreach ($deptRenames as $rule) {
            DB::table('departments')
                ->where('code', $rule['from_code'])
                ->where('name', $rule['from_name'])
                ->whereNull('deleted_at')
                ->update([
                    'code' => $rule['to_code'],
                    'name' => $rule['to_name'],
                    'updated_at' => now(),
                ]);
        }

        $posRenames = [
            ['from_code' => 'DG-01', 'from_title' => 'Diretor Geral', 'to_code' => 'GER-01', 'to_title' => 'Diretor Geral'],
            ['from_code' => 'RH-01', 'from_title' => 'Gestor de Recursos Humanos', 'to_code' => 'RH-01', 'to_title' => 'Gestor de RH'],
            ['from_code' => 'RH-02', 'from_title' => 'Técnico de Recursos Humanos', 'to_code' => 'RH-02', 'to_title' => 'Técnico de RH'],
            ['from_code' => 'ADM-01', 'from_title' => 'Coordenador Administrativo', 'to_code' => 'ADM-01', 'to_title' => 'Gestor de Administração'],
            ['from_code' => 'OPS-01', 'from_title' => 'Coordenador de Operações', 'to_code' => 'OPS-01', 'to_title' => 'Gestor de Operações'],
            ['from_code' => 'TI-02', 'from_title' => 'Técnico de Informática', 'to_code' => 'TI-02', 'to_title' => 'Técnico de TI'],
        ];

        foreach ($posRenames as $rule) {
            DB::table('positions')
                ->where('code', $rule['from_code'])
                ->where('title', $rule['from_title'])
                ->whereNull('deleted_at')
                ->update([
                    'code' => $rule['to_code'],
                    'title' => $rule['to_title'],
                    'updated_at' => now(),
                ]);
        }

        // Garantir departamento Recepção e cargo Recepcionista em empresas que tenham Geral sem Recepção
        $gerRows = DB::table('departments')
            ->where('code', 'GER')
            ->whereNull('deleted_at')
            ->get(['id', 'tenant_id']);

        foreach ($gerRows as $row) {
            $recDeptId = DB::table('departments')
                ->where('tenant_id', $row->tenant_id)
                ->where('code', 'REC')
                ->value('id');

            if (! $recDeptId) {
                $recDeptId = DB::table('departments')->insertGetId([
                    'tenant_id' => $row->tenant_id,
                    'name' => 'Recepção',
                    'code' => 'REC',
                    'parent_id' => $row->id,
                    'level' => 2,
                    'description' => 'Atendimento ao público, receção de visitantes e apoio de secretaria.',
                    'status' => 'active',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            $hasRecPos = DB::table('positions')
                ->where('tenant_id', $row->tenant_id)
                ->where('code', 'REC-01')
                ->exists();

            if ($recDeptId && ! $hasRecPos) {
                $adm01Id = DB::table('positions')
                    ->where('tenant_id', $row->tenant_id)
                    ->where('code', 'ADM-01')
                    ->whereNull('deleted_at')
                    ->value('id');

                $ger01Id = DB::table('positions')
                    ->where('tenant_id', $row->tenant_id)
                    ->where('code', 'GER-01')
                    ->whereNull('deleted_at')
                    ->value('id');

                DB::table('positions')->insert([
                    'tenant_id' => $row->tenant_id,
                    'department_id' => $recDeptId,
                    'parent_id' => $adm01Id ?? $ger01Id,
                    'level' => 3,
                    'title' => 'Recepcionista',
                    'code' => 'REC-01',
                    'is_management' => false,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('positions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('permission_group_id');
            $table->dropColumn(['default_permissions', 'default_role_name']);
        });
    }
};
