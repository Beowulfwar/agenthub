# api-rest

> Spec comportamental — contrato vivo da API HTTP do agent-hub.

## Proposito

Documentar o contrato observavel da API REST servida por Hono. A API expoe endpoints para provider, cache, workspace, exploracao de diretorios, deploy e sync. Para skills e workspaces, o contrato agora diferencia explicitamente provider, manifesto e deteccao local.

## Localizacao

- **Codigo**: `src/api/server.ts`, `src/api/router.ts`, `src/api/middleware.ts`, `src/api/routes/*.ts`
- **Core**: `src/core/workspace-catalog.ts`, `src/core/workspace.ts`, `src/core/explorer.ts`
- **Testes de caracterizacao**: `tests/specs/*.spec.ts`

## Invariantes

1. Toda resposta de sucesso usa envelope `{ data: T }`.
2. Toda resposta de erro usa envelope `{ error: { code, message } }`.
3. O error handler mapeia erros de dominio de forma deterministica, incluindo `WorkspaceSkillReferenceError -> 400`.
4. Eventos SSE seguem o protocolo `progress`, `complete` e `error`.
5. `GET /api/skills/catalog` e a fonte unica de verdade para a tela `/skills`, unificando provider, manifests e deteccao local.
6. `GET /api/workspace/registry` separa contadores de `skills configuradas` e `skills detectadas localmente`; `skillCount` permanece apenas como alias retrocompativel da contagem configurada.
7. `PUT /api/workspace`, `POST /api/sync` e `GET /api/sync/stream` validam referencias do manifesto contra o provider antes de persistir ou sincronizar.
8. CORS so fica habilitado em modo dev.
9. Rotas nao-API que nao correspondem a arquivo estatico retornam `index.html` para o frontend.

## Comportamentos (Given/When/Then)

### Cenario: Listar skills simples

- **Given**: O provider contem `fiscal-nfe`, `fiscal-nfce` e `performance-sql`
- **When**: `GET /api/skills?q=fiscal`
- **Then**: A API retorna apenas `fiscal-nfe` e `fiscal-nfce`

### Cenario: Catalogo unificado de skills

- **Given**: Existem skills no provider, workspaces registrados e deteccao local em alguns projetos
- **When**: `GET /api/skills/catalog`
- **Then**: A resposta inclui `workspaces[]`, `unassigned[]`, `invalidWorkspaces[]` e contadores separados de configuracao, deteccao e drift

### Cenario: Registrar workspace com adocao de skills locais

- **Given**: O body e `{ directory: "/projeto/app", localSkillStrategy: "adopt" }`, a pasta contem `.skills` e algumas dessas skills existem no provider
- **When**: `POST /api/workspace/registry`
- **Then**: A API cria `ahub.workspace.json`, registra o workspace e retorna `detectedSkillCount`, `adoptedSkillCount` e `ignoredSkillNames`

### Cenario: Registrar workspace ignorando skills locais

- **Given**: O body e `{ directory: "/projeto/app", localSkillStrategy: "ignore" }`
- **When**: `POST /api/workspace/registry`
- **Then**: A API registra o workspace sem preencher o manifesto com as skills detectadas, mas informa a quantidade local detectada

### Cenario: Consultar workspace ativo com catalogo local

- **Given**: Existe um workspace ativo em `/projeto/app`
- **When**: `GET /api/workspace`
- **Then**: A resposta inclui `manifest`, `resolved`, `targetDirectories` e `catalog`, onde `catalog` explicita configuracao, deteccao local e drift

### Cenario: Listar registry com contadores separados

- **Given**: Um workspace tem duas skills no manifesto e tres skills detectadas localmente
- **When**: `GET /api/workspace/registry`
- **Then**: A entrada desse workspace retorna `configuredSkillCount=2`, `detectedSkillCount=3`, `driftCount` e `missingInProviderCount`

### Cenario: Salvar manifesto com skill ausente do provider

- **Given**: O body de `PUT /api/workspace` referencia uma skill que nao existe no provider
- **When**: A API valida o manifesto
- **Then**: A resposta e `400` com codigo `WORKSPACE_SKILLS_NOT_FOUND`

### Cenario: Sync com manifesto divergente do provider

- **Given**: O workspace escolhido referencia uma skill inexistente no provider
- **When**: `POST /api/sync` ou `GET /api/sync/stream`
- **Then**: A validacao falha antes de qualquer deploy

## Contratos de Interface

### Endpoints

| Metodo | Rota | Descricao | Sucesso | Erro |
|--------|------|-----------|---------|------|
| GET | `/api/health` | Status do provider, cache e configuracao | `{ data: HealthStatus }` | — |
| GET | `/api/skills?q=&detailed=` | Listar ou detalhar skills do provider | `{ data: string[] \| SkillSummary[] }` | — |
| GET | `/api/skills/catalog?q=` | Catalogo unificado provider + workspaces + deteccao local | `{ data: SkillsCatalog }` | — |
| GET | `/api/skills/:name` | Obter `SkillPackage` completo | `{ data: SkillPackage }` | 404 |
| PUT | `/api/skills/:name` | Criar ou atualizar skill | `{ data: { name, type } }` | 400, 404 |
| PATCH | `/api/skills/:name` | Atualizacao parcial de skill | `{ data: { name, type } }` | 400, 404 |
| DELETE | `/api/skills/:name` | Remover skill | `{ data: { deleted } }` | 404 |
| GET | `/api/config` | Configuracao completa | `{ data: AhubConfig }` | — |
| GET | `/api/cache` | Listar skills em cache | `{ data: string[] }` | — |
| DELETE | `/api/cache` | Limpar cache | `{ data: { cleared: true } }` | — |
| GET | `/api/workspace` | Workspace ativo ou explicito, com diretorios e catalogo | `{ data: { manifest, filePath, workspaceDir, resolved, targetDirectories, catalog } }` | — |
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
| POST | `/api/deploy` | Deploy multi-skill multi-target | `{ data: { deployed[], failed[] } }` | 400 |
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

### Protocolo SSE

| Evento | Payload | Descricao |
|--------|---------|-----------|
| `progress` | `SyncProgressEvent` | Progresso por skill e target |
| `complete` | `SyncResult` | Resultado final do sync |
| `error` | `{ code, message }` | Falha durante a validacao ou execucao |

## Efeitos Colaterais

- `GET /api/health`: le configuracao e consulta saude do provider.
- `PUT`, `PATCH` e `DELETE /api/skills/:name`: alteram o backend de storage.
- `POST /api/workspace/registry`: pode criar `ahub.workspace.json`; quando `localSkillStrategy=adopt`, tambem observa skills locais e consulta o provider para montar o manifesto inicial.
- `GET /api/skills/catalog`: lista skills no provider, carrega manifests registrados e observa skills locais detectadas em cada workspace.
- `PUT /api/workspace`: grava o manifesto no disco apenas apos validar referencias contra o provider.
- `POST /api/sync` e `GET /api/sync/stream`: validam o manifesto contra o provider antes de combinar fetch remoto e escrita local.
- `POST /api/explorer/pick-directory`: abre o seletor nativo de pastas do sistema operacional.

## Decisoes de Design

| Decisao | Justificativa |
|---------|---------------|
| Envelope uniforme `{ data }` / `{ error }` | Facilita consumo pelos clientes sem depender apenas do status HTTP |
| Error handler centralizado | Mantem o mapeamento de erros consistente entre todas as rotas |
| Catalogo unificado em rota dedicada | A UI de `/skills` depende de um unico contrato backend para provider, manifests e deteccao local |
| Validacao de manifesto antes de save e sync | Evita drift silencioso e falhas parciais de sincronizacao |
| `skillCount` mantido como alias | Preserva compatibilidade enquanto a UI migra para metrica explicita |

## Changelog

| Data | Mudanca |
|------|---------|
| 2025-03-05 | Spec criada |
| 2026-03-06 | Documentados explorer REST, picker nativo de pasta e registro de workspace por diretorio |
| 2026-03-06 | Documentado retorno de diretorios reconhecidos por target no payload de workspace |
| 2026-03-06 | Documentado sync com workspace explicito para a UI nao depender de `ativo` como acao manual |
| 2026-03-06 | Atualizada para incluir `/api/skills/catalog`, contadores separados de workspace e validacao de skills do manifesto contra o provider no save/sync |
