<?php

namespace App\Http\Requests\V1\Document;

use App\Models\EmployeeDocument;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreEmployeeDocumentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('create', EmployeeDocument::class);
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('is_confidential')) {
            $raw = $this->input('is_confidential');
            if (is_string($raw)) {
                $normalized = strtolower(trim($raw));
                if ($normalized === 'true') {
                    $this->merge(['is_confidential' => true]);
                } elseif ($normalized === 'false') {
                    $this->merge(['is_confidential' => false]);
                }
            }
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'employee_id' => ['required', 'integer', Rule::exists('employees', 'id')->where('tenant_id', tenant_id())],
            'name' => ['required', 'string', 'max:255'],
            'document_type' => ['required', 'string', 'max:50'],
            'file' => ['required', 'file', 'max:10240', 'mimes:pdf,jpg,jpeg,png,gif,webp,doc,docx,xls,xlsx,ppt,pptx,txt'],
            'expiry_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'is_confidential' => ['nullable', 'boolean'],
        ];
    }
}
