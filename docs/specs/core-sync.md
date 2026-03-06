# core-sync

> Spec comportamental — contrato vivo para agentes e desenvolvedores.

## Proposito

Motor de sincronizacao que le um workspace manifest, busca skills do storage provider, e faz deploy de cada uma para os targets declarados. Modulo desacoplado da CLI para ser reutilizado por MCP tools e testes. Funcao unica: `syncWorkspace`.

## Localizacao

- **Arquivo fonte**: `src/core/sync.ts`
- **Testes**: `tests/core/sync.test.ts`

## Invariantes

1. Skills que falham NAO interrompem o processamento das demais — o loop sempre continua.
2. `SyncResult` SEMPRE contém os 3 arrays: `deployed`, `failed`, `skipped` (nunca undefined).
3. Eventos de progresso sao emitidos na ordem `fetch` -> `deploy` para cada skill.
4. `dryRun` NAO modifica o filesystem; registra path como `'(dry-run)'` nos resultados.
5. O filtro e case-insensitive (compara em lowercase).
6. Lista resolvida vazia retorna resultado vazio imediatamente (sem criar provider/cache).
7. Erros de deploy sao capturados por target — um target falhando nao impede os outros targets da mesma skill.
8. Erros de fetch registram falha para TODOS os targets daquela skill.
9. Quando cache esta fresh e nao e `force`, a skill e deployada a partir do cache sem fetch remoto.
10. Quando `force` e `true`, `isFresh` e ignorado e o fetch remoto e sempre executado.
11. Se `isFresh` retorna `true` mas `getCachedSkill` retorna `null` (inconsistencia), faz fallthrough para fetch remoto.

## Comportamentos (Given/When/Then)

### Cenario: Sync basico com 2 skills para 1 target

- **Given**: Manifesto declara `skill-a` e `skill-b` para target `claude-code`. Provider retorna ambas com sucesso.
- **When**: `syncWorkspace(manifest, config)` e chamado.
- **Then**: `deployed` contém 2 entradas (`skill-a/claude-code`, `skill-b/claude-code`), `failed` e `skipped` estao vazios.

### Cenario: Fetch falha para uma skill

- **Given**: Manifesto declara `skill-a` (targets: `claude-code`, `codex`) e `skill-b` (target: `cursor`). Provider lanca erro ao buscar `skill-a`.
- **When**: `syncWorkspace(manifest, config)` e chamado.
- **Then**: `failed` contém 2 entradas para `skill-a` (uma por target, ambas com prefixo `"Fetch failed:"`). `deployed` contém 1 entrada para `skill-b/cursor`.

### Cenario: Deploy falha para um target mas nao para outro

- **Given**: Manifesto declara `skill-a` para targets `claude-code` e `cursor`. Deployer de `claude-code` lanca erro, deployer de `cursor` funciona.
- **When**: `syncWorkspace(manifest, config)` e chamado.
- **Then**: `failed` contém 1 entrada (`skill-a/claude-code`). `deployed` contém 1 entrada (`skill-a/cursor`).

### Cenario: Dry run nao modifica filesystem

- **Given**: Manifesto declara `skill-a` para `codex`.
- **When**: `syncWorkspace(manifest, config, { dryRun: true })` e chamado.
- **Then**: `deployed` contém 1 entrada com `path === '(dry-run)'`. Nenhum arquivo e escrito no disco. Provider e cache nao sao acessados para escrita.

### Cenario: Filtro case-insensitive

- **Given**: Manifesto declara `My-Skill` e `other-skill`.
- **When**: `syncWorkspace(manifest, config, { filter: ['my-skill'] })` e chamado.
- **Then**: Apenas `My-Skill` e processada (match case-insensitive). `other-skill` nao aparece em nenhum array.

### Cenario: Filtro resulta em lista vazia

- **Given**: Manifesto declara `skill-a`.
- **When**: `syncWorkspace(manifest, config, { filter: ['inexistente'] })` e chamado.
- **Then**: Retorna `{ deployed: [], failed: [], skipped: [] }` imediatamente.

### Cenario: Cache fresh evita fetch remoto

- **Given**: Manifesto declara `skill-a` para `claude-code`. Cache reporta `isFresh('skill-a') === true` e `getCachedSkill` retorna o pacote.
- **When**: `syncWorkspace(manifest, config)` e chamado (sem `force`).
- **Then**: `provider.get()` NAO e chamado. Deploy usa o pacote do cache.

### Cenario: Force ignora cache

- **Given**: Manifesto declara `skill-a`. Cache reporta `isFresh === true`.
- **When**: `syncWorkspace(manifest, config, { force: true })` e chamado.
- **Then**: `isFresh` NAO e consultado. `provider.get()` e chamado. Skill e cacheada novamente apos fetch.

### Cenario: Eventos de progresso emitidos

- **Given**: Manifesto declara `skill-a` para `claude-code`. Callback `onProgress` fornecido.
- **When**: `syncWorkspace(manifest, config, { onProgress })` e chamado.
- **Then**: `onProgress` recebe pelo menos 1 evento com `phase: 'fetch'` e 1 com `phase: 'deploy'`, ambos com `skill: 'skill-a'` e campos `current`/`total` numericos.

## Contratos de Interface

### Funcoes Publicas

| Funcao | Entrada | Saida | Lanca |
|--------|---------|-------|-------|
| `syncWorkspace(manifest, config, options?)` | `WorkspaceManifest`, `AhubConfig`, `SyncOptions?` | `Promise<SyncResult>` | Nao lanca (erros capturados internamente) |

### Tipos Utilizados (de `./types.js`)

```typescript
interface SyncResult {
  deployed: SyncDeployedEntry[];  // { skill, target, path }
  failed: SyncFailedEntry[];      // { skill, target, error }
  skipped: string[];
}

interface SyncOptions {
  force?: boolean;
  filter?: string[];
  dryRun?: boolean;
  onProgress?: (event: SyncProgressEvent) => void;
}

interface SyncProgressEvent {
  phase: 'fetch' | 'deploy';
  skill: string;
  target?: DeployTarget;
  current: number;
  total: number;
}
```

## Dependencias

| Modulo | Uso |
|--------|-----|
| `./types.js` | `AhubConfig`, `SyncResult`, `SyncOptions`, `SyncProgressEvent`, etc. |
| `./cache.js` | `CacheManager` — verifica freshness e armazena skills |
| `../storage/factory.js` | `createProvider(config)` — cria o provider de storage |
| `../deploy/deployer.js` | `createDeployer(target, customPath?)` — cria deployer por target |
| `./workspace.js` | `resolveManifestSkills` — converte manifesto em lista flat |

### Consumido por

- `src/cli/commands/sync.ts` — comando CLI `ahub sync`
- `src/api/routes/sync.ts` — endpoint REST de sync
- `src/mcp/tools.ts` — tool MCP `ahub_sync`

## Efeitos Colaterais

| Operacao | Efeito |
|----------|--------|
| `provider.get(name)` | Acesso a rede (git clone/pull ou Google Drive API) |
| `cache.cacheSkill(pkg)` | Escrita em `~/.ahub/cache/<name>/` |
| `deployer.deploy(pkg)` | Escrita de arquivos nos paths de deploy (ex.: `~/.claude/commands/`) |
| Modo `dryRun` | Nenhum efeito colateral — apenas leitura |

## Decisoes de Design

| Decisao | Motivo |
|---------|--------|
| Erros por skill nao interrompem o loop | Resiliencia — sync parcial e melhor que falha total |
| Erros de deploy sao capturados por target | Granularidade fina — um deployer quebrado nao invalida outros |
| Fetch error marca TODOS os targets como failed | Sem pacote, nao ha o que deployar — semantica correta |
| Cache consultado antes de fetch | Performance — evita rede quando desnecessario |
| Filtro case-insensitive | UX — usuario nao precisa lembrar capitalizacao exata |
| `dryRun` registra `'(dry-run)'` como path | Permite reusar a mesma estrutura de resultado sem ambiguidade |
| `SyncResult` sempre com 3 arrays | Consumidores podem confiar na shape sem null-checks |
| Provider e cache criados apenas se `resolved.length > 0` | Evita I/O desnecessario para manifesto vazio ou filtro sem match |

## Changelog

| Data | Mudanca |
|------|---------|
| 2026-03-05 | Spec criada |
