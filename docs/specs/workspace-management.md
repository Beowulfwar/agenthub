# workspace-management

> Spec comportamental — fluxo de produto para multiplos workspaces e diagnostico local por agente.

## Proposito

Definir `/workspace` como a superficie de diagnostico local do agent-hub. A tela registra projetos, mostra por agente o que esta no manifesto, o que existe no disco e onde ha drift entre provider, manifesto e instalacao local. O manifesto salvo pela UI passa a ser `version: 2` com `contents[]`.

## Intencao de produto

1. O usuario pode manter varios projetos registrados ao mesmo tempo.
2. Cada workspace representa um projeto local real.
3. O manifesto continua sendo a fonte oficial do vinculo cloud-backed entre conteudo e workspace.
4. O inventario local do disco e observado por agente para diagnostico, nao para substituir o manifesto.
5. `/workspace` continua separada do hub cloud-first de `/skills`.

## Localizacao

- **UI**: `ui/src/pages/WorkspacePage.tsx`, `ui/src/components/workspace/WorkspaceForm.tsx`, `ui/src/components/workspace/CreateWorkspaceDialog.tsx`
- **API**: `src/api/routes/workspace.ts`
- **Core**: `src/core/config.ts`, `src/core/workspace.ts`, `src/core/workspace-catalog.ts`, `src/core/explorer.ts`

## Invariantes

1. A lista principal continua exibindo todos os workspaces registrados.
2. O card selecionado na lista vira o contexto de edicao, inventario e sync da tela.
3. O formulario salva `contents[]` como shape canonico, preservando aliases legados apenas na leitura.
4. A UI continua separando conteudos configurados do manifesto e conteudos detectados localmente.
5. O inventario local por agente continua usando os estados `manifest_and_installed`, `manifest_missing_local`, `local_outside_manifest` e `missing_in_provider`.
6. Ao registrar um workspace com conteudos locais detectados, a UI oferece `Adotar no manifesto` ou `Ignorar por enquanto`.
7. Salvamento de manifesto e sync continuam falhando com erro explicito quando o manifesto referencia conteudos ausentes do provider.
8. O editor de manifesto da tela nao pode apagar silenciosamente `prompt` ou `subagent` existentes.

## Comportamentos

### Cenario: Registrar workspace novo com adocao local

- **Given**: O usuario escolhe um diretorio com `.codex/skills`, `.codex/prompts` e `.cursor/agents`
- **When**: Registra um workspace novo com a opcao `Adotar no manifesto`
- **Then**: O manifesto inicial e salvo em `version: 2` com `contents[]` tipados apenas para itens que existem no provider

### Cenario: Editar manifesto sem perder tipos

- **Given**: O manifesto do workspace ja contem `skill/review` e `prompt/review`
- **When**: O usuario abre o formulario, altera targets e salva
- **Then**: O arquivo salvo preserva as duas entradas distintas em `contents[]`

### Cenario: Workspace vazio continua valido

- **Given**: O usuario registra um projeto sem adotar conteudos locais
- **When**: O manifesto e salvo com `contents: []`
- **Then**: O workspace continua valido e o drift local aparece apenas no diagnostico

## Decisoes de Design

| Decisao | Motivo |
|---------|--------|
| Manifesto v2 no formulario | Evita que a UI apague `prompts` e `subagents` ao salvar |
| Inventario local continua por agente | Mantem o diagnostico operacional separado do catalogo cloud |
| Adocao local continua opcional | Nao altera o manifesto silenciosamente por heuristica |

## Changelog

| Data | Mudanca |
|------|---------|
| 2026-03-06 | Spec criada para workspaces multi-projeto |
| 2026-03-07 | Atualizada para manifesto canonico `contents[]` e preservacao de tipos no formulario |
