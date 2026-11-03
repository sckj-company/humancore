# Plano de Implementação do Processamento Salarial

**Versão:** 1.0
**Data:** Novembro de 2026
**Âmbito:** Evolução do processamento salarial do Humancore para cálculo automático, auditável e parametrizado para Angola
**Referências:** [Especificação funcional de processamento salarial](especificacao_processamento_salarial_angola.md) e [Plano mestre de desenvolvimento](../MASTER_DEVELOPMENT_PLAN.md)

> Este plano define uma abordagem de implementação, não uma validação jurídica, fiscal ou contabilística. Nenhuma taxa, incidência, fórmula ou limite deve ser activado para produção sem fonte oficial, período de vigência e validação profissional registados.

## 1. Objectivo e resultado esperado

Evoluir a folha salarial existente para um fluxo que calcule automaticamente, por trabalhador e período, os abonos, ajustes, bases contributivas e fiscais, descontos, remuneração líquida e encargos patronais. Cada resultado deve ser reproduzível com a versão dos dados, regras e parâmetros usados, explicável no recibo e sujeito a validações e aprovação.

O resultado não é apenas um cálculo numérico. É um processamento controlado: o sistema identifica dados em falta ou regras não validadas, impede o fecho em caso de erro impeditivo e mantém evidência suficiente para auditoria e reprocessamento.

## 2. Contexto actual do Humancore

O projecto já tem uma base de folha salarial implementada em Laravel 13, React 19 e MySQL. A implementação existente inclui:

- Períodos e registos salariais em `payroll_periods` e `payroll_records`;
- Catálogo de componentes e associação a trabalhador/contrato em `salary_components` e `employee_salary_components`;
- `PayrollEngineService`, contexto de cálculo, regras de salário-base, subsídio, horas extraordinárias, faltas, atrasos, INSS e IRT;
- Processamento assíncrono por `ProcessPayrollJob`, endpoints para processar/aprovar/fechar e páginas de períodos e recibos;
- Testes de integração do cálculo, ciclo do período, recibo e isolamento entre tenants.

O estado “Done” do Payroll Engine no plano mestre deve ser entendido como conclusão da funcionalidade inicial, não como homologação legal ou prontidão para processamento oficial. O código actual contém pressupostos provisórios que precisam de ser substituídos ou formalmente validados antes da produção:

| Área | Comportamento actual observado | Evolução necessária |
|---|---|---|
| INSS | A regra usa uma taxa padrão configurável por tenant e calcula a base apenas sobre o salário-base. | Taxas, base, incidências, limites e vigência configuráveis por regra validada; distinguir trabalhador e entidade empregadora. |
| IRT | A regra usa escalões padrão embutidos no código e deriva a matéria colectável do salário-base e INSS. | Tabelas versionadas por período e enquadramento, com fórmula, deduções e fonte oficial validadas. |
| Componentes | O catálogo tem tipo, cálculo e `is_taxable`, mas não incidências independentes para INSS e IRT nem aprovação legal. | Configuração explícita de incidências, natureza, recorrência, vigência e validação. |
| Assiduidade | Faltas usam divisor 30; atraso usa divisor 220; o contexto soma registos sem validar aprovação ou regras de calendário. | Aplicar regras vigentes e ocorrências aprovadas, com bases de cálculo configuradas e memória de cálculo. |
| Contrato | O motor selecciona o contrato activo actual. | Seleccionar contrato e salário vigentes no período, incluindo alterações durante o período. |
| Precisão | As regras calculam com `float` e arredondam por regra. | Definir política decimal e arredondamento legal/contabilístico e aplicá-la de forma consistente. |
| Falhas e estado | Erros por trabalhador são registados e ignorados, e o período pode terminar como concluído. | Erros e avisos estruturados; processamento fica pendente/bloqueado se houver falhas impeditivas. |
| Aprovação e fecho | Aprovação e fecho existem, mas sem validação integral nem snapshot imutável das regras/dados. | Máquina de estados controlada, comparação de simulação, aprovação autorizada e fecho rastreável. |
| Detalhe do recibo | Os detalhes são guardados num JSON e o ecrã actual não apresenta a memória discriminada completa. | Itens discriminados no recibo, bases, taxas, fórmulas, versões e totais separados. |

## 3. Princípios de implementação

1. **Configuração legal, não pressuposição:** valores legais são dados versionados e validados, nunca constantes de produção ou defaults silenciosos.
2. **Separação contabilística:** remuneração bruta, descontos do trabalhador, IRT, encargos patronais e líquido são totais distintos.
3. **Reprodutibilidade:** a folha fechada conserva o snapshot de contratos, ocorrências, componentes, regras, parâmetros e versão do motor usados.
4. **Cálculo determinístico:** mesmas entradas e mesmas versões produzem os mesmos resultados, sem dependência da ordem de leitura ou estado mutável.
5. **Validação antes de aprovação:** lacunas legais, incidências em falta e ocorrências por aprovar são reportadas; erros impeditivos bloqueiam a aprovação e o fecho.
6. **Isolamento por tenant e menor privilégio:** todos os dados e acções respeitam o tenant, policies e permissões existentes.
7. **Fórmulas controladas:** não executar PHP, SQL ou código arbitrário fornecido por utilizadores. Para a primeira versão, suportar tipos de cálculo explícitos e fórmulas/tabelas representadas por dados validados.
8. **Migração compatível:** preservar folhas e recibos existentes; novas regras aplicam-se apenas aos períodos elegíveis e não reescrevem resultados fechados.

## 4. Arquitectura funcional proposta

O fluxo do motor deve ser organizado em etapas independentes e testáveis:

1. **Carregar o período:** tenant, datas, trabalhadores elegíveis, contratos vigentes, moeda e versão de configuração.
2. **Validar pré-condições:** período não fechado, ausência de duplicação, regras validadas e vigentes, contrato aplicável, componentes completas e ocorrências aprovadas.
3. **Recolher entradas:** salário e componentes vigentes, assiduidade, férias/licenças, horas extraordinárias, ajustes e descontos autorizados.
4. **Calcular remunerações:** salário-base proporcional quando aplicável e componentes de rendimento/benefício por tipo e ocorrência.
5. **Calcular bases:** agregar separadamente incidências contributivas do trabalhador e da entidade empregadora, rendimentos sujeitos a IRT e deduções admitidas.
6. **Calcular contribuições e imposto:** aplicar regras e tabelas da vigência correspondente e do enquadramento aplicável.
7. **Calcular líquido e custo patronal:** validar identidade dos totais e limites dos descontos.
8. **Persistir simulação:** registar itens, totais, alertas, erros, versões e snapshot; não substituir resultados aprovados ou fechados.
9. **Submeter e aprovar:** permitir revisão de totais e detalhes, guardar decisor, data e motivo de rejeição/reabertura.
10. **Fechar e emitir documentos:** tornar o resultado imutável, emitir recibo e mapas; registar pagamento separadamente.

O `PayrollEngineService` existente pode continuar como ponto de orquestração durante a transição, mas o cálculo deve ser extraído progressivamente para serviços de recolha, validação, avaliação de componentes e cálculo fiscal/contributivo. As regras devem receber um contexto imutável e devolver resultados tipados, em vez de depender de mutações globais ou de `float` sem política comum.

## 5. Evolução de dados

As migrações concretas devem ser definidas após o levantamento do esquema e dos dados existentes. A proposta lógica é:

### 5.1. Componentes e atribuições

Evoluir `salary_components` e `employee_salary_components` para suportar:

- Natureza: rendimento, benefício, desconto do trabalhador ou encargo patronal;
- Incidência INSS do trabalhador, incidência INSS patronal e incidência IRT, com referência à regra que determina cada incidência;
- Método de cálculo suportado, recorrência, proporcionalidade e moeda;
- Vigência inicial/final e estado (rascunho, validado, activo, revogado);
- Atribuição ao contrato com vigência, valor/percentagem, quantidade e origem;
- Fonte oficial, referência, data e responsável pela validação dos atributos legais.

Não tratar `is_taxable` como equivalente a incidência legal completa. Fazer migração dos valores actuais para rascunho ou estado a validar; não inferir incidências pelo nome do componente.

### 5.2. Regras legais e tabelas

Criar entidades versionadas para regras INSS, tabelas IRT/escalões, deduções e regras laborais parametrizadas, com:

- País/regime e enquadramento a que se aplicam;
- Identificador, versão, parâmetros estruturados e intervalos de vigência;
- Fonte oficial, artigo/tabela, data de validação, responsável e estado;
- Validação de sobreposição de vigências incompatíveis;
- Imutabilidade lógica das versões já usadas num processamento fechado.

O formato exacto dos escalões deve suportar a estrutura oficial validada; não assumir que todas as tabelas usam apenas limite inferior, limite superior e taxa.

### 5.3. Resultado e auditoria

- Preservar `payroll_records` como resumo do trabalhador no período, acrescentando campos necessários para bases contributivas, matéria colectável, contribuição patronal, custo patronal, moeda, estado de validação e snapshot/versionamento.
- Considerar uma tabela `payroll_record_items` para cada abono, desconto, imposto, contribuição e ajuste, incluindo base, quantidade, taxa, montante, componente/regra e origem. Manter `details` para snapshot de cálculo/compatibilidade, não como única fonte consultável do recibo.
- Registar no processamento o conjunto de versões e um resumo/hash das entradas congeladas. Definir retenção e protecção dos dados salariais e bancários.
- Guardar eventos de transição de estado, aprovação, fecho, anulação/reabertura e respectivos motivos, actor e timestamp.

## 6. Fluxo operacional e estados

Fluxo recomendado: **Em preparação → Em simulação → Pendente de validação → Pendente de aprovação → Aprovado → Fechado → Pago**. Deve existir estado de falha/impedimento. Anulação ou reabertura requer permissão específica, motivo obrigatório e preservação da versão anterior.

- **Preparação:** criar período, seleccionar trabalhadores e verificar contratos e vigências.
- **Simulação:** executar cálculo idempotente em fila e devolver progresso, totais e erros por trabalhador.
- **Validação:** corrigir dados em falta; distinguir erro impeditivo de aviso que exige confirmação.
- **Aprovação:** comparar totais e variações relevantes com simulação anterior/período anterior; registar aprovador.
- **Fecho:** bloquear alterações às entradas e regras usadas; correcções passam por processamento suplementar ou reabertura autorizada.
- **Pagamento:** registar data, meio, referência e estado; integração bancária fica fora do primeiro âmbito.

O job deve ser idempotente por período/versão, impedir execuções concorrentes incompatíveis e sinalizar falha em vez de converter erros individuais em sucesso do período.

## 7. Plano por fases

### Fase 0 — Validação de regras e desenho (bloqueante para produção)

- Inventariar diplomas, tabelas e instruções oficiais aplicáveis ao período inicial;
- Obter validação de contabilista/fiscalista/jurista para incidências de cada componente, taxas, bases, deduções, arredondamentos, faltas, horas extraordinárias, férias e retroactivos;
- Decidir enquadramentos suportados inicialmente, periodicidade, política de arredondamento, política de salário a meio do período e aprovação/fecho;
- Aprovar casos de referência com valores esperados e guardar fonte/versão.

**Saída:** matriz de regras validada, responsável nomeado e casos de cálculo assinados. Sem esta saída, só se implementa infraestrutura e simulação não oficial; não se activa cálculo legal em produção.

### Fase 1 — Modelo de regras e componentes versionadas

- Criar migrações, modelos, validação de vigência e administração do catálogo;
- Separar incidências do trabalhador, patronais e IRT;
- Importar configurações existentes como rascunho para revisão, sem assumir validade;
- Aplicar policies, auditoria e isolamento por tenant.

**Saída:** configurações podem ser criadas, revistas e aprovadas com histórico, sem constantes legais silenciosas.

### Fase 2 — Motor determinístico e memória de cálculo

- Definir contratos tipados de entrada/saída e política decimal;
- Implementar selecção de contrato/componentes por vigência e cálculo proporcional conforme regra validada;
- Implementar incidências, contribuições, IRT, deduções e custo patronal como etapas independentes;
- Persistir itens e snapshot de versões/entradas;
- Substituir defaults provisórios por bloqueio explícito quando não houver regra validada.

**Saída:** cálculos unitários reproduzíveis e discriminados, incluindo situações sem incidência e mudanças de vigência.

### Fase 3 — Dados variáveis e validações de processamento

- Ligar presenças, férias, licenças e horas extraordinárias apenas após aprovação e validação;
- Permitir componentes variáveis e descontos autorizados com origem documental e limites;
- Produzir lista de erros/avisos por trabalhador antes da aprovação;
- Cobrir admissão, cessação, mudança salarial no período e trabalhadores sem contrato elegível.

**Saída:** simulação não fecha silenciosamente quando faltam entradas ou aprovações.

### Fase 4 — Workflow, API e interface

- Evoluir os endpoints de período para simular, consultar validações, submeter, aprovar, rejeitar, fechar, reabrir/anular e registar pagamento;
- Expor estado, progresso do job, totais separados e itens da memória de cálculo;
- Actualizar as páginas existentes de períodos e detalhe, acrescentando simulação, revisão de alertas, aprovação e discriminação do recibo;
- Aplicar permissões específicas para preparar, validar, aprovar, fechar e consultar recibos próprios.

**Saída:** fluxo completo utilizável sem manipulação directa da base de dados.

### Fase 5 — Relatórios, homologação e activação

- Gerar folha mensal, mapa INSS trabalhador/empregador, mapa IRT, custo por centro de custo e recibo detalhado;
- Comparar um ou mais períodos em paralelo com folhas calculadas e validadas por RH/contabilidade;
- Resolver divergências e repetir testes de regressão;
- Obter aprovação formal das áreas competentes, documentar procedimento de actualização legal e só então activar produção;
- Manter integração bancária, submissões oficiais automáticas e regimes especiais fora do primeiro âmbito, salvo decisão de escopo aprovada.

**Saída:** homologação assinada, regras activas com vigência e procedimento de manutenção definido.

## 8. Alterações de API e experiência

Reutilizar os recursos REST `/api/v1/payroll/periods` e `/api/v1/payroll/records` e manter os padrões de Form Requests, Resources, Policies e TanStack Query já usados. A evolução deve disponibilizar operações distintas para:

- Criar/listar período e obter trabalhadores elegíveis;
- Iniciar simulação e consultar progresso/resultado;
- Consultar erros, avisos, totais e memória por trabalhador;
- Submeter para aprovação, aprovar/rejeitar, fechar e reabrir com autorização;
- Consultar/emitir recibo com itens e bases de cálculo;
- Registar pagamento e exportar mapas internos.

O frontend deve mostrar separadamente total bruto, descontos do trabalhador, IRT, líquido e encargos/custo patronal. As acções devem reflectir o estado actual e as permissões do utilizador. Os valores e rótulos de incidência devem permitir ver a regra e a vigência aplicadas.

## 9. Segurança, auditoria e operação

- Aplicar tenant scope e policy em cada consulta e mutação; testar tentativas de acesso cruzado em períodos, linhas, recibos e exportações.
- Restringir dados fiscais, bancários e identificadores ao menor privilégio; auditar consultas e alterações sensíveis de acordo com a política definida.
- Guardar valores anteriores/novos, motivo, actor, instante, aprovação e versão da regra.
- Usar transacções para consolidar registos de cada trabalhador; preservar erros detalhados sem dados pessoais desnecessários nos logs.
- Monitorizar duração, trabalhadores processados, falhas e reexecuções do job; permitir retomar sem duplicar linhas.
- Não editar folhas fechadas. Reabertura gera evento e nova versão, preservando o resultado original.

## 10. Estratégia de testes e aceitação

### Testes automatizados mínimos

- Componente fixa, variável, benefício, desconto e encargo patronal com incidências diferentes;
- INSS do trabalhador e empregador calculados em bases distintas e com vigências diferentes;
- Escalões IRT, deduções, limites e estrutura de tabela validada;
- Ausência de regra validada bloqueia o fecho e não usa fallback legal;
- Alteração de taxa/tabela entre períodos não modifica folha fechada;
- Alteração salarial, admissão e cessação a meio do período;
- Ocorrências aprovadas/rejeitadas, férias/licenças, atrasos e horas extraordinárias;
- Descontos autorizados, limites aplicáveis e líquido nulo/negativo conforme política validada;
- Precisão, arredondamento por componente/total e invariantes dos totais;
- Reprocessamento idempotente, falha parcial, concorrência, aprovação e reabertura;
- Permissões, isolamento multi-tenant e recibo próprio;
- Snapshot permite reproduzir folha após alteração de configuração.

### Critérios de aceitação para produção

- Todas as regras activas têm fonte, vigência, versão, validação e responsável;
- Cada componente tem incidências justificadas e configuração temporal;
- Totais do trabalhador e patronais são apresentados separadamente e reconciliam com os itens;
- Não existem defaults fiscais/contributivos silenciosos nem erros de cálculo ignorados;
- Simulação, validação, aprovação, fecho e reabertura são auditáveis e autorizados;
- Recibos mostram origem, bases, taxas e valores e correspondem ao resultado fechado;
- Casos oficiais/de referência foram aprovados por RH e contabilidade e os testes passam;
- Um processamento paralelo foi reconciliado e o procedimento de actualização legal foi aprovado.

## 11. Pressupostos e decisões pendentes

Este plano assume uma primeira implementação para processamento mensal do regime geral em Angola, integrada no Humancore, com cálculo e documentos internos. Antes de fechar o desenho, confirmar:

1. Regimes, sectores e categorias abrangidos no primeiro lançamento;
2. Periodicidade suportada e política para admissões, cessações, retroactivos e folhas suplementares;
3. Fontes oficiais e responsável pela validação e actualização das regras;
4. Tratamento por componente de INSS, IRT, proporcionalidade e arredondamentos;
5. Regras aprovadas de faltas, férias/licenças, horas extraordinárias e nocturnas;
6. Segregação de funções entre preparação, validação, aprovação, fecho e pagamento;
7. Formatos internos/oficiais de mapas e recibos, retenção documental e necessidade futura de integração bancária/AGT/INSS.

Enquanto estas decisões não forem aprovadas, componentes e taxas de exemplo existentes devem ser tratadas como configuração provisória para desenvolvimento/testes, nunca como parâmetro legal de produção.