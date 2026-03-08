# storage-provider

> Spec comportamental — contrato vivo para os backends de storage.

## Proposito

Definir o contrato uniforme que todos os backends de armazenamento devem implementar (`StorageProvider`) e a politica de layout canonico do catalogo cloud. O storage agora e tipado por `type + name`, com leitura dual do layout legado flat e escrita somente no layout novo.

## Localizacao

- **Codigo**: `src/storage/provider.ts`, `src/storage/factory.ts`, `src/storage/local-provider.ts`, `src/storage/git-provider.ts`, `src/storage/drive-provider.ts`, `src/core/storage-layout-migration.ts`
- **Testes unitarios**: `tests/storage/factory.test.ts`, `tests/core/storage-layout-migration.test.ts`

## Invariantes

1. A interface continua uniforme para todos os providers.
2. O identificador canonico do storage e `ContentRef = { type, name }`.
3. O layout canonico e:
   - `skills/<name>/`
   - `prompts/<name>/`
   - `subagents/<name>/`
4. O layout legado flat `<root>/<name>/` continua legivel apenas como fallback.
5. Toda nova escrita (`put`) acontece somente no layout canonico tipado.
6. `listContentRefs()` e a listagem canonica; `list()` continua como alias stringificado (`type/name`).
7. `exists`, `get` e `delete` aceitam tanto `ContentRef` quanto alias string, mas chamadas sem `type` so sao seguras quando nao houver ambiguidade.
8. A rotina de migracao de layout reporta conflitos antes de aplicar e so move entradas com destino livre.

## Comportamentos

### Cenario: Listar conteudos tipados

- **Given**: O root contem `skills/review/`, `prompts/review/` e `subagents/review/`
- **When**: `provider.listContentRefs()` e chamado
- **Then**: O retorno inclui tres entradas distintas com o mesmo `name` e `type` diferentes

### Cenario: Ler fallback legado

- **Given**: O root contem apenas um diretorio legado flat `review/SKILL.md`
- **When**: `provider.get({ type: 'skill', name: 'review' })`
- **Then**: O provider ainda consegue carregar o pacote a partir do layout antigo

### Cenario: Escrever sempre no layout novo

- **Given**: Existe um conteudo `prompt/review`
- **When**: `provider.put(pkg)` e chamado
- **Then**: O provider grava em `prompts/review/` independentemente de um diretório flat legado existir

### Cenario: Dry-run de migracao detecta conflito

- **Given**: O root contem `review/SKILL.md` e tambem `skills/review/`
- **When**: `planStorageLayoutMigration(rootDir)` e chamado
- **Then**: O item `skill/review` aparece com `status = conflict`

### Cenario: Apply move apenas itens prontos

- **Given**: O root contem `alpha/PROMPT.md` sem destino canonico correspondente
- **When**: `applyStorageLayoutMigration(rootDir)` e chamado
- **Then**: O diretorio e movido para `prompts/alpha/`

## Contratos de Interface

### Interface StorageProvider

| Metodo | Input | Output | Throws |
|--------|-------|--------|--------|
| `healthCheck()` | — | `Promise<HealthCheckResult>` | — |
| `list(options?)` | `string \| { query?, type? }` | `Promise<string[]>` | — |
| `listContentRefs(options?)` | `string \| { query?, type? }` | `Promise<ContentRef[]>` | — |
| `exists(nameOrRef)` | `string \| ContentRef` | `Promise<boolean>` | — |
| `get(nameOrRef)` | `string \| ContentRef` | `Promise<ContentPackage>` | `SkillNotFoundError` |
| `put(pkg)` | `ContentPackage` | `Promise<void>` | — |
| `delete(nameOrRef)` | `string \| ContentRef` | `Promise<void>` | `SkillNotFoundError` |
| `exportAll()` | — | `AsyncIterable<ContentPackage>` | — |

### Migracao de layout

| Funcao | Input | Output |
|--------|-------|--------|
| `planStorageLayoutMigration(rootDir)` | `string` | `StorageLayoutMigrationReport` |
| `applyStorageLayoutMigration(rootDir)` | `string` | `StorageLayoutMigrationReport` |

## Dependencias

- `src/core/skill.ts`
- `src/core/content-ref.ts`
- `src/core/storage-layout-migration.ts`
- `src/core/errors.ts`
- `src/core/types.ts`

## Efeitos Colaterais

- Providers Git e Drive continuam materializando alteracoes no backend remoto.
- O provider local grava no filesystem tipado.
- `applyStorageLayoutMigration` renomeia diretorios no disco.

## Decisoes de Design

| Decisao | Justificativa |
|---------|---------------|
| Layout `/<type>/<name>/` | Permite coexistencia segura de slugs iguais entre tipos diferentes |
| Leitura dual, escrita unica | Facilita migracao sem manter ambiguidade para sempre |
| `listContentRefs()` como API canonica | Elimina parsing heuristico no restante da aplicacao |
| CLI `migrate-layout` | Torna a migracao operacional e auditavel fora do codigo de runtime |

## Changelog

| Data | Mudanca |
|------|---------|
| 2025-03-05 | Spec criada |
| 2026-03-07 | Atualizada para storage tipado `type + name`, fallback do layout legado e migracao `dry-run/apply` |
