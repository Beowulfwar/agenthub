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
4. `GET /api/skills/catalog` devolve apenas skills do provider, uma unica vez por nome.
5. `GET /api/skills/catalog` aceita contexto opcional de destino (`workspaceFilePath`, `target`) para resolver `installState`, mas esse contexto nao altera a unicidade do catalogo.
6. `GET /api/workspace` devolve `agents[]` com inventario local agrupado por target de deploy.
7. `GET /api/workspace/registry` separa contadores de manifesto e disco local; `skillCount` permanece apenas como alias retrocompativel da contagem configurada.
8. `PUT /api/workspace`, `POST /api/sync` e `GET /api/sync/stream` validam referencias do manifesto contra o provider antes de persistir ou sincronizar.
9. `POST /api/deploy` aceita destino explicito via `workspaceFilePath` e `target`; quando omitidos, o comportamento legado pode usar fallback do workspace ativo.
10. CORS so fica habilitado em modo dev.

## Comportamentos (Given/When/Then)

### Cenario: Catalogo cloud-first sem destino

- **Given**: O provider contem `fiscal-nfe` e `performance-sql`
- **When**: `GET /api/skills/catalog`
- **Then**: A resposta inclui apenas `items[]` dessas skills, com `installState=unknown`

### Cenario: Catalogo com destino explicito

- **Given**: Existe um workspace em `/projeto/app` e a skill `fiscal-nfe` esta instalada em `codex`
- **When**: `GET /api/skills/catalog?workspaceFilePath=/projeto/app/ahub.workspace.json&target=codex`
- **Then**: `fiscal-nfe` vem com `installState=installed` sem duplicar itens por workspace

### Cenario: Filtrar por estado no destino

- **Given**: O destino escolhido possui skills instaladas e nao instaladas
- **When**: `GET /api/skills/catalog?...&installState=installed`
- **Then**: `items[]` retorna apenas as instaladas, mas `counts` continua refletindo o conjunto base apos os demais filtros

### Cenario: Consultar workspace com inventario por agente

- **Given**: Existe um workspace ativo em `/projeto/app`
- **When**: `GET /api/workspace`
- **Then**: A resposta inclui `manifest`, `targetDirectories`, `catalog` resumido e `agents[]` com skills locais agrupadas por target

### Cenario: Deploy com destino explicito

- **Given**: O body e `{ skills: ["fiscal-nfe"], workspaceFilePath: "/projeto/app/ahub.workspace.json", target: "codex" }`
- **When**: `POST /api/deploy`
- **Then**: A API instala a skill apenas nesse destino, sem depender do workspace ativo

### Cenario: Salvar manifesto com skill ausente do provider

- **Given**: O body de `PUT /api/workspace` referencia uma skill que nao existe no provider
- **When**: A API valida o manifesto
- **Then**: A resposta e `400` com codigo `WORKSPACE_SKILLS_NOT_FOUND`

## Contratos de Interface

### Endpoints

| Metodo | Rota | Descricao | Sucesso | Erro |
|--------|------|-----------|---------|------|
| GET | `/api/health` | Status do provider, cache e configuracao | `{ data: HealthStatus }` | — |
| GET | `/api/skills?q=&detailed=` | Listar ou detalhar skills do provider | `{ data: string[] \| SkillSummary[] }` | — |
| GET | `/api/skills/catalog?q=&workspaceFilePath=&target=&type=&category=&tag=&installState=` | Catalogo cloud-first com contexto opcional de destino | `{ data: SkillsCatalog }` | — |
| GET | `/api/skills/:name` | Obter `SkillPackage` completo | `{ data: SkillPackage }` | 404 |
| PUT | `/api/skills/:name` | Criar ou atualizar skill | `{ data: { name, type } }` | 400, 404 |
| PATCH | `/api/skills/:name` | Atualizacao parcial de skill | `{ data: { name, type } }` | 400, 404 |
| DELETE | `/api/skills/:name` | Remover skill | `{ data: { deleted } }` | 404 |
| GET | `/api/config` | Configuracao completa | `{ data: AhubConfig }` | — |
| GET | `/api/cache` | Listar skills em cache | `{ data: string[] }` | — |
| DELETE | `/api/cache` | Limpar cache | `{ data: { cleared: true } }` | — |
| GET | `/api/workspace` | Workspace ativo ou explicito, com manifesto, diretorios e inventario por agente | `{ data: { manifest, filePath, workspaceDir, resolved, targetDirectories, catalog, agents } }` | — |
| PUT | `/api/workspace` | Salvar manifesto com validacao no provider | `{ data: { saved } }` | 400, 503 |
| GET | `/api/workspace/registry` | Listar workspaces registrados com contadores separados | `{ data: WorkspaceRegistryEntry[] }` | — |
| POST | `/api/workspace/registry` | Registrar ou criar workspace, com opcao de adotar skills locais | `{ data: { registered, created, detectedSkillCount, adoptedSkillCount, ignoredSkillNames } }` | 400, 503 |
| DELETE | `/api/workspace/registry` | Remover workspace registrado | `{ data: { unregistered } }` | — |
| PUT | `/api/workspace/active` | Definir workspace ativo | `{ data: { active } }` | 400 |
| GET | `/api/workspace/suggestions` | Sugerir roots de workspace a partir de skills locais detectadas | `{ data: WorkspaceSuggestion[] }` | — |
| GET | `/api/explorer/browse?dir=&hidden=` | Navegar diretorios | `{ data: { currentDir, entries } }` | 400 |
| GET | `/api/explorer/scan?dir=` | Detectar diretorios locais de skills | `{ data: { baseDir, detected } }` | 400 |
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
- `PUT`, `PATCH` e `DELETE /api/skills/:name`: alteram o backend de storage.
- `POST /api/workspace/registry`: pode criar `ahub.workspace.json`; quando `localSkillStrategy=adopt`, tambem observa skills locais e consulta o provider para montar o manifesto inicial.
- `GET /api/workspace`: le manifesto, diretorios de deploy e inventario local por agente.
- `PUT /api/workspace`: grava o manifesto no disco apenas apos validar referencias contra o provider.
- `POST /api/deploy`: baixa skills do provider e escreve no diretorio de destino resolvido.
- `POST /api/sync` e `GET /api/sync/stream`: validam o manifesto contra o provider antes de combinar fetch remoto e escrita local.

## Decisoes de Design

| Decisao | Justificativa |
|---------|---------------|
| Catalogo cloud-first em rota dedicada | A UI de `/skills` precisa de um unico contrato global e sem duplicidade por workspace |
| Destino explicito em `/api/deploy` | Remove dependencia operacional do “workspace ativo” para instalacoes vindas da UI |
| `agents[]` em `/api/workspace` | Coloca o diagnostico local por target no backend, sem heuristica duplicada no frontend |
| `skillCount` mantido como alias | Preserva compatibilidade enquanto a UI usa metricas mais explicitas |

## Changelog

| Data | Mudanca |
|------|---------|
| 2025-03-05 | Spec criada |
| 2026-03-06 | Documentado registro de workspace por diretorio, explorer REST e validacao de manifesto contra o provider |
| 2026-03-07 | Reescrita para o modelo cloud-first em `/api/skills/catalog`, inventario por agente em `/api/workspace` e deploy com destino explicito |
