# storage-provider

> Spec comportamental — contrato vivo para agentes e desenvolvedores.

## Proposito

Contrato uniforme que todos os backends de armazenamento devem implementar (`StorageProvider`) e factory que instancia o provider correto a partir da configuracao global (`createProvider`). Garante que o restante da aplicacao trabalhe contra uma unica abstracao, independente de o backend ser Git ou Google Drive.

## Localizacao

- **Codigo**: `src/storage/provider.ts` (interface), `src/storage/factory.ts` (factory), `src/storage/git-provider.ts`, `src/storage/drive-provider.ts`
- **Testes unitarios**: `tests/storage/factory.test.ts`
- **Testes de caracterizacao**: `tests/specs/storage-provider.spec.ts`

## Invariantes

1. A factory e exaustiva: adicionar um novo valor ao union type `'git' | 'drive'` sem handler no switch causa erro de compilacao TypeScript (variavel `never`)
2. Se `config.provider` e `'git'` mas `config.git` e `undefined`, a factory lanca `ProviderNotConfiguredError` — nunca erro generico
3. Se `config.provider` e `'drive'` mas `config.drive` e `undefined`, a factory lanca `ProviderNotConfiguredError`
4. A interface e uniforme: todos os backends expoe as mesmas assinaturas de metodo (`healthCheck`, `list`, `exists`, `get`, `put`, `delete`, `exportAll`)
5. `get()` e `delete()` lancam `SkillNotFoundError` quando a skill nao existe — nunca retornam `null` ou silenciam o erro
6. `list()` retorna nomes ordenados alfabeticamente quando nao ha filtro
7. `exportAll()` e um `AsyncIterable<SkillPackage>` — permite streaming sem carregar todas as skills em memoria
8. O campo `name` do provider e readonly e literal (`'git'` ou `'drive'`), nunca uma string arbitraria

## Comportamentos (Given/When/Then)

### Factory cria GitProvider com configuracao valida

- **Given**: `config.provider === 'git'` e `config.git` contem `{ repoUrl, branch, skillsDir }`
- **When**: `createProvider(config)`
- **Then**: Retorna instancia de `GitProvider` com `provider.name === 'git'`

### Factory cria DriveProvider com configuracao valida

- **Given**: `config.provider === 'drive'` e `config.drive` contem `{ folderId }`
- **When**: `createProvider(config)`
- **Then**: Retorna instancia de `DriveProvider` com `provider.name === 'drive'`

### Factory rejeita provider git sem secao git

- **Given**: `config.provider === 'git'` e `config.git === undefined`
- **When**: `createProvider(config)`
- **Then**: Lanca `ProviderNotConfiguredError` com `provider === 'git'` e mensagem sugerindo "ahub init"

### Factory rejeita provider drive sem secao drive

- **Given**: `config.provider === 'drive'` e `config.drive === undefined`
- **When**: `createProvider(config)`
- **Then**: Lanca `ProviderNotConfiguredError` com `provider === 'drive'` e mensagem sugerindo "ahub init"

### get() lanca SkillNotFoundError para skill inexistente

- **Given**: Provider configurado e conectado; skill `"minha-skill-inexistente"` nao existe no backend
- **When**: `provider.get("minha-skill-inexistente")`
- **Then**: Lanca `SkillNotFoundError` com `err.skillName === "minha-skill-inexistente"`

### list() filtra por substring case-insensitive

- **Given**: Provider com skills `["fiscal-nfe", "fiscal-nfce", "performance-sql"]`
- **When**: `provider.list("fiscal")`
- **Then**: Retorna `["fiscal-nfe", "fiscal-nfce"]` sem incluir `"performance-sql"`

### exportAll() faz streaming de todas as skills

- **Given**: Provider com N skills no backend
- **When**: `for await (const pkg of provider.exportAll())`
- **Then**: Emite exatamente N objetos `SkillPackage`, cada um com `skill.name` e `files[]`, sem carregar todos em memoria simultaneamente

## Contratos de Interface

### Funcoes Publicas

| Funcao | Input | Output | Throws |
|--------|-------|--------|--------|
| `createProvider(config)` | `AhubConfig` | `StorageProvider` | `ProviderNotConfiguredError` |

### Interface StorageProvider

| Metodo | Input | Output | Throws |
|--------|-------|--------|--------|
| `healthCheck()` | — | `Promise<HealthCheckResult>` | — |
| `list(query?)` | `string?` | `Promise<string[]>` | — |
| `exists(name)` | `string` | `Promise<boolean>` | — |
| `get(name)` | `string` | `Promise<SkillPackage>` | `SkillNotFoundError` |
| `put(pkg)` | `SkillPackage` | `Promise<void>` | — |
| `delete(name)` | `string` | `Promise<void>` | `SkillNotFoundError` |
| `exportAll()` | — | `AsyncIterable<SkillPackage>` | — |

### Tipos Exportados

- `StorageProvider` — interface do contrato de backend
- `HealthCheckResult` — `{ ok: boolean, message: string }`
- `SkillPackage` — `{ skill: Skill, files: SkillFile[] }`

## Dependencias

- **Usa**: `simple-git` (GitProvider), `googleapis` (DriveProvider, import lazy), `gray-matter` (via `core/skill.ts`), `core/sanitize.ts`, `core/errors.ts`, `core/types.ts`
- **Usado por**: `src/cli/commands/*.ts`, `src/mcp/tools.ts`, `src/api/routes/skills.ts`, `src/api/routes/health.ts`, `src/api/routes/deploy.ts`, `src/core/sync.ts`

## Efeitos Colaterais

- `GitProvider.ensureCloned()`: Clona repositorio em `~/.ahub/repos/<nome>/` se nao existir
- `GitProvider.pullIfStale()`: Executa `git pull` se ultimo pull > 60s atras; falha no pull e warning, nao erro
- `GitProvider.put()`: Faz `git add`, `git commit`, `git push` no repositorio local
- `GitProvider.delete()`: Remove diretorio, commita e faz push
- `DriveProvider.ensureClient()`: Importa `googleapis` lazily, inicia fluxo OAuth2 se nao autenticado
- `DriveProvider.authenticate()`: Abre servidor HTTP na porta 3000 para callback OAuth2, salva token em `~/.ahub/drive-token.json` (permissao 0o600)
- `DriveProvider.put()`: Cria/atualiza arquivos no Google Drive
- `DriveProvider.delete()`: Move pasta para lixeira do Drive (soft-delete, nao permanente)

## Decisoes de Design

| Decisao | Justificativa |
|---------|---------------|
| Provider pattern com factory | `createProvider()` isola a escolha do backend; restante da app nunca importa `GitProvider`/`DriveProvider` diretamente |
| Exhaustive switch com `never` | O `default` case atribui a variavel do tipo `never`, garantindo erro de compilacao ao adicionar provider sem handler |
| GitProvider faz pull com throttle (60s) | Evita pulls excessivos em operacoes em lote; falha no pull e warning, nao erro — dados stale sao melhores que crash |
| DriveProvider usa soft-delete | `delete()` move para lixeira em vez de deletar permanentemente, permitindo recuperacao manual |
| DriveProvider importa googleapis lazily | Usuarios que so usam Git nunca pagam o custo de carregar o SDK do Google Drive |
| OAuth2 com servidor HTTP local | DriveProvider abre servidor temporario na porta 3000 para callback, com timeout de 5 min; token persistido com permissao 0o600 |
| Interface uniforme | Ambos os providers expoe mesmos metodos; trocar backend nao requer alteracao no codigo consumidor |

## Changelog

| Data | Mudanca |
|------|---------|
| 2025-03-05 | Spec criada |
