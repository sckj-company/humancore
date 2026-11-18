<?php

use App\Support\PlanCatalog;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('plans')) {
            return;
        }

        $now = now();
        $allFeaturesTrue = array_fill_keys(array_keys(PlanCatalog::features()), true);

        $plans = [
            [
                'name' => 'Starter',
                'slug' => 'starter',
                'code' => 'HC-STARTER',
                'description' => 'Plano essencial para pequenas empresas gerirem colaboradores, presenças e férias.',
                'badge_text' => null,
                'visibility' => 'public',
                'is_active' => true,
                'sort_order' => 1,
                'billing_cycle' => 'monthly',
                'custom_cycle_days' => null,
                'currency' => 'AOA',
                'base_price' => 35000,
                'pricing_model' => 'flat',
                'included_employees' => 25,
                'extra_employee_price' => 0,
                'included_managed_tenants' => 0,
                'extra_managed_tenant_price' => 0,
                'setup_fee' => 0,
                'trial_days' => 0,
                'grace_period_days' => 5,
                'features' => array_merge(PlanCatalog::defaultFeatures(), [
                    'recruitment' => false,
                    'onboarding' => false,
                    'performance' => false,
                    'trainings' => false,
                    'biometric_integration' => false,
                    'attendance_qr' => false,
                    'ocr_identity' => false,
                    'white_label' => false,
                    'api_tokens' => false,
                ]),
                'limits' => array_merge(PlanCatalog::defaultLimits(), [
                    'max_employees' => 25,
                    'max_users' => 5,
                    'max_branches' => 1,
                    'max_departments' => 5,
                    'max_storage_mb' => 1024,
                    'max_ocr_requests_per_month' => 0,
                    'hard_limit_behavior' => 'block',
                ]),
                'agency_config' => PlanCatalog::defaultAgencyConfig(),
                'custom_rules' => ['support_tier' => 'email'],
            ],
            [
                'name' => 'Business Pro',
                'slug' => 'business-pro',
                'code' => 'HC-BIZ-PRO',
                'description' => 'RH completo com folha salarial Angola (INSS/IRT), QR Code, OCR, recrutamento e avaliação de desempenho.',
                'badge_text' => 'Mais Popular',
                'visibility' => 'public',
                'is_active' => true,
                'sort_order' => 2,
                'billing_cycle' => 'monthly',
                'custom_cycle_days' => null,
                'currency' => 'AOA',
                'base_price' => 85000,
                'pricing_model' => 'per_employee',
                'included_employees' => 100,
                'extra_employee_price' => 750,
                'included_managed_tenants' => 0,
                'extra_managed_tenant_price' => 0,
                'setup_fee' => 0,
                'trial_days' => 0,
                'grace_period_days' => 7,
                'features' => array_merge($allFeaturesTrue, [
                    'white_label' => false,
                    'api_tokens' => false,
                ]),
                'limits' => array_merge(PlanCatalog::defaultLimits(), [
                    'max_employees' => 100,
                    'max_users' => 25,
                    'max_branches' => 5,
                    'max_departments' => 25,
                    'max_storage_mb' => 10240,
                    'max_ocr_requests_per_month' => 200,
                    'hard_limit_behavior' => 'allow_and_bill_overage',
                ]),
                'agency_config' => PlanCatalog::defaultAgencyConfig(),
                'custom_rules' => ['support_tier' => 'priority'],
            ],
            [
                'name' => 'Parceiro / Contabilidade BPO',
                'slug' => 'parceiro-bpo',
                'code' => 'HC-PARTNER',
                'description' => 'Desenhado para consultoras de RH, escritórios de contabilidade e holdings gerirem múltiplas empresas clientes.',
                'badge_text' => 'Multi-Empresa',
                'visibility' => 'public',
                'is_active' => true,
                'sort_order' => 3,
                'billing_cycle' => 'monthly',
                'custom_cycle_days' => null,
                'currency' => 'AOA',
                'base_price' => 190000,
                'pricing_model' => 'hybrid',
                'included_employees' => 250,
                'extra_employee_price' => 500,
                'included_managed_tenants' => 10,
                'extra_managed_tenant_price' => 15000,
                'setup_fee' => 0,
                'trial_days' => 0,
                'grace_period_days' => 10,
                'features' => $allFeaturesTrue,
                'limits' => array_merge(PlanCatalog::defaultLimits(), [
                    'max_employees' => 250,
                    'max_users' => 50,
                    'max_branches' => 30,
                    'max_departments' => 100,
                    'max_storage_mb' => 51200,
                    'max_ocr_requests_per_month' => 1000,
                    'max_api_keys' => 10,
                    'hard_limit_behavior' => 'allow_and_bill_overage',
                ]),
                'agency_config' => [
                    'can_manage_other_tenants' => true,
                    'can_create_managed_tenants' => true,
                    'can_link_existing_tenants' => true,
                    'max_managed_tenants' => 10,
                    'max_hierarchy_depth' => 1,
                    'quota_scope' => 'pooled_under_manager',
                    'can_manage_child_users' => true,
                    'can_customize_child_permissions' => true,
                ],
                'custom_rules' => ['support_tier' => 'dedicated', 'consolidated_billing' => true],
            ],
            [
                'name' => 'Enterprise / Grupo Económico',
                'slug' => 'enterprise-corporate',
                'code' => 'HC-ENTERPRISE',
                'description' => 'Plano corporativo com funcionários e utilizadores ilimitados, gestão multi-empresa avançada, white-label, API e 2FA.',
                'badge_text' => 'Enterprise',
                'visibility' => 'public',
                'is_active' => true,
                'sort_order' => 4,
                'billing_cycle' => 'monthly',
                'custom_cycle_days' => null,
                'currency' => 'AOA',
                'base_price' => 350000,
                'pricing_model' => 'hybrid',
                'included_employees' => 0,
                'extra_employee_price' => 0,
                'included_managed_tenants' => 25,
                'extra_managed_tenant_price' => 10000,
                'setup_fee' => 0,
                'trial_days' => 0,
                'grace_period_days' => 15,
                'features' => $allFeaturesTrue,
                'limits' => [
                    'max_employees' => null,
                    'max_users' => null,
                    'max_branches' => null,
                    'max_departments' => null,
                    'max_storage_mb' => null,
                    'max_ocr_requests_per_month' => null,
                    'max_payroll_runs_per_month' => null,
                    'max_api_keys' => 50,
                    'hard_limit_behavior' => 'allow_and_bill_overage',
                ],
                'agency_config' => [
                    'can_manage_other_tenants' => true,
                    'can_create_managed_tenants' => true,
                    'can_link_existing_tenants' => true,
                    'max_managed_tenants' => 25,
                    'max_hierarchy_depth' => 2,
                    'quota_scope' => 'per_managed_tenant',
                    'can_manage_child_users' => true,
                    'can_customize_child_permissions' => true,
                ],
                'custom_rules' => ['support_tier' => 'enterprise_24_7', 'sla_hours' => 4],
            ],
        ];

        foreach ($plans as $planData) {
            $existing = DB::table('plans')
                ->where('slug', $planData['slug'])
                ->orWhere('code', $planData['code'])
                ->first();

            if ($existing) {
                if ($existing->deleted_at !== null) {
                    DB::table('plans')
                        ->where('id', $existing->id)
                        ->update([
                            'deleted_at' => null,
                            'is_active' => true,
                            'updated_at' => $now,
                        ]);
                }

                continue;
            }

            DB::table('plans')->insert([
                'name' => $planData['name'],
                'slug' => $planData['slug'],
                'code' => $planData['code'],
                'description' => $planData['description'],
                'badge_text' => $planData['badge_text'],
                'visibility' => $planData['visibility'],
                'is_active' => $planData['is_active'],
                'sort_order' => $planData['sort_order'],
                'billing_cycle' => $planData['billing_cycle'],
                'custom_cycle_days' => $planData['custom_cycle_days'],
                'currency' => $planData['currency'],
                'base_price' => $planData['base_price'],
                'pricing_model' => $planData['pricing_model'],
                'included_employees' => $planData['included_employees'],
                'extra_employee_price' => $planData['extra_employee_price'],
                'included_managed_tenants' => $planData['included_managed_tenants'],
                'extra_managed_tenant_price' => $planData['extra_managed_tenant_price'],
                'setup_fee' => $planData['setup_fee'],
                'trial_days' => $planData['trial_days'],
                'grace_period_days' => $planData['grace_period_days'],
                'features' => json_encode($planData['features'], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                'limits' => json_encode($planData['limits'], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                'agency_config' => json_encode($planData['agency_config'], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                'custom_rules' => json_encode($planData['custom_rules'], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                'created_by' => null,
                'created_at' => $now,
                'updated_at' => $now,
                'deleted_at' => null,
            ]);
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('plans')) {
            return;
        }

        $slugs = ['starter', 'business-pro', 'parceiro-bpo', 'enterprise-corporate'];

        $referencedPlanIds = Schema::hasTable('tenant_subscriptions')
            ? DB::table('tenant_subscriptions')->pluck('plan_id')->all()
            : [];

        DB::table('plans')
            ->whereIn('slug', $slugs)
            ->when($referencedPlanIds !== [], fn ($query) => $query->whereNotIn('id', $referencedPlanIds))
            ->delete();
    }
};
