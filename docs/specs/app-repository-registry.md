# app-repository-registry

> Spec comportamental — registro oficial de repositorios locais por app e plano de migracao entre apps.

## Proposito

Documentar a matriz oficial de apps suportados pelo agent-hub para diagnostico local. O registro separa:

1. app conhecido
2. path canonico que o app realmente le
3. paths legados/compatibilidade
4. tipo de artefato encontrado
5. capacidade de migracao entre repositorios oficiais

## Localizacao

- **Codigo**: `src/core/app-registry.ts`, `src/core/app-artifacts.ts`, `src/core/app-migration.ts`
- **API**: `src/api/routes/apps.ts`, `src/api/routes/migrations.ts`, `src/api/routes/workspace.ts`, `src/api/routes/explorer.ts`
- **CLI**: `src/cli/commands/doctor.ts`, `src/cli/commands/migrate-app.ts`
- **UI**: `ui/src/pages/WorkspacePage.tsx`, `ui/src/components/workspace/DirectoryBrowser.tsx`

## Invariantes

1. `DeployTarget` continua restrito a `claude-code`, `codex` e `cursor`.
2. O diagnostico local usa `AgentAppId` separado de `DeployTarget`.
3. Todo app no registro possui `supportLevel`, `docUrls`, `canonicalLocations[]` e `legacyLocations[]`.
4. O scanner nao infere paths por heuristica solta; ele deriva do registro oficial.
5. Paths canônicos geram `visible_in_app`.
6. Paths legados geram `found_in_legacy_repository`.
7. Paths genericos como `.skills` podem gerar `found_in_wrong_repository` para apps que exigem outro repositorio local.
8. Apps oficialmente conhecidos sem layout local verificavel usam `official_app_unverified_layout` e nunca recebem sugestao automatica de mover arquivos.
9. `POST /api/migrations/plan` nunca escreve no disco.
10. `ahub migrate-app` so executa escrita quando a rota esta marcada como executavel e o usuario nao pediu `--dry-run`.

## Comportamentos

### Cenario: Skill em repositorio canonico do Codex

- **Given**: Existe `workspace/.codex/skills/fiscal/SKILL.md`
- **When**: O scanner do registro roda para este workspace
- **Then**: O artefato aparece como `visible_in_app` para `codex`

### Cenario: Skill em `.skills` fora do repositorio oficial

- **Given**: Existe `workspace/.skills/fiscal/SKILL.md`
- **When**: O scanner avalia `codex`, `claude-code` e `cursor`
- **Then**: O mesmo artefato aparece como `found_in_wrong_repository`, cada app com seu `expectedPath`

### Cenario: Repositorio legado

- **Given**: Existe `workspace/.cursorrules`
- **When**: O scanner avalia `cursor`
- **Then**: O artefato aparece como `found_in_legacy_repository`

### Cenario: App conhecido sem layout verificavel

- **Given**: O catalogo inclui `antigravity`
- **When**: O usuario consulta o catalogo de apps ou o diagnostico do workspace
- **Then**: O sistema expõe `supportLevel=official_app_unverified_layout` e nao sugere migracao automatica

### Cenario: Planejar migracao de Codex para Claude Code

- **Given**: Existe `workspace/.codex/skills/fiscal/SKILL.md`
- **When**: `POST /api/migrations/plan` ou `ahub migrate-app --from codex --to claude-code --skill fiscal --dry-run`
- **Then**: O plano aponta `.claude/commands/fiscal.md`, classifica a operacao como `lossy_with_explicit_warning` e lista os avisos

## Contratos de Interface

### Endpoints

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/apps/catalog` | Lista apps oficiais, paths canonicos/legados e nivel de suporte |
| POST | `/api/migrations/plan` | Gera plano de migracao entre apps sem escrita |
| GET | `/api/workspace` | Enriquece a resposta com `apps[]` alem de `agents[]` |
| GET | `/api/explorer/scan` | Enriquece a resposta com `artifacts[]` e `apps[]` |

### Tipos Publicos

- `AgentAppId`
- `ArtifactKind`
- `SupportLevel`
- `ArtifactVisibilityStatus`
- `DetectedAppArtifact`
- `WorkspaceAppInventory`
- `AppMigrationPlan`

## Decisoes de Design

| Decisao | Motivo |
|---------|--------|
| Registro dirigido por dados | Evita espalhar paths e excecoes em `if/else` por varios modulos |
| `AgentAppId` separado de `DeployTarget` | Nao mistura diagnostico amplo com destinos de deploy que realmente escrevem hoje |
| `apps[]` separado de `agents[]` | Mantem compatibilidade do inventario legado e adiciona diagnostico oficial por app |
| Migracao executavel apenas em rotas mapeadas | Impede escrita especulativa para apps sem equivalencia oficial validada |

## Changelog

| Data | Mudanca |
|------|---------|
| 2026-03-07 | Spec criada para formalizar o registro oficial de repositorios por app e o plano de migracao entre apps |
