# Análise do ficheiro "Dados de RH"

Data da análise: 30/10/2026
Ficheiro analisado: `Datos_de_RH_20261029210852 (15).xlsx`

---

## 1. Visão geral

Base de dados de RH exportada de um formulário com fluxo de aprovação (parece ser do Jiandaoyun). Tem uma folha, "Datos de RH员工数据库", com cerca de 1.745 linhas e 107 colunas, em português e chinês.

Cada registo ocupa **duas linhas**:
- **Linha 1:** dados do trabalhador, da empresa e do processo.
- **Linha 2:** dados do modelo de contrato (tipo, ficheiro Word, estado de uso, credenciais INSS).

| Indicador | Valor |
|---|---|
| Trabalhadores (registos) | 933 |
| Empresas | 53 |
| Clientes | 54 |
| Período dos registos | 24/12/2023 a 28/10/2026 |
| Departamento responsável | D.RH (900 registos) |

Parece a base de uma prestadora de serviços de RH e contabilidade que gere os trabalhadores de várias empresas clientes em Angola.

---

## 2. Estrutura das colunas

| Bloco | Conteúdo |
|---|---|
| Cliente e empresa | Cliente, empresa, NIF, tipo de empresa, tipo de serviço contratado, estado do serviço, MAPESS |
| Modelos de contrato | Sede, motivo da mudança, tipo (determinado de 3 meses ou indeterminado), modelo, estado de uso |
| Dados do trabalhador | Nº de trabalhador (S.RH2026…), nome, telefone, contacto de emergência, morada, nacionalidade, nº de BI, departamento, categoria |
| Documentos (links) | BI ou passaporte, NIF, registo criminal, carta de condução, atestado de residência, certificado escolar, certificados profissionais |
| Situação laboral | Estado, data de entrada, estado do INSS, mês de início e fim do INSS, data e motivo de saída |
| Salários | Salário base, subsídios de alimentação e transporte, horas extra, adicionais, salário líquido |
| Contrato e INEFOP | Datas de início e fim, dias restantes, lembrete de vencimento, ficheiros Word/PDF, registo INEFOP |
| Fluxo de aprovação | Revisão, aprovação, responsáveis, datas de submissão e atualização, nó atual do processo |

---

## 3. Números principais

### Clientes com mais trabalhadores
| Cliente | Registos |
|---|---|
| Gu Fang-1 | 115 |
| Da Sheng Sino | 94 |
| Liu Liangzhe | 86 |
| Ni Bing | 41 |
| Majojor | 33 |
| SG-MAOG | 32 |
| Chen Geng | 25 |
| Zhang Kai | 22 |
| Gu Fang-2 | 20 |

188 registos não têm cliente preenchido.

### Situação laboral atual
| Estado | Registos |
|---|---|
| Em funções | 588 |
| Já saíram | 129 |
| Período experimental | 35 |
| Sem estado preenchido | 181 |

### Nacionalidade
Angola 873, China 59, Turquia 1.

### Departamentos e categorias
- 344 registos estão como "outros/não definido" e 312 em Vendas.
- Seguem-se Manutenção (79) e Administração (53).
- Categorias mais comuns: Vendedor (293), "outros" (147), Operador (31), Técnico (26), Pedreiro (23), Ajudante de obra (22), Motorista (21) e Assistente administrativo (21).

### Salários (713 registos com valores)
| Indicador | Valor |
|---|---|
| Salário base mediano | 100.000 Kz |
| Salário base máximo | 440.000 Kz |
| Salário líquido médio | cerca de 108.000 Kz |
| Salário líquido máximo | 600.000 Kz |

Os subsídios de alimentação e transporte são raros: a maioria tem 0.

### Serviços contratados
- Serviço gratuito de RH/contabilidade mensal: cerca de 566 registos (466 de "contrato de oferta" e 100 só de contabilidade).
- Serviço pago de RH mensal: 88 registos.
- Só contabilidade: 4 registos.
- 274 registos sem serviço preenchido.

### Saídas
As colunas de motivo de saída estão pouco preenchidas.

| Método | Registos |
|---|---|
| Fim de contrato | 10 |
| Saída voluntária | 5 |
| Acordo durante o contrato | 2 |
| Despedimento | 1 |

### Fluxo de aprovação
- 866 registos estão "em curso" e 67 sem estado.
- Por nó: Operação 457, Revisão 285, Início do processo 107, Aprovação 11.
- Revisão: 125 aprovados, 3 reprovados e 2 com informação incompleta.
- Aprovação final: 389 aprovados e 1 reprovado.

---

## 4. Problemas de qualidade dos dados

| Problema | Dimensão |
|---|---|
| Nº de BI em falta | 69 registos |
| Nº de BI repetido | 008099401HA040 aparece em 20 registos; outros números aparecem 2 ou 3 vezes |
| Telefone em falta | 48 registos |
| BI caducado | 47 registos ("Ja caduco") |
| NIF não ativo ("NAO") | 240 registos |
| Consulta de NIF por preencher | 484 registos |
| Registo criminal anexado | só 31 |
| Carta de condução anexada | só 14 |
| Atestado de residência anexado | só 22 |
| Certificado escolar anexado | só 35 |
| Contrato assinado ou observação | cerca de 90 registos |
| Contrato assinado em falta ou pendente | cerca de 30 notas, como "falta lista de contacto" ou "contrato assinado em falta" |
| Registo INEFOP | 29 registos preenchidos (18 "Sim" e 11 "Não") |
| Estado laboral vazio | 181 registos |
| Cliente vazio | 188 registos |
| Datas de validade de BI suspeitas | vários casos em 2034 e 2035 |
| Colunas sem nome | "Column1…Column42" |
| Estrutura | duas linhas por registo |

### Risco de segurança
A folha tem **utilizadores e palavras-passe do INSS** em texto simples (por exemplo "SENHA: 123456"). Tem também links diretos para documentos de identidade. Recomenda-se retirar estas colunas antes de partilhar o ficheiro.

---

## 5. Proposta de trabalho

### 5.1 Versão limpa em Excel
Um ficheiro novo, sem alterar o original, com:

1. **Trabalhadores:** uma linha por trabalhador, juntando as duas linhas de cada registo.
2. **Colunas renomeadas:** nomes claros em português, sem as colunas "Column…".
3. **Dados sensíveis removidos:** sem palavras-passe e sem links de documentos de identidade.
4. **Resumo por empresa:** total de trabalhadores, estado atual, massa salarial e pendências.
5. **Resumo por estado e departamento.**
6. **Folha de pendências:** os casos a corrigir (ver 5.2).

### 5.2 Lista de casos a corrigir
| Caso | O que contém |
|---|---|
| BI duplicado | Trabalhadores com o mesmo nº de BI, com o nome e a empresa |
| BI em falta | Registos sem nº de BI |
| BI caducado ou com data suspeita | Validade passada ou em 2034 e 2035 |
| NIF não ativo | Registos com "NAO" ou por consultar |
| Contrato em falta | Sem contrato assinado ou com nota de pendência |
| INEFOP por registar | Contratos sem registo no INEFOP |
| Estado em falta | Trabalhadores sem estado laboral |
| Cliente em falta | Registos sem cliente associado |
| Contactos em falta | Sem telefone ou contacto de emergência |

### 5.3 Ordem sugerida
1. Resolver os problemas de segurança (palavras-passe e links).
2. Corrigir BI duplicados ou em falta e BI caducados.
3. Regularizar contratos e INEFOP.
4. Preencher estado laboral e cliente.
5. Validar os resumos com a equipa de RH.

---

## 6. Próximos passos
- Confirmar quais colunas devem ficar na versão limpa.
- Decidir se o ficheiro limpo será partilhado com os clientes, o que exige remover mais dados pessoais.
- Definir quem corrige cada pendência e em que prazo.
