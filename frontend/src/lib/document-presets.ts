import type { DocumentRequirement } from '@/types'

/**
 * Catálogo abrangente de documentos obrigatórios e opcionais no contexto laboral angolano.
 */
export const ANGOLA_DOCUMENT_PRESETS: DocumentRequirement[] = [
  { type: 'id_card', label: 'Bilhete de Identidade (BI)' },
  { type: 'passport', label: 'Passaporte' },
  { type: 'work_visa', label: 'Visto de Trabalho / Cartão de Residente' },
  { type: 'nif_card', label: 'Cartão de Contribuinte (NIF)' },
  { type: 'inss_card', label: 'Cartão / Comprovativo de Inscrição INSS' },
  { type: 'cv', label: 'Currículo (CV)' },
  { type: 'certificate', label: 'Certificado de Habilitações / Diploma' },
  { type: 'criminal_record', label: 'Registo Criminal' },
  { type: 'medical', label: 'Atestado Médico / Aptidão Física' },
  { type: 'vaccination_card', label: 'Cartão de Vacinas' },
  { type: 'residence_proof', label: 'Atestado / Comprovativo de Residência' },
  { type: 'bank_proof', label: 'Comprovativo Bancário (IBAN)' },
  { type: 'contract', label: 'Contrato de Trabalho' },
  { type: 'term', label: 'Termo de Responsabilidade' },
  { type: 'driver_license', label: 'Carta de Condução' },
  { type: 'work_card', label: 'Carteira / Cédula Profissional' },
  { type: 'photo', label: 'Fotografia Tipo Passe' },
  { type: 'military_record', label: 'Situação / Recenseamento Militar' },
  { type: 'family_proof', label: 'Assento de Nascimento / Agregado Familiar' },
  { type: 'previous_employment_letter', label: 'Declaração de Serviço Anterior' },
]

export const ANGOLA_DOCUMENT_TYPE_KEYS = new Set(ANGOLA_DOCUMENT_PRESETS.map((doc) => doc.type))

export const ANGOLA_DOCUMENT_LABELS: Record<string, string> = Object.fromEntries(
  ANGOLA_DOCUMENT_PRESETS.map((doc) => [doc.type, doc.label]),
)
