# Especificação Funcional --- Sistema de Processamento Salarial em Angola

**Versão:** 1.0\
**Data:** Novembro de 2026\
**Âmbito:** Recursos Humanos e processamento de salários\
**Moeda de referência:** Kwanza (Kz)\
**Estado:** Documento de requisitos e orientação técnica --- sujeito a
validação jurídica, fiscal e contabilística antes de entrar em produção.

------------------------------------------------------------------------

## 1. Objectivo

Este documento descreve os requisitos funcionais, regras de negócio,
estrutura de dados e controlos necessários para implementar um sistema
de processamento salarial para entidades empregadoras em Angola.

O sistema deverá permitir:

-   Registar trabalhadores e respectivos contratos;
-   Configurar salários, subsídios, prémios e outros componentes
    remuneratórios;
-   Registar assiduidade, faltas, férias, licenças e horas
    extraordinárias;
-   Calcular remunerações brutas, contribuições para a Segurança Social,
    IRT e outros descontos legalmente admissíveis;
-   Apurar o valor líquido a pagar;
-   Gerar folhas salariais, recibos e mapas de apoio às obrigações
    legais;
-   Manter histórico, rastreabilidade e auditoria de cada processamento.

**Princípio essencial:** o sistema não deve assumir que todos os
subsídios têm o mesmo tratamento fiscal ou contributivo. Cada componente
deve ter incidências configuráveis e juridicamente validadas.

## 2. Enquadramento legal e ressalvas

A solução deve considerar, entre outros diplomas e instrumentos
aplicáveis:

1.  **Lei n.º 12/23, de 27 de Dezembro --- Lei Geral do Trabalho
    (LGT)**;
2.  Legislação e regulamentação em vigor sobre protecção social
    obrigatória e contribuições para o INSS;
3.  Código do Imposto sobre os Rendimentos do Trabalho (IRT),
    respectivas alterações, tabelas e instruções da Administração Geral
    Tributária (AGT);
4.  Legislação sobre férias, feriados, trabalho extraordinário, trabalho
    nocturno, faltas, licenças e demais prestações laborais;
5.  Regras contabilísticas, declarativas e documentais aplicáveis à
    entidade empregadora.

### 2.1. Validação obrigatória antes da produção

As taxas, escalões, parcelas fixas, limites de isenção, bases de
incidência, fórmulas de cálculo e prazos legais devem ser confirmados em
fontes oficiais e actualizados por contabilista, fiscalista ou jurista
habilitado.

Este documento **não substitui aconselhamento jurídico, fiscal ou
contabilístico**. Não constitui uma certificação de conformidade legal.

Não se deve copiar automaticamente para o software qualquer taxa ou
tabela apresentada em exemplos, documentos antigos ou respostas
informais. Em particular:

-   Confirmar a versão da tabela de IRT aplicável ao período de
    processamento;
-   Confirmar a taxa contributiva do trabalhador e da entidade
    empregadora, bem como a respectiva base de incidência;
-   Confirmar o tratamento de cada subsídio, prémio, benefício e
    indemnização;
-   Confirmar os limites e condições dos descontos permitidos;
-   Confirmar as regras de cálculo de faltas, férias, horas
    extraordinárias e trabalho nocturno;
-   Confirmar regras especiais por sector, tipo de contrato, categoria
    profissional ou regime de trabalho.

### 2.2. Distinção entre salário bruto, salário líquido e custo da entidade empregadora

-   **Remuneração bruta:** soma das componentes remuneratórias devidas
    ao trabalhador, segundo as regras aplicáveis.
-   **Descontos do trabalhador:** valores legalmente deduzidos à
    remuneração, como contribuições do trabalhador para a Segurança
    Social, IRT e outros descontos admissíveis.
-   **Remuneração líquida:** valor a entregar ao trabalhador depois dos
    descontos aplicáveis.
-   **Encargos da entidade empregadora:** contribuições e outros custos
    suportados pela entidade empregadora. Não devem ser subtraídos ao
    salário líquido do trabalhador.

O sistema deve apresentar estes conceitos separadamente para evitar
confusão entre o valor recebido pelo trabalhador e o custo total da
entidade empregadora.

## 3. Estrutura funcional do módulo

O módulo de Recursos Humanos e processamento salarial deve estar
organizado nas seguintes áreas.

### 3.1. Cadastro de trabalhadores

Registar, no mínimo:

-   Identificador interno do trabalhador;
-   Nome completo;
-   Dados de identificação necessários;
-   Contactos e endereço, quando necessários;
-   Número de inscrição na Segurança Social, quando aplicável;
-   Dados fiscais necessários ao processamento;
-   Departamento, centro de custo e local de trabalho;
-   Categoria, função e horário;
-   Tipo e estado do contrato;
-   Data de admissão e, quando aplicável, data de cessação;
-   Dados bancários para pagamento, com acesso restrito;
-   Situação laboral e histórico de alterações.

Os dados pessoais devem ser recolhidos apenas na medida necessária,
protegidos por permissões e tratados de acordo com as normas aplicáveis
de privacidade e protecção de dados.

### 3.2. Contratos e condições remuneratórias

Cada trabalhador poderá ter um ou mais registos históricos de contrato,
contendo:

-   Tipo de contrato;
-   Data de início e fim;
-   Regime de trabalho;
-   Período normal de trabalho;
-   Salário-base;
-   Moeda;
-   Categoria ou função;
-   Centro de custo;
-   Condições especiais;
-   Componentes remuneratórias associadas;
-   Data de início de vigência de cada alteração.

Uma alteração salarial não deve apagar o valor anterior. Deve criar um
novo registo com data de vigência, preservando o histórico.

### 3.3. Componentes remuneratórias

O sistema deve permitir criar componentes configuráveis, por exemplo:

-   Salário-base;
-   Subsídio de alimentação;
-   Subsídio de transporte;
-   Subsídio de habitação;
-   Subsídio de função;
-   Subsídio de férias, quando aplicável;
-   Subsídio de Natal, quando aplicável;
-   Prémios;
-   Comissões;
-   Gratificações;
-   Horas extraordinárias;
-   Trabalho nocturno;
-   Outros complementos legalmente admissíveis.

Cada componente deve ter uma ficha de configuração com:

  -----------------------------------------------------------------------
  Campo                               Finalidade
  ----------------------------------- -----------------------------------
  Código                              Identificador único

  Designação                          Nome apresentado no sistema e no
                                      recibo

  Natureza                            Remuneração, desconto, benefício ou
                                      encargo patronal

  Método                              Valor fixo, percentagem, quantidade
                                      × preço ou fórmula autorizada

  Incidência INSS                     Indica se integra a base
                                      contributiva, conforme regra
                                      validada

  Incidência IRT                      Indica se integra a matéria
                                      colectável, conforme regra validada

  Sujeito a proporcionalidade         Define se pode ser
                                      proporcionalizado

  Recorrência                         Mensal, pontual ou por ocorrência

  Vigência                            Data inicial e final

  Conta contabilística                Conta associada, se aplicável

  Estado                              Activo ou inactivo
  -----------------------------------------------------------------------

**Ressalva:** as opções de incidência não devem ser decididas apenas
pelo nome do subsídio. Devem resultar da natureza efectiva da prestação
e da legislação em vigor.

### 3.4. Assiduidade e ocorrências

Permitir registar ou importar:

-   Dias e horas trabalhados;
-   Faltas justificadas e injustificadas;
-   Atrasos e saídas antecipadas;
-   Férias;
-   Licenças;
-   Baixas ou impedimentos legalmente reconhecidos;
-   Trabalho em feriados e dias de descanso;
-   Trabalho nocturno;
-   Horas extraordinárias;
-   Outras ocorrências que afectem a remuneração.

Cada ocorrência deve conter trabalhador, período, quantidade, motivo,
documento de suporte quando necessário, estado de aprovação e utilizador
responsável.

O sistema não deve aplicar automaticamente uma penalização ou desconto
sem uma regra legal validada e sem verificar as condições aplicáveis.

### 3.5. Motor de cálculo salarial

O motor deve executar o processamento de forma determinística,
reproduzível e auditável.

Deve calcular separadamente:

1.  Componentes remuneratórias;
2.  Ajustamentos por assiduidade e ocorrências;
3.  Base contributiva do INSS;
4.  Contribuição do trabalhador;
5.  Contribuição da entidade empregadora;
6.  Rendimentos sujeitos a IRT;
7.  Deduções legalmente admitidas para efeitos de IRT;
8.  Matéria colectável;
9.  IRT;
10. Outros descontos autorizados;
11. Remuneração líquida;
12. Custo total da entidade empregadora.

O motor deve utilizar as regras e tabelas cuja vigência corresponda ao
período processado.

### 3.6. Processamento e aprovação

Fluxo recomendado:

1.  Abrir o período salarial;
2.  Seleccionar trabalhadores abrangidos;
3.  Importar ou validar assiduidade;
4.  Registar componentes variáveis;
5.  Executar simulação;
6.  Analisar erros e alertas;
7.  Submeter para aprovação;
8.  Aprovar e fechar a folha;
9.  Gerar recibos e mapas;
10. Registar pagamento ou exportar ficheiro bancário, se integrado.

O processamento deve ter estados como:

-   Em preparação;
-   Em simulação;
-   Pendente de validação;
-   Pendente de aprovação;
-   Aprovado;
-   Fechado;
-   Pago;
-   Anulado ou reaberto, mediante autorização e motivo.

Uma folha fechada não deve ser alterada silenciosamente. Correcções
devem ser efectuadas por um procedimento controlado, com registo da
versão anterior, motivo, responsável e impacto.

## 4. Regras e fórmulas de cálculo

As fórmulas seguintes representam a arquitectura lógica do cálculo. As
bases e incidências concretas devem ser parametrizadas de acordo com a
legislação confirmada.

### 4.1. Total de componentes remuneratórias

O sistema deve somar as componentes devidas no período:

`Total de remunerações = soma das componentes remuneratórias aplicáveis`

O total apresentado no recibo deve permitir consultar cada componente
individualmente.

### 4.2. Base contributiva e INSS

A base contributiva deve ser formada apenas pelas componentes que a
legislação determinar como sujeitas a contribuição.

`Base contributiva = soma das componentes sujeitas a INSS`

`INSS do trabalhador = base contributiva × taxa do trabalhador`

`INSS da entidade empregadora = base contributiva patronal × taxa da entidade empregadora`

As taxas, limites, exclusões e regras de arredondamento devem ser
obtidos de parâmetros legais com período de vigência. A contribuição
patronal é um encargo da entidade empregadora e não deve ser subtraída
ao trabalhador.

### 4.3. Matéria colectável e IRT

A matéria colectável deve ser apurada segundo as regras fiscais
aplicáveis ao Grupo e à situação do trabalhador.

Modelo conceptual:

`Matéria colectável = rendimentos tributáveis − deduções legalmente admitidas`

A fórmula exacta, incluindo o tratamento da contribuição para a
Segurança Social, isenções, limites e deduções, deve seguir a legislação
e a tabela oficial aplicáveis ao período.

Quando a tabela for progressiva e utilizar parcela fixa, taxa e limite
inferior do escalão, poderá ser representada por:

`IRT = parcela fixa + (matéria colectável − limite inferior aplicável) × taxa`

Esta expressão é apenas um modelo matemático. O sistema deve implementar
a fórmula exacta da tabela oficial, incluindo escalões, limites,
arredondamentos e condições especiais. Não se deve presumir que todas as
tabelas usam a mesma estrutura.

### 4.4. Outros descontos

Podem existir descontos adicionais, desde que tenham fundamento legal,
contratual ou autorização válida, conforme o caso.

Exemplos que podem exigir tratamento próprio:

-   Adiantamentos salariais;
-   Empréstimos concedidos ao trabalhador;
-   Descontos autorizados;
-   Decisões judiciais ou outras retenções legalmente exigíveis;
-   Acertos de processamento.

O sistema deve distinguir descontos obrigatórios de descontos
facultativos ou dependentes de autorização. Deve validar limites legais
aplicáveis e impedir descontos arbitrários.

Cada desconto configurado deve identificar o trabalhador, a natureza
(incluindo tipos específicos definidos pela entidade), a forma de cálculo
(valor fixo por período ou percentagem), a recorrência e, quando
aplicável, o montante total e o número de prestações. O valor da prestação
deve ser calculado a partir do montante total e do número de prestações,
em vez de ser introduzido como um valor independente. A configuração
deve ainda indicar se o desconto é obrigatório e permitir registar o
fundamento legal, contratual ou a autorização correspondente.
Para um valor fixo, quando apenas o valor por período e o número de
prestações são indicados, o montante total é calculado automaticamente.
Uma percentagem com número limitado de prestações exige também um
montante total para limitar o saldo.

Descontos activos configurados para o trabalhador são incluídos no
processamento: valores percentuais incidem sobre a remuneração bruta do
período e valores fixos usam o valor por período ou a prestação
calculada. Quando existe um montante total, o processamento limita a
prestação ao saldo em aberto. O registo do pagamento actualiza o montante
pago e conclui descontos pontuais ou cujo total tenha sido liquidado.

### 4.5. Remuneração líquida

Modelo geral:

`Remuneração líquida = remunerações devidas − descontos do trabalhador`

O cálculo deve considerar os componentes e descontos aplicáveis ao
trabalhador e ao período. Os encargos patronais não entram nesta
subtracção.

### 4.6. Custo total da entidade empregadora

Modelo geral:

`Custo da entidade empregadora = remunerações e benefícios suportados + encargos patronais`

O relatório de custo deve identificar cada parcela e não confundir custo
patronal com remuneração líquida.

## 5. Exemplo meramente ilustrativo

Considere-se um trabalhador com os seguintes valores:

  Componente                       Valor
  ------------------------- ------------
  Salário-base                200.000 Kz
  Subsídio de alimentação      20.000 Kz
  Subsídio de transporte       15.000 Kz
  Total nominal               235.000 Kz

Este exemplo **não determina** que os três componentes estejam sujeitos
às mesmas contribuições ou impostos.

Para calcular o valor líquido, o sistema deve primeiro verificar, para
cada componente, a incidência legal de INSS e IRT. Só depois deve apurar
as respectivas bases, aplicar as taxas e tabelas em vigor e deduzir os
valores legalmente aplicáveis.

Não se deve usar um resultado numérico de salário líquido sem conhecer e
validar:

-   A incidência contributiva de cada componente;
-   A incidência fiscal de cada componente;
-   A tabela de IRT aplicável ao período;
-   As deduções e condições individuais relevantes;
-   Outros descontos válidos;
-   As regras de arredondamento.

## 6. Recibo de salário

Cada recibo deve apresentar, de forma clara:

### Identificação

-   Entidade empregadora;
-   Trabalhador;
-   Número interno;
-   Período de referência;
-   Categoria ou função;
-   Data de processamento;
-   Data de pagamento, quando conhecida.

### Abonos e remunerações

-   Salário-base;
-   Cada subsídio;
-   Prémios e comissões;
-   Horas extraordinárias;
-   Outros abonos;
-   Total de remunerações.

### Descontos do trabalhador

-   Base e valor da contribuição para o INSS;
-   Matéria colectável e cálculo do IRT, quando aplicável;
-   Outros descontos, com descrição;
-   Total de descontos.

### Resultado

-   Remuneração líquida;
-   Moeda;
-   Meio de pagamento, se aplicável;
-   Informação complementar exigida por lei ou pela entidade.

O recibo deve permitir compreender a origem de cada valor e, quando
aplicável, consultar a memória de cálculo.

## 7. Relatórios e mapas

O módulo deve disponibilizar:

-   Folha salarial mensal;
-   Recibos individuais;
-   Resumo de remunerações por departamento;
-   Resumo de descontos por tipo;
-   Mapa de contribuições do trabalhador e da entidade empregadora;
-   Mapa de IRT;
-   Mapa de encargos patronais;
-   Relatório de custo por centro de custo;
-   Histórico de salários por trabalhador;
-   Relatório de faltas e horas extraordinárias;
-   Relatório de diferenças entre simulações e folhas aprovadas;
-   Mapa de pagamentos.

Os mapas oficiais devem ser adaptados aos formatos e requisitos
efectivamente publicados pelas entidades competentes. Um relatório
interno não deve ser apresentado como declaração oficial se não cumprir
os requisitos aplicáveis.

## 8. Modelo de dados recomendado

A seguinte estrutura é uma proposta inicial. Pode ser adaptada à
arquitectura e convenções do ERP.

  Entidade                   Responsabilidade
  -------------------------- -----------------------------------------------
  `Funcionario`              Dados do trabalhador
  `ContratoTrabalho`         Contrato e condições laborais
  `HistoricoSalarial`        Evolução do salário e condições
  `ComponenteSalarial`       Catálogo de abonos, descontos e encargos
  `RegraSalarial`            Fórmulas e regras parametrizadas
  `TabelaIRT`                Escalões, taxas, parcelas e vigências
  `RegraINSS`                Taxas, bases, exclusões e vigências
  `OcorrenciaAssiduidade`    Faltas, atrasos, férias e licenças
  `HoraExtra`                Quantidades e regras de horas extraordinárias
  `ProcessamentoSalarial`    Cabeçalho da folha por período
  `LinhaProcessamento`       Resultado individual por trabalhador
  `DetalheProcessamento`     Componentes e memória de cálculo
  `ReciboSalario`            Recibo emitido
  `AprovacaoProcessamento`   Aprovações e responsáveis
  `PagamentoSalario`         Liquidação e referência de pagamento
  `Auditoria`                Histórico de operações e alterações

### 8.1. Requisitos de vigência

As regras fiscais e contributivas devem guardar, no mínimo:

-   Identificador e código da regra;
-   Valor ou fórmula;
-   Data inicial de vigência;
-   Data final de vigência, quando existir;
-   Diploma ou fonte oficial;
-   Referência do artigo, tabela ou instrução;
-   Data de validação;
-   Responsável pela validação;
-   Estado (rascunho, validada, activa ou revogada);
-   Versão.

Não deve ser permitido que duas versões incompatíveis da mesma regra
estejam activas para o mesmo período, salvo se a própria legislação
prever enquadramentos distintos.

## 9. Requisitos técnicos e de segurança

### 9.1. Arquitectura

Para uma implementação baseada em Java, Spring Boot, PostgreSQL e
Angular, recomenda-se separar:

-   Gestão de trabalhadores e contratos;
-   Configuração de componentes;
-   Gestão de assiduidade;
-   Motor de cálculo;
-   Processamento e aprovação;
-   Recibos e relatórios;
-   Integrações fiscais, contributivas e bancárias.

O motor de cálculo deve ser independente da interface e testável por
unidade.

### 9.2. Segurança e permissões

Perfis possíveis:

-   Administrador de RH;
-   Técnico de RH;
-   Processador salarial;
-   Aprovador;
-   Contabilista;
-   Auditor;
-   Trabalhador (consulta do próprio recibo, se disponibilizada).

Aplicar o princípio do menor privilégio. Dados salariais, fiscais,
bancários e de identificação devem ter acesso restrito, registo de
consulta e protecção adequada.

### 9.3. Auditoria

Registar:

-   Quem criou ou alterou dados;
-   O que foi alterado;
-   Valor anterior e novo valor;
-   Data e hora;
-   Motivo;
-   Aprovação associada;
-   Versão das regras usadas no processamento.

A auditoria deve ser protegida contra alterações não autorizadas.

### 9.4. Precisão monetária

Definir uma política explícita para:

-   Casas decimais internas;
-   Arredondamento por componente ou no total;
-   Precisão das percentagens;
-   Tratamento de diferenças de arredondamento;
-   Moeda e formatação de apresentação.

A política deve respeitar os requisitos legais e contabilísticos
aplicáveis e ser testada com casos-limite.

## 10. Validações e controlos

Antes de fechar uma folha, o sistema deve verificar:

-   Se todos os trabalhadores têm contrato e condições válidas no
    período;
-   Se não existem componentes duplicadas;
-   Se as regras de INSS e IRT estão validadas e vigentes;
-   Se as incidências de cada componente estão configuradas;
-   Se existem faltas ou horas extraordinárias por aprovar;
-   Se há valores negativos ou fora dos limites configurados;
-   Se os descontos respeitam os limites legais aplicáveis;
-   Se a remuneração líquida foi calculada;
-   Se a soma dos detalhes coincide com os totais;
-   Se o período não foi fechado anteriormente;
-   Se existe aprovação por utilizador autorizado.

Alertas devem distinguir erros impeditivos de avisos que exigem revisão.

## 11. Testes obrigatórios

Criar testes automatizados para, pelo menos:

1.  Trabalhador sem componentes variáveis;
2.  Trabalhador com vários subsídios e incidências diferentes;
3.  Trabalhador abrangido por diferentes escalões de IRT;
4.  Alteração de tabela fiscal entre períodos;
5.  Alteração de salário a meio do período;
6.  Admissão ou cessação durante o período;
7.  Faltas e licenças;
8.  Horas extraordinárias e trabalho nocturno;
9.  Descontos autorizados e limites aplicáveis;
10. Arredondamentos;
11. Reprocessamento e correcção de folha;
12. Trabalhador sem pagamento ou com valor líquido nulo, quando
    legalmente possível.

Os resultados esperados dos testes fiscais e contributivos devem ser
confirmados por um especialista e confrontados com exemplos oficiais.

## 12. Plano de implementação

### Fase 1 --- Levantamento e validação legal

-   Reunir diplomas e tabelas oficiais actualizados;
-   Validar incidências de INSS e IRT;
-   Definir regras por tipo de remuneração;
-   Validar faltas, férias e horas extraordinárias;
-   Aprovar os requisitos com RH e contabilidade.

### Fase 2 --- Cadastro e parametrização

-   Implementar trabalhadores e contratos;
-   Criar catálogo de componentes;
-   Criar tabelas de INSS e IRT com vigência;
-   Implementar permissões e auditoria.

### Fase 3 --- Motor de cálculo

-   Implementar bases de incidência;
-   Implementar cálculo de INSS;
-   Implementar cálculo de IRT;
-   Implementar descontos e remuneração líquida;
-   Criar memória de cálculo e testes automatizados.

### Fase 4 --- Processamento e documentos

-   Implementar processamento mensal;
-   Implementar simulação e aprovação;
-   Gerar recibos;
-   Gerar mapas e relatórios;
-   Implementar histórico e reprocessamento controlado.

### Fase 5 --- Homologação e entrada em produção

-   Comparar resultados com folhas calculadas manualmente e validadas;
-   Executar processamento paralelo de um ou mais períodos;
-   Corrigir divergências;
-   Obter aprovação de RH, contabilidade e consultoria fiscal/jurídica;
-   Activar o módulo em produção;
-   Definir processo de actualização legal contínua.

## 13. Critérios de aceitação

O módulo só deverá ser considerado pronto para produção quando:

-   As regras legais tiverem fonte e validação documentadas;
-   As tabelas tiverem vigência e histórico;
-   O cálculo for reproduzível para qualquer folha fechada;
-   As incidências de cada componente forem configuráveis e
    justificadas;
-   Os encargos patronais estiverem separados dos descontos do
    trabalhador;
-   Os recibos apresentarem a memória dos valores;
-   A aprovação e a auditoria estiverem operacionais;
-   Os testes fiscais e contributivos tiverem sido validados;
-   RH e contabilidade tiverem aprovado os resultados;
-   Existir procedimento de actualização das regras legais.

## 14. Decisões pendentes antes do desenvolvimento

Antes de iniciar a implementação, confirmar:

1.  O módulo será integrado num ERP existente ou será independente?
2.  A entidade processará apenas trabalhadores do regime geral ou também
    regimes especiais?
3.  O processamento será mensal ou haverá outras periodicidades?
4.  A assiduidade será introduzida manualmente ou integrada com relógio
    de ponto?
5.  Haverá integração com bancos, INSS ou AGT?
6.  Os recibos serão assinados digitalmente ou apenas disponibilizados
    em PDF?
7.  Quem poderá preparar, validar, aprovar e fechar a folha?
8.  Qual o procedimento para retroactivos, acertos e folhas
    suplementares?

------------------------------------------------------------------------

## 15. Nota final de conformidade

Este documento é uma especificação funcional e técnica inicial. **Não
deve ser utilizado como fonte autónoma para determinar valores legais de
salários, IRT ou INSS.**

A legislação pode ser alterada e as regras podem depender da natureza da
remuneração, do contrato, do enquadramento do trabalhador e do período a
que o processamento respeita.

Antes da entrada em produção, a entidade deve obter e arquivar as
versões oficiais dos diplomas, tabelas e instruções aplicáveis, validar
as regras com profissionais competentes e manter um processo formal de
actualização legislativa.

**Regra de desenvolvimento:** nenhuma taxa, isenção, limite, parcela
fixa ou fórmula fiscal/contributiva deve ser introduzida como valor
definitivo sem fonte oficial, data de vigência e validação registadas no
sistema.
