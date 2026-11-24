# Guia Prático: Como Atribuir Permissões de Forma Simples e Segura

Este guia explica, passo a passo e sem termos técnicos, como configurar permissões de acesso no sistema de forma rápida, segura e sem erros.

> **Regra de Ouro:** dê a cada utilizador apenas o acesso de que ele precisa para trabalhar (**princípio do menor privilégio**). Comece sempre por um **Perfil rápido** e ajuste apenas o necessário.

---

## 1. Como funciona o acesso de um utilizador

O que o utilizador vê e pode fazer no sistema depende de **4 camadas simples**:

1. **Papel base** (`Administrador`, `Gestor de RH`, `Gestor / Chefe`, `Funcionário`) — define o perfil inicial sugerido.
2. **Módulos** — define em quais áreas o utilizador pode entrar e o que pode fazer (*Sem acesso*, *Ver*, *Gerir* ou *Total*).
3. **Dados Sensíveis / Colunas** — controla se o utilizador pode ver ou editar informações confidenciais, como **salários, subsídios, descontos, NIF, INSS e contactos**.
4. **Acesso por Empresa e Departamento** — define em **quais empresas** e **quais departamentos** esse utilizador pode atuar.

---

## 2. Passo a Passo Rápido (em 4 passos)

Ao criar ou editar um utilizador (na gestão da empresa ou em **Super-admin → Utilizadores**):

### Passo 1 — Comece por um atalho (não marque tudo à mão)
Antes de mexer módulo por módulo, escolha **uma** destas três opções rápidas:
- **Perfis rápidos:** clique num dos botões no topo da janela de permissões:
  - **Só Leitura** — consulta dados e relatórios, sem alterar nada.
  - **RH Operacional** — gere funcionários, contratos, férias, presenças, documentos, recrutamento e formação.
  - **Folha & Financeiro** — acesso completo à folha salarial, recibos, componentes salariais, subsídios e descontos.
  - **Gestor de Equipa** — aprova férias/presenças e consulta a equipa, **sem ver salários nem dados fiscais**.
  - **Acesso Total** — acesso completo às funcionalidades da empresa.
- **Copiar de outro utilizador:** se já existe um colega com a mesma função, selecione-o em **Copiar permissões de utilizador...** (ou use **Copiar permissões** + **Colar de...**).
- **Grupo de Permissões:** se a equipa já tiver criado perfis padrão na aba **Grupos de permissões**, basta vincular o grupo correspondente.

### Passo 2 — Ajuste os módulos na aba **Módulos**
Para cada módulo (ex.: *Funcionários*, *Folha salarial*, *Ausências*), escolha um dos **4 níveis**:

| Nível | O que permite fazer | Quando usar |
| --- | --- | --- |
| **Sem acesso** | O módulo fica bloqueado/oculto. | Quando o utilizador não trabalha nessa área (ex.: Receção não precisa de *Folha salarial*). |
| **Ver** | Listar, consultar, exportar e imprimir dados (somente leitura) + ver campos do módulo. | Auditores, diretores que só acompanham números ou equipas de consulta. |
| **Gerir** | Tudo de **Ver** + criar, editar, aprovar, rejeitar, processar e configurar no dia a dia. **Não inclui eliminar** (nem fechar folha). | Maioria dos utilizadores operacionais (assistentes e gestores de RH, chefes de equipa). |
| **Total** | Todas as ações principais do módulo, incluindo **eliminar** registos e **fechar** folha salarial. | Apenas administradores da empresa ou responsáveis máximos pela área. |
| **Personalizado** | Aparece automaticamente quando ajustou permissões específicas no botão **Avançado**. | Casos pontuais (ex.: pode criar contratos, mas não pode aprovar descontos). |

> **Dica:** só abra o botão **Avançado** se precisar de ligar/desligar uma ação específica. O botão **Mostrar técnicas (+N)** fica oculto de propósito porque reúne ações raras (como restauro ou eliminação definitiva) que raramente precisam de ser alteradas.

### Passo 3 — Controle salários e dados privados na aba **Dados Sensíveis / Colunas**
Depois de definir os módulos, mude para a aba **Dados Sensíveis / Colunas**.

Aqui tem **4 botões de privacidade** imediatos:
- **Ver todos os dados** — permite visualizar todas as colunas e campos.
- **Editar todos os dados** — permite ver e alterar todas as colunas e campos.
- **Ocultar salários** — remove imediatamente o acesso a salários, subsídios, descontos, recibos e custos salariais em todos os módulos.
- **Ocultar dados pessoais/fiscais** — oculta NIF, identificação pessoal e morada/contactos.

Se quiser ajustar campo a campo, cada linha mostra duas opções lado a lado:
- **Ver** — o utilizador vê o campo/coluna nas listagens e fichas.
- **Editar** — o utilizador pode alterar o valor *(marcar **Editar** ativa automaticamente **Ver**; desmarcar **Ver** desmarca **Editar**)*.

### Passo 4 — Defina **Empresas** e **Departamentos** (se aplicável)
Na secção **Acesso por Empresa e Departamento**:
1. Pesquise pelo **nome ou NIF** da empresa e marque as empresas a que o utilizador terá acesso.
2. Mantenha marcada a opção **"Usar automaticamente as mesmas permissões globais definidas acima (sincronizado)"** se ele tiver o mesmo acesso em todas as empresas selecionadas. Desmarque apenas se precisar de regras diferentes por empresa.
3. Em **Departamentos permitidos**, deixe **Todos os departamentos** marcado ou desmarque e selecione apenas os departamentos da sua equipa (muito útil para chefes de departamento).
4. Clique em **Guardar permissões** (ou **Criar utilizador**).

---

## 3. Receitas Prontas (Casos mais comuns)

### Caso 1: Assistente de RH (gere equipas e faltas, mas **não pode ver salários**)
1. Clique no perfil rápido **RH Operacional**.
2. Vá à aba **Dados Sensíveis / Colunas** e clique em **Ocultar salários**.
3. Na aba **Módulos**, confirme que **Folha salarial** e **Recibos salariais** estão em **Sem acesso**.
4. Guarde.

### Caso 2: Responsável de Folha Salarial / Financeiro
1. Clique no perfil rápido **Folha & Financeiro**.
2. Confirme que **Folha salarial** está em **Total** (para poder processar e fechar períodos) ou **Gerir** (se outra pessoa for responsável por fechar a folha).
3. Na aba **Dados Sensíveis / Colunas**, confirme que os campos de salário, INSS e IRT estão com **Ver** (e **Editar** onde necessário).
4. Guarde.

### Caso 3: Chefe de Departamento / Gestor de Equipa
1. Clique no perfil rápido **Gestor de Equipa**.
   - Este perfil já permite **Gerir** *Assiduidade* e *Ausências* (aprovar/rejeitar) e **Ver** *Funcionários*, *Contratos*, *Documentos* e *Relatórios*, **sem expor salários nem NIF**.
2. Em **Acesso por Empresa e Departamento**, selecione a empresa e escolha apenas o(s) **departamento(s)** que ele chefia.
3. Guarde.

### Caso 4: Auditor ou Diretor (apenas consulta)
1. Clique no perfil rápido **Só Leitura**.
2. Se não dever consultar valores salariais, abra **Dados Sensíveis / Colunas** e clique em **Ocultar salários**.
3. Guarde.

### Caso 5: Utilizador de Plataforma com Acesso Restrito (Super-admin limitado)
1. Em **Super-admin**, crie ou edite o super-administrador limitado.
2. Mantenha marcada a permissão obrigatória de consultar empresas.
3. Em **Acesso por Empresa e Departamento**, marque **apenas as empresas** que essa pessoa deve administrar.
   - *Atenção:* se nenhuma empresa for marcada para um super-admin limitado, o sistema assume acesso global às permissões escolhidas. Marcar empresas garante o isolamento apenas para aquelas empresas.

---

## 4. Como poupar tempo com várias contas iguais

Quando vários colaboradores desempenham o mesmo papel (por exemplo, 5 chefes de equipa ou 3 técnicos de RH):

1. **Grupos de Permissões Reutilizáveis** (aba **Grupos de permissões**):
   - Crie um grupo uma única vez (ex.: *"RH Sem Salários"* ou *"Gestor Operacional"*).
   - Ao associar uma empresa ao utilizador, basta escolher esse grupo em vez de configurar tudo de novo.
   - Se mais tarde precisar de ajustar o grupo, todos os utilizadores vinculados refletem o perfil padrão do grupo.
2. **Copiar / Colar permissões**:
   - Configure o primeiro utilizador perfeitamente.
   - Use **Copiar permissões** na tabela de utilizadores e **Colar de...** ao criar ou editar os seguintes.

---

## 5. Erros Comuns (e como evitar)

| Sintoma / Problema | Causa provável | Solução |
| --- | --- | --- |
| *"O utilizador entra em Funcionários ou Folha, mas os salários/NIF/contactos aparecem em branco ou ocultos."* | Apareceu o aviso amarelo *"Nenhuma permissão por campo/coluna selecionada"* e nenhuma coluna foi marcada. | Abra a aba **Dados Sensíveis / Colunas** e clique em **Ver todos os dados** (ou use o botão no próprio aviso amarelo) e depois **Ocultar salários**, se necessário. |
| *"Um utilizador de departamento vê colegas de toda a empresa."* | Em **Departamentos permitidos**, ficou marcada a opção **Todos os departamentos**. | Edite o utilizador, desmarque **Todos os departamentos** na empresa associada e selecione apenas os departamentos dele. |
| *"O utilizador consegue apagar registos que não devia."* | Foi selecionado o nível **Total** no módulo. | Altere o nível do módulo de **Total** para **Gerir**. |
| *"Criei um super-admin limitado, mas ele vê todas as empresas."* | Não foi vinculada nenhuma empresa na secção **Acesso por Empresa e Departamento**. | Edite o utilizador e selecione explicitamente as empresas permitidas. |
| *"Alterei as permissões, mas o utilizador diz que nada mudou."* | A sessão do utilizador já estava aberta no navegador antes da alteração. | Peça ao utilizador para atualizar a página (`F5`) ou terminar sessão e entrar novamente. |
