# core-workspace

> Spec comportamental — contrato vivo do manifesto de workspace.

## Proposito

Gerenciar o arquivo de workspace (`ahub.workspace.json` ou `.ahub.json`) que descreve quais conteudos cloud-backed um projeto deseja sincronizar. O manifesto agora tem identidade canonica por `type + name`, usa `contents[]` como shape oficial em `version: 2` e continua aceitando aliases legados `skills[]` e `groups.skills[]` durante a transicao.

## Localizacao

- **Arquivo fonte**: `src/core/workspace.ts`
- **Testes**: `tests/core/workspace.test.ts`
- **Artefato em disco**: `ahub.workspace.json` ou `.ahub.json`

## Invariantes

1. A busca pelo manifesto continua ascendente a partir do `startDir` ate a raiz do filesystem.
2. Dois nomes continuam aceitos, nesta ordem: `ahub.workspace.json`, `.ahub.json`.
3. `version: 1` e `version: 2` sao aceitos; qualquer outro valor gera erro explicito.
4. O shape canonico em memoria e sempre `version: 2`, com `contents[]` e `groups.contents[]`.
5. Entradas legadas `skills[]` e `groups.skills[]` sao lidas como `type: 'skill'`.
6. A identidade canonica do manifesto e `ContentRef = { type, name }`; slugs iguais podem coexistir entre tipos diferentes.
7. Targets invalidos continuam sendo rejeitados durante `loadWorkspaceManifest`.
8. Nomes continuam validados via `assertSafeSkillName`.
9. `resolveManifestSkills` continua sendo o alias retrocompativel da lista flat resolvida, mas agora devolve entradas com `type`.
10. `defaultTargets` continua sendo fallback por entrada; quando ausente, o fallback final continua `['claude-code']`.
11. `saveWorkspaceManifest` sempre persiste `version: 2` e remove aliases legados do payload salvo.
12. Um workspace pode ser salvo com `contents: []` e continuar valido.

## Comportamentos

### Cenario: Carregar manifesto v1 e normalizar para v2

- **Given**: O arquivo contem `{ "version": 1, "skills": [{ "name": "alpha", "targets": ["codex"] }] }`
- **When**: `loadWorkspaceManifest(path)` e chamado
- **Then**: O retorno em memoria usa `version: 2` e `contents: [{ type: 'skill', name: 'alpha', targets: ['codex'] }]`

### Cenario: Carregar manifesto v2 com tipos mistos

- **Given**: O arquivo contem `contents` com `skill/review`, `prompt/review` e `subagent/review`
- **When**: `resolveManifestSkills(manifest)` e chamado
- **Then**: As tres entradas coexistem sem colisao, cada uma preservando seu `type`

### Cenario: Mesclar groups.contents com contents

- **Given**: O manifesto contem `groups: [{ targets: ['cursor'], contents: [{ type: 'skill', name: 'alpha' }] }]`
- **And**: `contents: [{ type: 'skill', name: 'alpha', targets: ['codex'] }]`
- **When**: `resolveManifestSkills(manifest)` e chamado
- **Then**: `skill/alpha` aparece uma unica vez com `targets: ['codex', 'cursor']`

### Cenario: Salvar manifesto remove aliases legados

- **Given**: O caller passa um objeto com `version: 1`, `skills[]` e `groups.skills[]`
- **When**: `saveWorkspaceManifest(filePath, manifest)` e chamado
- **Then**: O arquivo salvo usa `version: 2`, `contents[]` e `groups.contents[]`, sem reescrever `skills[]`

### Cenario: Fallback de targets continua igual

- **Given**: Um item de `contents[]` nao define `targets` e o manifesto nao define `defaultTargets`
- **When**: `resolveManifestSkills(manifest)` e chamado
- **Then**: O item recebe `targets: ['claude-code']`

## Contratos de Interface

### Funcoes Publicas

| Funcao | Entrada | Saida | Lanca |
|--------|---------|-------|-------|
| `findWorkspaceManifest(startDir?)` | `string?` | `Promise<string \| null>` | Erros de I/O |
| `loadWorkspaceManifest(filePath)` | `string` | `Promise<WorkspaceManifest>` | `Error`, `SkillValidationError` |
| `requireWorkspaceManifest(startDir?)` | `string?` | `Promise<{ manifest, filePath }>` | `WorkspaceNotFoundError` |
| `saveWorkspaceManifest(filePath, manifest)` | `string`, `WorkspaceManifest` | `Promise<void>` | Erros de I/O |
| `resolveManifestContents(manifest)` | `WorkspaceManifest` | `ResolvedSkill[]` | — |
| `resolveManifestSkills(manifest)` | `WorkspaceManifest` | `ResolvedSkill[]` | — |

### Tipos relevantes

- `ContentRef` — `{ type: 'skill' | 'prompt' | 'subagent', name: string }`
- `WorkspaceContentEntry` — `ContentRef` com `targets?` e `source?`
- `WorkspaceManifest` — `version: 2`, `contents[]`, `groups.contents[]` e aliases legados opcionais

## Dependencias

- `node:fs/promises`
- `node:path`
- `src/core/types.ts`
- `src/core/errors.ts`
- `src/core/sanitize.ts`

## Efeitos Colaterais

- `findWorkspaceManifest` faz leitura ascendente do filesystem.
- `loadWorkspaceManifest` le e normaliza JSON do disco.
- `saveWorkspaceManifest` grava JSON canonico `version: 2`.
- `resolveManifestContents` e `resolveManifestSkills` sao funcoes puras.

## Decisoes de Design

| Decisao | Motivo |
|---------|--------|
| Canonico em `version: 2` com `contents[]` | Evita colisao entre `skill`, `prompt` e `subagent` com o mesmo slug |
| Leitura dual de v1/v2 | Permite migracao gradual sem quebrar workspaces existentes |
| Escrita somente no shape novo | Garante convergencia do ecossistema e reduz ambiguidade |
| Alias `resolveManifestSkills` mantido | Reduz churn enquanto a base deixa de ser skill-centric |

## Changelog

| Data | Mudanca |
|------|---------|
| 2026-03-05 | Spec criada |
| 2026-03-06 | Documento reposicionado como profile de sync por projeto |
| 2026-03-07 | Atualizada para manifesto canonico `version: 2` com `contents[]`, identidade `type + name` e compatibilidade de leitura com `skills[]` |
