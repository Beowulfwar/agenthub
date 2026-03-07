# api-rest

> Spec comportamental — contrato vivo para agentes e desenvolvedores.

## Proposito

API HTTP REST do agent-hub, construida com Hono e servida via `@hono/node-server`. Expoe endpoints para gerenciar skills, configuracao, cache, workspace, exploracao de diretorios, deploy e sync. Inclui error handler centralizado que mapeia a hierarquia de erros do dominio para codigos HTTP deterministicos, e suporte a SSE (Server-Sent Events) para progresso de sync em tempo real.

## Localizacao

- **Codigo**: `src/api/server.ts`, `src/api/router.ts`, `src/api/middleware.ts`, `src/api/routes/health.ts`, `src/api/routes/skills.ts`, `src/api/routes/config.ts`, `src/api/routes/cache.ts`, `src/api/routes/workspace.ts`, `src/api/routes/explorer.ts`, `src/api/routes/deploy.ts`, `src/api/routes/sync.ts`
- **Testes unitarios**: `tests/api/routes.test.ts`
- **Testes de caracterizacao**: `tests/specs/api-rest.spec.ts`

## Invariantes

1. TODAS as respostas de sucesso sao envelopadas em `{ data: T }`
2. TODAS as respostas de erro sao envelopadas em `{ error: { code: string, message: string } }`
3. O mapeamento de erros de dominio para HTTP e deterministico e exaustivo: `SkillNotFoundError` -> 404, `WorkspaceNotFoundError` -> 404, `SkillValidationError` -> 400, `ProviderNotConfiguredError` -> 503, `AuthenticationError` -> 401, `AhubError` -> 500, desconhecido -> 500
4. Eventos SSE seguem o protocolo de 3 tipos: `progress`, `complete`, `error`
5. Arquivos estaticos sao servidos com MIME types corretos (mapa explicito de extensoes)
6. SPA fallback: rotas que nao sao `/api/*` e nao correspondem a arquivo estatico retornam `index.html`
7. CORS habilitado apenas em modo dev (origens `localhost:5173` e `127.0.0.1:5173`)
8. Porta padrao do servidor: 3737

## Comportamentos (Given/When/Then)

### GET /api/health retorna status do sistema configurado

- **Given**: Provider configurado e conectado; cache com N skills
- **When**: `GET /api/health`
- **Then**: Retorna 200 com `{ data: { configured: true, provider: 'git', providerHealth: { ok: true, message: '...' }, cacheCount: N } }`

### GET /api/health retorna status quando nao configurado

- **Given**: Nenhuma configuracao existe (`~/.ahub/config.json` ausente)
- **When**: `GET /api/health`
- **Then**: Retorna 200 com `{ data: { configured: false, provider: null, providerHealth: null, cacheCount: 0 } }`

### GET /api/skills lista e filtra skills

- **Given**: Provider contem skills `["fiscal-nfe", "fiscal-nfce", "performance-sql"]`
- **When**: `GET /api/skills?q=fiscal`
- **Then**: Retorna 200 com `{ data: ["fiscal-nfe", "fiscal-nfce"] }`

### GET /api/skills/:name retorna 404 para skill inexistente

- **Given**: Skill `"nao-existe"` nao existe no backend
- **When**: `GET /api/skills/nao-existe`
- **Then**: Error handler intercepta `SkillNotFoundError`, retorna 404 com `{ error: { code: 'SKILL_NOT_FOUND', message: 'Skill "nao-existe" was not found.' } }`

### POST /api/deploy faz deploy multi-skill multi-target

- **Given**: Body `{ skills: ["fiscal-nfe", "performance-sql"], targets: ["claude-code", "cursor"] }` e ambas as skills existem no provider
- **When**: `POST /api/deploy`
- **Then**: Faz deploy de cada skill em cada target, retorna 200 com `{ data: { deployed: [...], failed: [...] } }` onde cada entry em deployed contem `{ skill, target, path }`

### POST /api/deploy rejeita lista vazia de skills

- **Given**: Body `{ skills: [], targets: ["claude-code"] }`
- **When**: `POST /api/deploy`
- **Then**: Retorna 400 com `{ error: { code: 'VALIDATION_ERROR', message: 'At least one skill is required.' } }`

### GET /api/sync/stream emite eventos SSE

- **Given**: Workspace manifest valida com skills a sincronizar
- **When**: `GET /api/sync/stream`
- **Then**: Abre conexao SSE, emite eventos `progress` com `{ phase, skill, target, current, total }`, ao final emite evento `complete` com `SyncResult`, fecha conexao

### POST /api/workspace/registry aceita uma pasta e resolve o manifesto

- **Given**: Body `{ directory: "/projeto/app" }` e nenhum `ahub.workspace.json` existe em `/projeto/app`
- **When**: `POST /api/workspace/registry`
- **Then**: Cria `/projeto/app/ahub.workspace.json`, registra esse manifesto e retorna `{ data: { registered, created: true } }`

### GET /api/workspace expoe apenas o workspace ativo registrado

- **Given**: Nao existe workspace ativo registrado
- **When**: `GET /api/workspace`
- **Then**: Retorna `{ data: { manifest: null, filePath: null, workspaceDir: null, resolved: [], targetDirectories: [] } }`, sem inferir automaticamente um manifesto a partir do diretorio atual

### GET /api/workspace expoe o projeto ativo e os diretorios reconhecidos

- **Given**: Existe um workspace ativo em `/projeto/app`
- **When**: `GET /api/workspace`
- **Then**: Retorna `workspaceDir`, `filePath`, `resolved` e `targetDirectories[]`, onde cada target informa a raiz e as pastas `skill`, `prompt` e `subagent` que o sync usara

### GET /api/workspace/suggestions sugere workspaces a partir de skills locais

- **Given**: Existe um projeto com `./.skills` ou `./.codex/skills`
- **When**: `GET /api/workspace/suggestions`
- **Then**: A resposta sugere a raiz do projeto como `workspaceDir`, informa `skillCount`, `detected[]` e se `ahub.workspace.json` ja existe naquela pasta

### POST /api/sync aceita um workspace explicito

- **Given**: Body `{ filePath: "/projeto/app/ahub.workspace.json" }`
- **When**: `POST /api/sync`
- **Then**: O sync usa esse workspace explicitamente, sem depender do workspace ativo global

### POST /api/explorer/pick-directory retorna a pasta selecionada no dialogo nativo

- **Given**: Cliente aciona a rota a partir da UI local
- **When**: `POST /api/explorer/pick-directory`
- **Then**: O backend abre o seletor nativo de pastas do sistema operacional e retorna `{ data: { selectedDir } }`, onde `selectedDir` pode ser `null` se o usuario cancelar

### Error handler mapeia ProviderNotConfiguredError para 503

- **Given**: Rota lanca `ProviderNotConfiguredError`
- **When**: Error handler intercepta a excecao
- **Then**: Retorna 503 com `{ error: { code: 'NOT_CONFIGURED', message: '...' } }` — nunca retorna 500 para esse tipo de erro

## Contratos de Interface

### Funcoes Publicas

| Funcao | Input | Output | Throws |
|--------|-------|--------|--------|
| `startApiServer(options?)` | `ServerOptions` | `Promise<{ server, port, app }>` | — |
| `createApiApp()` | — | `Hono` | — |
| `errorHandler` | `ErrorHandler` (Hono) | resposta HTTP | — |

### Endpoints

| Metodo | Rota | Descricao | Sucesso | Erro |
|--------|------|-----------|---------|------|
| GET | `/api/health` | Status do provider, cache, config | `{ data: HealthStatus }` | — |
| GET | `/api/skills?q=&detailed=` | Listar/buscar skills | `{ data: string[] \| SkillSummary[] }` | — |
| GET | `/api/skills/:name` | Obter SkillPackage completo | `{ data: SkillPackage }` | 404 |
| PUT | `/api/skills/:name` | Criar/atualizar skill | `{ data: { name } }` | 400, 404 |
| DELETE | `/api/skills/:name` | Remover skill | `{ data: { deleted } }` | 404 |
| GET | `/api/config` | Configuracao completa | `{ data: AhubConfig }` | — |
| GET | `/api/config/:key` | Valor por dot-path | `{ data: { key, value } }` | — |
| PUT | `/api/config/:key` | Definir valor por dot-path | `{ data: { key, value } }` | — |
| GET | `/api/cache` | Listar skills em cache | `{ data: string[] }` | — |
| DELETE | `/api/cache` | Limpar todo o cache | `{ data: { cleared: true } }` | — |
| GET | `/api/workspace` | Workspace ativo + skills resolvidas + diretorios reconhecidos | `{ data: { manifest, filePath, workspaceDir, resolved, targetDirectories } }` | — |
| PUT | `/api/workspace` | Salvar manifest | `{ data: { saved } }` | — |
| GET | `/api/workspace/registry` | Listar workspaces registrados | `{ data: WorkspaceRegistryEntry[] }` | — |
| POST | `/api/workspace/registry` | Registrar ou criar workspace a partir de manifesto/pasta | `{ data: { registered, created } }` | 400 |
| DELETE | `/api/workspace/registry` | Remover workspace registrado | `{ data: { unregistered } }` | — |
| PUT | `/api/workspace/active` | Definir workspace ativo | `{ data: { active } }` | 400 |
| GET | `/api/workspace/suggestions` | Sugerir workspaces a partir de skills locais detectadas | `{ data: WorkspaceSuggestion[] }` | — |
| GET | `/api/explorer/browse?dir=&hidden=` | Listar diretorios navegaveis | `{ data: { currentDir, entries } }` | 400 |
| GET | `/api/explorer/scan?dir=` | Detectar diretorios de skills conhecidos | `{ data: { baseDir, detected } }` | 400 |
| GET | `/api/explorer/suggestions` | Sugerir diretorios iniciais para exploracao | `{ data: SuggestionDir[] }` | — |
| POST | `/api/explorer/pick-directory` | Abrir seletor nativo de pasta | `{ data: { selectedDir } }` | 500 |
| POST | `/api/deploy` | Deploy multi-skill multi-target | `{ data: { deployed[], failed[] } }` | 400 |
| POST | `/api/sync` | Sync completo (nao-streaming), opcionalmente para `filePath` explicito | `{ data: SyncResult }` | 404 |
| GET | `/api/sync/stream` | SSE de progresso do sync, opcionalmente para `path` explicito | eventos SSE | evento error |

### Mapeamento Error -> HTTP

| Classe de Erro | HTTP Status | Codigo |
|---------------|-------------|--------|
| `SkillNotFoundError` | 404 | `SKILL_NOT_FOUND` |
| `WorkspaceNotFoundError` | 404 | `WORKSPACE_NOT_FOUND` |
| `SkillValidationError` | 400 | `VALIDATION_ERROR` |
| `ProviderNotConfiguredError` | 503 | `NOT_CONFIGURED` |
| `AuthenticationError` | 401 | `AUTH_ERROR` |
| `AhubError` (base) | 500 | `AHUB_ERROR` |
| Desconhecido | 500 | `INTERNAL_ERROR` |

### Protocolo SSE (sync/stream)

| Evento | Payload | Descricao |
|--------|---------|-----------|
| `progress` | `SyncProgressEvent` | Progresso de cada operacao (phase, skill, target, current, total) |
| `complete` | `SyncResult` | Resultado final do sync (deployed, failed, skipped) |
| `error` | `{ code, message }` | Erro durante o sync |

### Tipos Exportados

- `ServerOptions` — `{ port?: number, staticDir?: string, devMode?: boolean }`
- `ApiError` — `{ code: string, message: string }`

## Dependencias

- **Usa**: `hono` (framework HTTP), `@hono/node-server` (serve), `hono/cors` (CORS dev), `hono/streaming` (SSE), `core/config.ts`, `core/cache.ts`, `core/workspace.ts`, `core/explorer.ts`, `core/wsl.ts`, `core/sync.ts`, `core/skill.ts`, `core/sanitize.ts`, `core/errors.ts`, `storage/factory.ts`, `deploy/deployer.ts`
- **Usado por**: `bin/ahub.ts` (comando `ui`), integracao com frontends HTTP

## Efeitos Colaterais

- `GET /api/health`: Le `~/.ahub/config.json`; executa `healthCheck()` no provider (pode fazer `git fetch --dry-run` ou chamada API ao Google Drive)
- `PUT /api/skills/:name`: Escreve no backend de storage (git commit+push ou upload no Drive)
- `DELETE /api/skills/:name`: Remove skill do backend (git rm+commit+push ou soft-delete no Drive)
- `PUT /api/config/:key`: Modifica `~/.ahub/config.json` no disco
- `DELETE /api/cache`: Remove todos os arquivos em `~/.ahub/cache/`
- `POST /api/deploy`: Escreve arquivos no filesystem local (override global ou diretorio reconhecido do workspace ativo)
- `POST /api/workspace/registry`: Pode criar `ahub.workspace.json` no filesystem local antes de registrar o manifesto
- `GET /api/workspace/suggestions`: Faz leituras rasas em diretorios comuns de trabalho para detectar estruturas conhecidas de skills e sugerir roots de workspace
- `POST /api/explorer/pick-directory`: Abre o seletor nativo de pastas do sistema operacional local
- `POST /api/sync` e `GET /api/sync/stream`: Combinam efeitos de storage e deploy (fetch + escrita local)
- Servico de arquivos estaticos: Le arquivos do `staticDir` e serve com MIME types corretos

## Decisoes de Design

| Decisao | Justificativa |
|---------|---------------|
| Envelope uniforme `{ data }` / `{ error }` | Clientes distinguem sucesso de erro pela presenca de `data` ou `error`, sem depender de HTTP status codes |
| Error handler centralizado via `app.onError()` | Nenhuma rota precisa fazer try/catch para erros de dominio; mapeamento e automatico |
| Ordem de instanceof no error handler: especifico -> generico | `AhubError` (base) so e atingido se nenhuma subclasse mais especifica casou antes |
| SSE com 3 tipos de evento fixos | Cliente sabe que `complete` ou `error` indicam fim da conexao; `progress` sao intermediarios |
| CORS apenas em dev mode | Em producao, frontend e servido pelo mesmo servidor; em dev, Vite roda em `:5173` |
| SPA fallback para `index.html` | Requisicoes nao-API que nao correspondem a arquivo estatico retornam index.html para roteamento client-side |
| Deploy route valida targets antes de processar | Retorna 400 imediatamente para targets invalidos, antes de iniciar qualquer operacao |

## Changelog

| Data | Mudanca |
|------|---------|
| 2025-03-05 | Spec criada |
| 2026-03-06 | Documentados explorer REST, picker nativo de pasta e registro de workspace por diretorio |
| 2026-03-06 | Documentado retorno de diretorios reconhecidos por target no payload de workspace |
| 2026-03-06 | Documentado o contrato de sugestoes de workspace e a regra de exibir apenas workspaces registrados |
| 2026-03-06 | Documentado sync com workspace explicito para a UI nao depender de `ativo` como acao manual |
