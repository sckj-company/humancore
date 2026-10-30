<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Adicionar campos angolanos à tabela de tenants.
     * - inss_number    : Número de inscrição no INSS
     * - legal_entity_type : Tipo jurídico (lda, sa, unipessoal, etc.)
     * - economic_sector   : Sector de actividade económica
     * - province          : Província angolana
     * - postal_code        : Código postal
     * - website            : Website da empresa
     */
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            // Adicionar apenas se as colunas ainda não existirem
            if (! Schema::hasColumn('tenants', 'inss_number')) {
                $table->string('inss_number')->nullable()->after('tax_id');
            }
            if (! Schema::hasColumn('tenants', 'legal_entity_type')) {
                $table->string('legal_entity_type')->nullable()->after('inss_number');
            }
            if (! Schema::hasColumn('tenants', 'economic_sector')) {
                $table->string('economic_sector')->nullable()->after('legal_entity_type');
            }
            if (! Schema::hasColumn('tenants', 'province')) {
                $table->string('province')->nullable()->after('city');
            }
            if (! Schema::hasColumn('tenants', 'postal_code')) {
                $table->string('postal_code', 20)->nullable()->after('province');
            }
            if (! Schema::hasColumn('tenants', 'website')) {
                $table->string('website')->nullable()->after('email');
            }
        });
    }

    public function down(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->dropColumnIfExists('inss_number');
            $table->dropColumnIfExists('legal_entity_type');
            $table->dropColumnIfExists('economic_sector');
            $table->dropColumnIfExists('province');
            $table->dropColumnIfExists('postal_code');
            $table->dropColumnIfExists('website');
        });
    }
};
