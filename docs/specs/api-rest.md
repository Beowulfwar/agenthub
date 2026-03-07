# api-rest

> Spec comportamental — contrato vivo da API HTTP do agent-hub.

## Proposito

Documentar o contrato observavel da API REST servida por Hono. Para skills e workspaces, a API diferencia explicitamente catalogo global do provider, vinculacao por manifesto e inventario local por agente.

## Localizacao

- **Codigo**: `src/api/server.ts`, `src/api/router.ts`, `src/api/middleware.ts`, `src/api/routes/*.ts`
- **Core**: `src/core/workspace-catalog.ts`, `src/core/workspace.ts`, `src/core/explorer.ts`
- **Testes de caracterizacao**: `tests/specs/*.spec.ts`

## Invariantes

1. Toda resposta de sucesso usa envelope `{ data: T }`.
2. Toda resposta de erro usa envelope `{ error: { code, message } }`.
3. O error handler mapeia erros de dominio de forma deterministica, incluindo `WorkspaceSkillReferenceError -> 400`.
4. `GET /api/skills/hub` devolve a shell do hub operacional com a secao global `Nuvem` e o resumo dos `Workspaces`.
5. `GET /api/skills/hub/workspace` carrega um workspace sob demanda e devolve skills agrupadas por agente com estado unificado (`synced`, `cloud_only`, `local_only`, `diverged`, `missing_in_provider`).
6. `GET /api/workspace` devolve `agents[]` com inventario local agrupado por target de deploy e `apps[]` com diagnostico oficial por app/repositorio.
7. `GET /api/workspace/registry` separa contadores de manifesto e disco local; `skillCount` permanece apenas como alias retrocompativel da contagem configurada.
8. `PUT /api/workspace`, `POST /api/sync` e `GET /api/sync/stream` validam referencias do manifesto contra o provider antes de persistir ou sincronizar.
9. `POST /api/skills/hub/actions/download`, `upload` e `transfer` sao as rotas gerenciadas da UI de `/skills`; `POST /api/deploy` continua apenas por compatibilidade.
10. CORS so fica habilitado em modo dev.
11. `GET /api/apps/catalog` expõe apenas apps do registro oficial e seus niveis de suporte.
12. `POST /api/migrations/plan` e sempre dry-run e nunca escreve no disco.

## Comportamentos (Given/When/Then)

### Cenario: Shell do hub de skills

- **Given**: O provider contem `fiscal-nfe` e `performance-sql`
- **When**: `GET /api/skills/hub`
- **Then**: A resposta inclui a secao `cloud.items[]` e `workspaces[]` resumidos, sem detalhe local completo por agente

### Cenario: Expandir um workspace no hub

- **Given**: Existe um workspace em `/projeto/app` com skills locais em `codex` e `claude-code`
- **When**: `GET /api/skills/hub/workspace?filePath=/projeto/app/ahub.workspace.json`
- **Then**: A resposta inclui `agents[]`, cada um com `skills[]`, `counts` e status unificado por skill

### Cenario: Comparar skill local com nuvem

- **Given**: Uma skill local diverge da nuvem
- **When**: `GET /api/skills/hub/diff?filePath=/projeto/app/ahub.workspace.json&target=codex&name=fiscal-nfe`
- **Then**: A resposta inclui `local`, `cloud`, `status`, `lossiness`, `canUpload` e `canDownload`

### Cenario: Consultar workspace com inventario por agente

- **Given**: Existe um workspace ativo em `/projeto/app`
- **When**: `GET /api/workspace`
- **Then**: A resposta inclui `manifest`, `targetDirectories`, `catalog` resumido, `agents[]` com skills locais agrupadas por target e `apps[]` com o diagnostico oficial de repositorios por app

### Cenario: Consultar catalogo oficial de apps

- **Given**: O registro oficial conhece `codex`, `claude-code`, `cursor` e apps detect-only como `github-copilot`
- **When**: `GET /api/apps/catalog`
- **Then**: A resposta lista `supportLevel`, paths canonicos/legados e `docUrls` para cada app

### Cenario: Planejar migracao entre apps

- **Given**: Existe um workspace em `/projeto/app` com artefatos locais de `codex`
- **When**: `POST /api/migrations/plan` com `{ "workspaceDir": "/projeto/app", "fromApp": "codex", "toApp": "claude-code", "skill": "fiscal" }`
- **Then**: A resposta inclui um `AppMigrationPlan` com `items[]`, `lossiness`, `blockedReasons` e `manualSteps`, sem escrita local

### Cenario: Deploy com destino explicito

- **Given**: O body e `{ skills: ["fiscal-nfe"], workspaceFilePath: "/projeto/app/ahub.workspace.json", target: "codex" }`
- **When**: `POST /api/deploy`
- **Then**: A API instala a skill apenas nesse destino, sem depender do workspace ativo

### Cenario: Baixar da nuvem pelo hub

- **Given**: O body e `{ filePath: "/projeto/app/ahub.workspace.json", target: "codex", skills: ["fiscal-nfe"] }`
- **When**: `POST /api/skills/hub/actions/download`
- **Then**: A API baixa a skill do provider, instala no destino e atualiza o manifesto do workspace

### Cenario: Bloquear upload divergente sem confirmacao

- **Given**: O body e `{ filePath: "/projeto/app/ahub.workspace.json", target: "claude-code", skills: ["fiscal-nfe"] }` e a skill diverge da nuvem
- **When**: `POST /api/skills/hub/actions/upload`
- **Then**: A API devolve falha com codigo `DIFF_CONFIRMATION_REQUIRED` sem sobrescrever o provider

### Cenario: Mover skill entre workspaces

- **Given**: O body contem origem, destino, `mode=move` e uma skill local valida
- **When**: `POST /api/skills/hub/actions/transfer`
- **Then**: A API escreve no destino, atualiza os dois manifestos e faz `undeploy` na origem

### Cenario: Salvar manifesto com skill ausente do provider

- **Given**: O body de `PUT /api/workspace` referencia uma skill que nao existe no provider
- **When**: A API valida o manifesto
- **Then**: A resposta e `400` com codigo `WORKSPACE_SKILLS_NOT_FOUND`

## Contratos de Interface

### Endpoints

| Metodo | Rota | Descricao | Sucesso | Erro |
|--------|------|-----------|---------|------|
| GET | `/api/health` | Status do provider, cache e configuracao | `{ data: HealthStatus }` | — |
| GET | `/api/apps/catalog` | Catalogo oficial de apps/repositorios e nivel de suporte | `{ data: AgentAppCatalogItem[] }` | — |
| GET | `/api/skills?q=&detailed=` | Listar ou detalhar skills do provider | `{ data: string[] \| SkillSummary[] }` | — |
| GET | `/api/skills/catalog?q=&workspaceFilePath=&target=&type=&category=&tag=&installState=` | Catalogo cloud-first legado, mantido por compatibilidade | `{ data: SkillsCatalog }` | — |
| GET | `/api/skills/hub?q=&type=&category=&tag=` | Shell do hub operacional de skills | `{ data: SkillsHubShell }` | — |
| GET | `/api/skills/hub/workspace?filePath=` | Detalhe lazy de um workspace agrupado por agente | `{ data: SkillsHubWorkspaceDetail }` | 400 |
| GET | `/api/skills/hub/diff?filePath=&target=&name=` | Preview de comparacao local vs nuvem | `{ data: SkillsHubDiffResult }` | 400 |
| POST | `/api/skills/hub/actions/download` | Baixar da nuvem para `workspace + agente` com persistencia no manifesto | `{ data: SkillsHubActionResult }` | 400 |
| POST | `/api/skills/hub/actions/upload` | Subir do local para a nuvem, com bloqueio de divergencia sem confirmacao | `{ data: SkillsHubActionResult }` | 400 |
| POST | `/api/skills/hub/actions/transfer` | Copiar ou mover skill entre workspaces/agentes | `{ data: SkillsHubActionResult }` | 400 |
| GET | `/api/skills/:name` | Obter `SkillPackage` completo | `{ data: SkillPackage }` | 404 |
| PUT | `/api/skills/:name` | Criar ou atualizar skill | `{ data: { name, type } }` | 400, 404 |
| PATCH | `/api/skills/:name` | Atualizacao parcial de skill | `{ data: { name, type } }` | 400, 404 |
| DELETE | `/api/skills/:name` | Remover skill | `{ data: { deleted } }` | 404 |
| GET | `/api/config` | Configuracao completa | `{ data: AhubConfig }` | — |
| GET | `/api/cache` | Listar skills em cache | `{ data: string[] }` | — |
| DELETE | `/api/cache` | Limpar cache | `{ data: { cleared: true } }` | — |
| GET | `/api/workspace` | Workspace ativo ou explicito, com manifesto, diretorios, inventario por agente e diagnostico por app | `{ data: { manifest, filePath, workspaceDir, resolved, targetDirectories, catalog, agents, apps } }` | — |
| PUT | `/api/workspace` | Salvar manifesto com validacao no provider | `{ data: { saved } }` | 400, 503 |
| GET | `/api/workspace/registry` | Listar workspaces registrados com contadores separados | `{ data: WorkspaceRegistryEntry[] }` | — |
| POST | `/api/workspace/registry` | Registrar ou criar workspace, com opcao de adotar skills locais | `{ data: { registered, created, detectedSkillCount, adoptedSkillCount, ignoredSkillNames } }` | 400, 503 |
| DELETE | `/api/workspace/registry` | Remover workspace registrado | `{ data: { unregistered } }` | — |
| PUT | `/api/workspace/active` | Definir workspace ativo | `{ data: { active } }` | 400 |
| GET | `/api/workspace/suggestions` | Sugerir roots de workspace a partir de skills locais detectadas | `{ data: WorkspaceSuggestion[] }` | — |
| GET | `/api/explorer/browse?dir=&hidden=` | Navegar diretorios | `{ data: { currentDir, entries } }` | 400 |
| GET | `/api/explorer/scan?dir=` | Detectar diretorios locais de skills e artefatos oficiais por app | `{ data: { baseDir, detected, artifacts, apps } }` | 400 |
| POST | `/api/migrations/plan` | Gerar plano de migracao entre apps sem escrita | `{ data: AppMigrationPlan }` | 400 |
| GET | `/api/explorer/suggestions` | Sugestoes iniciais de diretorio | `{ data: SuggestionDir[] }` | — |
| POST | `/api/explorer/pick-directory` | Abrir seletor nativo de pasta | `{ data: { selectedDir } }` | 500 |
| POST | `/api/deploy` | Instalar skills em um destino explicito ou legado | `{ data: { deployed[], failed[] } }` | 400 |
| POST | `/api/sync` | Sync nao-streaming, opcionalmente para `filePath` explicito | `{ data: SyncResult }` | 400, 404 |
| GET | `/api/sync/stream` | SSE de progresso do sync | eventos SSE | evento `error` |

### Mapeamento Error -> HTTP

| Classe de Erro | HTTP Status | Codigo |
|---------------|-------------|--------|
| `SkillNotFoundError` | 404 | `SKILL_NOT_FOUND` |
| `WorkspaceNotFoundError` | 404 | `WORKSPACE_NOT_FOUND` |
| `SkillValidationError` | 400 | `VALIDATION_ERROR` |
| `WorkspaceSkillReferenceError` | 400 | `WORKSPACE_SKILLS_NOT_FOUND` |
| `ProviderNotConfiguredError` | 503 | `NOT_CONFIGURED` |
| `AuthenticationError` | 401 | `AUTH_ERROR` |
| `AhubError` | 500 | `AHUB_ERROR` |
| Desconhecido | 500 | `INTERNAL_ERROR` |

## Efeitos Colaterais

- `GET /api/health`: le configuracao e consulta saude do provider.
- `GET /api/skills/catalog`: lista skills no provider e, quando ha destino explicito, observa o disco local apenas para resolver estado de instalacao.
- `GET /api/skills/hub`: lista skills do provider e sumariza workspaces registrados para a UI principal de `/skills`.
- `GET /api/skills/hub/workspace`: le manifesto, discos locais e provider para montar o detalhe por agente.
- `GET /api/skills/hub/diff`: le a skill local detectada e a versao do provider para montar o preview de comparacao.
- `POST /api/skills/hub/actions/download`: baixa do provider, escreve no disco e atualiza o manifesto do workspace.
- `POST /api/skills/hub/actions/upload`: canonicaliza a skill local e grava no backend de storage.
- `POST /api/skills/hub/actions/transfer`: escreve no destino e, quando `mode=move`, tambem remove a origem do disco e do manifesto.
- `PUT`, `PATCH` e `DELETE /api/skills/:name`: alteram o backend de storage.
- `POST /api/workspace/registry`: pode criar `ahub.workspace.json`; quando `localSkillStrategy=adopt`, tambem observa skills locais e consulta o provider para montar o manifesto inicial.
- `GET /api/workspace`: le manifesto, diretorios de deploy, inventario local por agente e diagnostico por app.
- `GET /api/apps/catalog`: consulta apenas o registro oficial embutido.
- `POST /api/migrations/plan`: le o workspace e o registro oficial para montar um plano sem escrita.
- `PUT /api/workspace`: grava o manifesto no disco apenas apos validar referencias contra o provider.
- `POST /api/deploy`: baixa skills do provider e escreve no diretorio de destino resolvido.
- `POST /api/sync` e `GET /api/sync/stream`: validam o manifesto contra o provider antes de combinar fetch remoto e escrita local.

## Decisoes de Design

| Decisao | Justificativa |
|---------|---------------|
| Hub operacional em rotas dedicadas | A UI de `/skills` precisa separar nuvem, workspaces, comparacao e acoes sem remontar a logica no frontend |
| Destino explicito em `/api/deploy` | Remove dependencia operacional do “workspace ativo” para instalacoes vindas da UI |
| `agents[]` em `/api/workspace` | Coloca o diagnostico local por target no backend, sem heuristica duplicada no frontend |
| `skillCount` mantido como alias | Preserva compatibilidade enquanto a UI usa metricas mais explicitas |

## Changelog

| Data | Mudanca |
|------|---------|
| 2025-03-05 | Spec criada |
| 2026-03-06 | Documentado registro de workspace por diretorio, explorer REST e validacao de manifesto contra o provider |
| 2026-03-07 | Reescrita para o modelo cloud-first em `/api/skills/catalog`, inventario por agente em `/api/workspace` e deploy com destino explicito |
| 2026-03-07 | Atualizada para o hub operacional de skills com rotas `/api/skills/hub/*`, comparacao de divergencia e acoes gerenciadas de download/upload/transfer |
