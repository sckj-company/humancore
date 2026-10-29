<?php

namespace App\Http\Requests\V1\Employee;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreEmployeeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('create_employee');
    }

    public function rules(): array
    {
        return [
            'first_name' => ['required', 'string', 'max:150'],
            'last_name' => ['required', 'string', 'max:150'],
            'employee_code' => ['nullable', 'string', 'max:50'],
            'email' => ['required', 'email', 'max:255', Rule::unique('employees', 'email')->whereNull('deleted_at')],
            'phone' => ['nullable', 'string', 'max:50'],
            'alternative_phone' => ['nullable', 'string', 'max:50'],
            'birth_date' => ['nullable', 'date', 'before:today'],
            'gender' => ['nullable', Rule::in(['male', 'female', 'other'])],
            'marital_status' => ['nullable', Rule::in(['single', 'married', 'divorced', 'widowed'])],
            'nationality' => ['nullable', 'string', 'max:100'],
            'address' => ['nullable', 'string'],
            'city' => ['nullable', 'string', 'max:150'],
            'state' => ['nullable', 'string', 'max:100'],
            'country' => ['nullable', 'string', 'max:100'],
            'postal_code' => ['nullable', 'string', 'max:20'],
            'id_document_type' => ['nullable', 'string', 'max:50'],
            'id_document_number' => ['nullable', 'string', 'max:100'],
            'id_document_expiry' => ['nullable', 'date'],
            'tax_id' => ['nullable', 'string', 'max:100'],
            'social_security_id' => ['nullable', 'string', 'max:100'],
            'photo' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
            'status' => ['required', Rule::in(['active', 'inactive', 'suspended', 'terminated'])],
            'hired_at' => ['nullable', 'date'],
            'probation_end' => ['nullable', 'date', 'after_or_equal:hired_at'],
            'department_id' => ['nullable', 'integer', Rule::exists('departments', 'id')],
            'position_id' => ['nullable', 'integer', Rule::exists('positions', 'id')],
            'manager_id' => ['nullable', 'integer', Rule::exists('employees', 'id')],
            'user_id' => ['nullable', 'integer', Rule::exists('users', 'id')],

            // Informações Contratuais (Aba Contrato)
            'contract_type' => ['nullable', Rule::in(['permanent', 'fixed_term', 'temporary', 'probation', 'internship', 'outsourced'])],
            'base_salary' => ['nullable', 'numeric', 'min:0'],
            'salary_frequency' => ['nullable', Rule::in(['monthly', 'biweekly', 'weekly', 'hourly'])],
            'work_hours_per_week' => ['nullable', 'numeric', 'min:1', 'max:168'],
            'contract_start_date' => ['nullable', 'date'],
            'contract_end_date' => ['nullable', 'date', 'after_or_equal:contract_start_date'],
            'contract_signed_at' => ['nullable', 'date'],
            'contract_notes' => ['nullable', 'string'],
            'contract_file' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png,webp,doc,docx', 'max:10240'],

            // Documentos Anexados (Imagens ou PDFs)
            'documents' => ['nullable', 'array'],
            'documents.*' => ['file', 'mimes:pdf,jpg,jpeg,png,webp,doc,docx', 'max:10240'],
            'document_names' => ['nullable', 'array'],
            'document_names.*' => ['nullable', 'string', 'max:255'],
            'document_types' => ['nullable', 'array'],
            'document_types.*' => ['nullable', 'string', 'max:50'],
        ];
    }

    public function messages(): array
    {
        return [
            'first_name.required' => 'O nome é obrigatório.',
            'last_name.required' => 'O apelido é obrigatório.',
            'email.required' => 'O email é obrigatório.',
            'email.unique' => 'Já existe um funcionário com este email.',
            'status.required' => 'O estado é obrigatório.',
            'contract_end_date.after_or_equal' => 'A data de término do contrato deve ser posterior ou igual à data de início.',
        ];
    }
}
