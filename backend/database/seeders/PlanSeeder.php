<?php

namespace Database\Seeders;

use App\Models\Plan;
use App\Support\PlanCatalog;
use Illuminate\Database\Seeder;

class PlanSeeder extends Seeder
{
    public function run(): void
    {
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
                'currency' => 'AOA',
                'base_price' => 35000,
                'pricing_model' => 'flat',
                'included_employees' => 25,
                'extra_employee_price' => 0,
                'included_managed_tenants' => 0,
                'extra_managed_tenant_price' => 0,
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
                'description' => 'RH completo com folha salarial Angola (INSS/IRT), QR Code, OCR e avaliação de desempenho.',
                'badge_text' => 'Mais Popular',
                'visibility' => 'public',
                'is_active' => true,
                'sort_order' => 2,
                'billing_cycle' => 'monthly',
                'currency' => 'AOA',
                'base_price' => 85000,
                'pricing_model' => 'per_employee',
                'included_employees' => 100,
                'extra_employee_price' => 750,
                'included_managed_tenants' => 0,
                'extra_managed_tenant_price' => 0,
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
                'currency' => 'AOA',
                'base_price' => 190000,
                'pricing_model' => 'hybrid',
                'included_employees' => 250,
                'extra_employee_price' => 500,
                'included_managed_tenants' => 10,
                'extra_managed_tenant_price' => 15000,
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
        ];

        foreach ($plans as $planData) {
            Plan::query()->updateOrCreate(
                ['slug' => $planData['slug']],
                $planData,
            );
        }
    }
}
