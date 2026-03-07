# workspace-management

> Spec comportamental — fluxo de produto para gerenciamento de multiplos workspaces e diagnostico local por agente.

## Proposito

Definir `/workspace` como a superficie de diagnostico local do agent-hub. A tela registra projetos, mostra por agente o que esta no manifesto, o que existe no disco e onde ha drift entre provider, manifesto e instalacao local.

## Intencao de produto

1. O usuario pode manter varios projetos registrados ao mesmo tempo.
2. Cada workspace representa um projeto local real.
3. O manifesto `ahub.workspace.json` continua sendo a fonte oficial do vinculo skill-workspace.
4. O inventario local do disco e observado por agente para diagnostico, nao para substituir o manifesto.
5. A tela `/workspace` e onde o usuario entende drift, adota skills locais e ajusta o manifesto.

## Localizacao

- **UI**: `ui/src/pages/WorkspacePage.tsx`, `ui/src/components/workspace/WorkspaceForm.tsx`, `ui/src/components/workspace/ManifestEditor.tsx`, `ui/src/components/workspace/CreateWorkspaceDialog.tsx`
- **API**: `src/api/routes/workspace.ts`, `src/api/routes/sync.ts`
- **Core**: `src/core/config.ts`, `src/core/workspace.ts`, `src/core/workspace-catalog.ts`, `src/core/explorer.ts`

## Invariantes

1. Workspace e sempre um diretorio de projeto registrado pelo usuario.
2. A lista principal de `/workspace` exibe todos os workspaces cadastrados sem filtros locais de busca.
3. O card selecionado na lista vira o contexto de edicao, inventario e sync da tela.
4. A UI separa `skills configuradas` de `skills detectadas localmente`; contagem local nao substitui contagem do manifesto.
5. O painel principal do workspace mostra agentes como blocos/abas independentes (`claude-code`, `codex`, `cursor`).
6. Cada agente expõe um inventario local com quatro estados possiveis:
   - `manifest_and_installed`
   - `manifest_missing_local`
   - `local_outside_manifest`
   - `missing_in_provider`
7. Filtros locais de `/workspace` atuam sobre esse inventario por agente, nunca sobre o catalogo global da nuvem.
8. Ao registrar um workspace com skills locais detectadas, a UI oferece `Adotar no manifesto` ou `Ignorar por enquanto`.
9. Salvamento de manifesto e sync falham com erro explicito quando o manifesto referencia skills ausentes do provider.
10. A tela deve exibir os caminhos reais de cada agente para deixar claro onde o sync vai materializar arquivos.

## Comportamentos (Given/When/Then)

### Cenario: Registrar varios projetos

- **Given**: O usuario registra `/repos/app-a`, `/repos/app-b` e `/repos/app-c`
- **When**: Abre `/workspace`
- **Then**: Os 3 projetos aparecem como workspaces independentes, com um deles selecionado para diagnostico

### Cenario: Inventario local por agente

- **Given**: Um workspace possui `.codex/skills` e `.claude/skills`
- **When**: O usuario abre os detalhes do workspace
- **Then**: A tela mostra uma aba/bloco para cada agente reconhecido, com contadores e lista de skills daquele destino

### Cenario: Skill so local

- **Given**: O scanner encontrou uma skill no disco de `codex`, mas ela nao esta no manifesto
- **When**: O usuario filtra por `Local, fora do manifesto`
- **Then**: A skill aparece apenas nesse estado, caracterizando drift local

### Cenario: Skill no manifesto e ausente localmente

- **Given**: O manifesto do workspace declara uma skill para `claude-code`, mas ela ainda nao foi instalada no disco
- **When**: O usuario abre a aba do agente correspondente
- **Then**: A skill aparece com estado `No manifesto, ausente`

### Cenario: Skill ausente no provider

- **Given**: O manifesto referencia uma skill removida do provider
- **When**: O usuario abre `/workspace` ou tenta sincronizar
- **Then**: A tela marca o problema como `Ausente no provider` e a API impede save/sync sem correcao

### Cenario: Adotar skills locais ao registrar workspace

- **Given**: O usuario escolhe uma pasta com `.skills` ou `.codex/skills`
- **When**: Registra um workspace novo com a opcao `Adotar no manifesto`
- **Then**: O manifesto inicial tenta vincular apenas as skills locais que tambem existem no provider, preservando as demais como ignoradas

### Cenario: Ignorar skills locais por enquanto

- **Given**: O usuario escolhe uma pasta com skills locais detectadas
- **When**: Registra o workspace com a opcao `Ignorar por enquanto`
- **Then**: O workspace e cadastrado com manifesto vazio e o inventario local passa a aparecer como drift em `/workspace`

## Decisoes de Design

| Decisao | Motivo |
|---------|--------|
| `/workspace` como tela de diagnostico local | Separa claramente “catalogo da nuvem” de “estado instalado no projeto” |
| Manifesto como verdade do vinculo | Mantem o que deveria existir sob controle explicito do usuario |
| Inventario por agente | Reduz ambiguidade quando o mesmo projeto usa Claude Code, Codex e Cursor ao mesmo tempo |
| Adoção de skills locais exige escolha explicita | Evita alterar o manifesto silenciosamente por heuristica de scan |
| Exibir caminhos reais dos agentes | Facilita auditoria e entendimento do efeito do sync/deploy |

## Changelog

| Data | Mudanca |
|------|---------|
| 2026-03-06 | Spec criada para formalizar workspaces multi-projeto e diretorios reconhecidos por agente |
| 2026-03-06 | Atualizada para separar skills configuradas de detectadas localmente e oferecer adocao/ignoracao no cadastro |
| 2026-03-07 | Reescrita para diagnostico local por agente com filtros de drift e manifestacao explicita de estados locais |
