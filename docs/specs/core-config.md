# core-config

> Spec comportamental — contrato vivo para agentes e desenvolvedores.

## Proposito

Gerenciar a configuracao persistente do agent-hub armazenada em `~/.ahub/config.json`. Fornece leitura, escrita, navegacao por dot-path e valores padrao de deploy para cada target suportado. E a base de configuracao consumida por cache, sync, CLI e MCP.

## Localizacao

- **Arquivo fonte**: `src/core/config.ts`
- **Testes**: `tests/core/config.test.ts`
- **Artefato em disco**: `~/.ahub/config.json`

## Invariantes

1. O diretorio de dados do usuario e sempre `~/.ahub/` (derivado de `os.homedir()`).
2. O arquivo de configuracao e sempre `~/.ahub/config.json`.
3. `loadConfig()` retorna `null` quando o arquivo nao existe (ENOENT) — nunca lanca erro para arquivo ausente.
4. `loadConfig()` retorna `null` quando o JSON e valido mas `provider` nao e `'git'` nem `'drive'`.
5. `loadConfig()` relanca erros que nao sejam ENOENT (ex.: permissao negada).
6. `saveConfig()` cria o diretorio `~/.ahub/` automaticamente se nao existir.
7. `saveConfig()` serializa com indentacao de 2 espacos e newline final.
8. `requireConfig()` lanca `Error` com mensagem orientando `ahub init` se nao houver config.
9. `setConfigValue()` lanca `Error` se nao houver config pre-existente.
10. `setConfigValue()` valida que `provider` continua sendo `'git'` ou `'drive'` apos mutacao.
11. `setConfigValue()` cria objetos intermediarios automaticamente para dot-paths profundos.
12. `getConfigValue()` retorna `undefined` quando nao ha config ou o caminho nao existe.
13. `getDefaultDeployPaths()` e sincrono e sempre retorna os 3 targets mapeados.

## Comportamentos (Given/When/Then)

### Cenario: Carregar config quando arquivo nao existe

- **Given**: O arquivo `~/.ahub/config.json` nao existe no disco.
- **When**: `loadConfig()` e chamado.
- **Then**: Retorna `null` sem lancar excecao.

### Cenario: Carregar config com provider invalido

- **Given**: O arquivo `~/.ahub/config.json` contém `{ "provider": "s3" }`.
- **When**: `loadConfig()` e chamado.
- **Then**: Retorna `null` pois `"s3"` nao e `'git'` nem `'drive'`.

### Cenario: Carregar config valida

- **Given**: O arquivo `~/.ahub/config.json` contém `{ "provider": "git", "git": { "repoUrl": "...", "branch": "main", "skillsDir": "." } }`.
- **When**: `loadConfig()` e chamado.
- **Then**: Retorna o objeto `AhubConfig` com `provider === 'git'`.

### Cenario: Salvar config cria diretorio automaticamente

- **Given**: O diretorio `~/.ahub/` nao existe.
- **When**: `saveConfig({ provider: 'git', git: { ... } })` e chamado.
- **Then**: O diretorio `~/.ahub/` e criado com `recursive: true` e o arquivo `config.json` e escrito com JSON indentado.

### Cenario: requireConfig sem config existente

- **Given**: `loadConfig()` retorna `null`.
- **When**: `requireConfig()` e chamado.
- **Then**: Lanca `Error` com mensagem contendo `"ahub init"`.

### Cenario: Navegar config com dot-path existente

- **Given**: Config contém `{ "provider": "git", "git": { "branch": "develop" } }`.
- **When**: `getConfigValue("git.branch")` e chamado.
- **Then**: Retorna `"develop"`.

### Cenario: Navegar config com dot-path inexistente

- **Given**: Config contém `{ "provider": "git" }` (sem chave `git`).
- **When**: `getConfigValue("git.branch")` e chamado.
- **Then**: Retorna `undefined`.

### Cenario: Setar valor com dot-path e persistir

- **Given**: Config contém `{ "provider": "git", "git": { "branch": "main" } }`.
- **When**: `setConfigValue("git.branch", "develop")` e chamado.
- **Then**: O valor `git.branch` e atualizado para `"develop"` e `saveConfig` e invocado com a config mutada.

### Cenario: Setar valor que invalida provider

- **Given**: Config contém `{ "provider": "git" }`.
- **When**: `setConfigValue("provider", "s3")` e chamado.
- **Then**: Lanca `Error` com mensagem `Invalid config: provider must be "git" or "drive"`.

### Cenario: Obter paths padrao de deploy

- **Given**: Nenhum pre-requisito.
- **When**: `getDefaultDeployPaths()` e chamado.
- **Then**: Retorna `{ "claude-code": "~/.claude/commands/", "codex": "~/.codex/skills/", "cursor": "~/.cursor/rules/" }` (com paths absolutos usando `os.homedir()`).

## Contratos de Interface

### Funcoes Publicas

| Funcao | Entrada | Saida | Lanca |
|--------|---------|-------|-------|
| `loadConfig()` | — | `Promise<AhubConfig \| null>` | Erros de I/O (exceto ENOENT) |
| `saveConfig(config)` | `AhubConfig` | `Promise<void>` | Erros de I/O |
| `requireConfig()` | — | `Promise<AhubConfig>` | `Error` se config ausente |
| `getConfigValue(key)` | `string` (dot-path) | `Promise<unknown>` | — |
| `setConfigValue(key, value)` | `string`, `unknown` | `Promise<void>` | `Error` se config ausente ou provider invalido |
| `getDefaultDeployPaths()` | — | `Record<DeployTarget, string>` | — |
| `ensureAhubDir()` | — | `Promise<void>` | Erros de I/O |

### Constantes Exportadas

| Nome | Valor |
|------|-------|
| `AHUB_DIR` | `path.join(os.homedir(), '.ahub')` |
| `CONFIG_PATH` | `path.join(AHUB_DIR, 'config.json')` |

### Tipos Utilizados

- `AhubConfig` (de `./types.js`) — shape do config.json
- `DeployTarget` (de `./types.js`) — `'claude-code' | 'codex' | 'cursor'`

## Dependencias

| Modulo | Uso |
|--------|-----|
| `node:fs/promises` | `mkdir`, `readFile`, `writeFile` |
| `node:os` | `os.homedir()` para derivar `AHUB_DIR` |
| `node:path` | `path.join` para construir caminhos |
| `./types.js` | `AhubConfig`, `DeployTarget` |

### Consumido por

- `src/core/cache.ts` — importa `AHUB_DIR` para derivar diretorio de cache
- `src/core/sync.ts` — usa `AhubConfig` como parametro
- `src/cli/commands/` — `requireConfig()`, `getConfigValue()`, `setConfigValue()`
- `src/mcp/tools.ts` — `requireConfig()` para operacoes MCP

## Efeitos Colaterais

| Operacao | Efeito |
|----------|--------|
| `ensureAhubDir()` | Cria `~/.ahub/` no filesystem |
| `saveConfig()` | Cria `~/.ahub/` e escreve `config.json` |
| `setConfigValue()` | Muta config em memoria, depois persiste via `saveConfig` |

## Decisoes de Design

| Decisao | Motivo |
|---------|--------|
| `loadConfig` retorna `null` em vez de lancar para ENOENT | Permite verificacao simples de "config existe?" sem try/catch |
| Validacao basica de shape (apenas `provider`) em `loadConfig` | Fail-fast sem impor schema rigido — campos opcionais evoluem |
| Dot-path navigation em `get/setConfigValue` | Evita que CLI precise conhecer a estrutura aninhada do config |
| `setConfigValue` valida `provider` apos mutacao | Garante que nenhuma escrita parcial corrompa o config |
| `getDefaultDeployPaths` e sincrono | Nao depende de I/O, apenas `os.homedir()` |
| Newline final no JSON salvo | Convencao POSIX para arquivos texto |

## Changelog

| Data | Mudanca |
|------|---------|
| 2026-03-05 | Spec criada |
