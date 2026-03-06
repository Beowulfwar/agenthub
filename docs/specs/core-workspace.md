# core-workspace

> Spec comportamental — contrato vivo para agentes e desenvolvedores.

## Proposito

Gerenciar o manifesto de workspace (`ahub.workspace.json` ou `.ahub.json`) que declara quais skills um projeto precisa e para quais targets de deploy elas devem ser enviadas. O modulo busca o manifesto subindo a arvore de diretorios, valida o schema, e resolve a lista final de skills com seus targets mesclados.

## Localizacao

- **Arquivo fonte**: `src/core/workspace.ts`
- **Testes**: `tests/core/workspace.test.ts`
- **Artefato em disco**: `ahub.workspace.json` ou `.ahub.json` na raiz do projeto

## Invariantes

1. A busca pelo manifesto e ascendente: comeca no `startDir` (ou `cwd`) e sobe ate a raiz do filesystem.
2. Dois nomes sao aceitos, nesta ordem de prioridade: `ahub.workspace.json`, `.ahub.json`.
3. `version: 1` e obrigatorio — qualquer outro valor lanca `Error`.
4. Targets invalidos (fora de `'claude-code' | 'codex' | 'cursor'`) sao rejeitados durante `loadWorkspaceManifest`.
5. Nomes de skills sao validados via `assertSafeSkillName` (prevencao de path traversal).
6. `requireWorkspaceManifest` lanca `WorkspaceNotFoundError` se nenhum manifesto for encontrado.
7. `resolveManifestSkills` aplica `defaultTargets` como fallback; se `defaultTargets` tambem for ausente, usa `['claude-code']`.
8. Skills presentes tanto em `groups` quanto em `skills` tem seus targets mesclados (uniao de conjuntos).
9. O resultado de `resolveManifestSkills` e ordenado alfabeticamente por nome, e os targets de cada skill tambem sao ordenados alfabeticamente.
10. `saveWorkspaceManifest` serializa com indentacao de 2 espacos e newline final.

## Comportamentos (Given/When/Then)

### Cenario: Buscar manifesto subindo diretorios

- **Given**: Arquivo `ahub.workspace.json` existe em `/projeto/raiz/` mas nao em `/projeto/raiz/src/app/`.
- **When**: `findWorkspaceManifest('/projeto/raiz/src/app/')` e chamado.
- **Then**: Retorna `'/projeto/raiz/ahub.workspace.json'`.

### Cenario: Buscar manifesto quando nenhum existe

- **Given**: Nenhum arquivo `ahub.workspace.json` ou `.ahub.json` existe em nenhum diretorio ate a raiz.
- **When**: `findWorkspaceManifest('/algum/caminho/')` e chamado.
- **Then**: Retorna `null`.

### Cenario: Preferencia de nome de arquivo

- **Given**: Ambos `ahub.workspace.json` e `.ahub.json` existem no mesmo diretorio.
- **When**: `findWorkspaceManifest()` e chamado a partir desse diretorio.
- **Then**: Retorna o caminho para `ahub.workspace.json` (primeiro na lista de prioridade).

### Cenario: Rejeitar manifesto com versao incorreta

- **Given**: Arquivo contém `{ "version": 2, "skills": [] }`.
- **When**: `loadWorkspaceManifest(path)` e chamado.
- **Then**: Lanca `Error` com mensagem `"Unsupported workspace manifest version: 2. Expected 1."`.

### Cenario: Rejeitar target invalido em skill

- **Given**: Manifesto contém `{ "version": 1, "skills": [{ "name": "my-skill", "targets": ["vscode"] }] }`.
- **When**: `loadWorkspaceManifest(path)` e chamado.
- **Then**: Lanca `Error` com mensagem contendo `"Invalid target \"vscode\""`.

### Cenario: Rejeitar nome de skill com path traversal

- **Given**: Manifesto contém `{ "version": 1, "skills": [{ "name": "../evil" }] }`.
- **When**: `loadWorkspaceManifest(path)` e chamado.
- **Then**: Lanca `SkillValidationError` pois `assertSafeSkillName` rejeita o nome.

### Cenario: Resolver skills com merge de targets entre groups e skills

- **Given**: Manifesto contém:
  - `groups: [{ targets: ['codex'], skills: ['skill-a'] }]`
  - `skills: [{ name: 'skill-a', targets: ['cursor'] }]`
- **When**: `resolveManifestSkills(manifest)` e chamado.
- **Then**: `skill-a` aparece uma vez com `targets: ['codex', 'cursor']` (uniao, ordenado).

### Cenario: Resolver skills com defaultTargets como fallback

- **Given**: Manifesto contém `defaultTargets: ['codex']` e `skills: [{ name: 'my-skill' }]` (sem targets explicitos).
- **When**: `resolveManifestSkills(manifest)` e chamado.
- **Then**: `my-skill` recebe `targets: ['codex']` (herdado de `defaultTargets`).

### Cenario: Fallback final para claude-code

- **Given**: Manifesto sem `defaultTargets` e `skills: [{ name: 'my-skill' }]` (sem targets).
- **When**: `resolveManifestSkills(manifest)` e chamado.
- **Then**: `my-skill` recebe `targets: ['claude-code']` (fallback padrao).

### Cenario: requireWorkspaceManifest sem manifesto

- **Given**: Nenhum manifesto existe na arvore de diretorios.
- **When**: `requireWorkspaceManifest('/projeto/app')` e chamado.
- **Then**: Lanca `WorkspaceNotFoundError` com `searchDir` = `'/projeto/app'`.

## Contratos de Interface

### Funcoes Publicas

| Funcao | Entrada | Saida | Lanca |
|--------|---------|-------|-------|
| `findWorkspaceManifest(startDir?)` | `string` (opcional) | `Promise<string \| null>` | Erros de I/O |
| `loadWorkspaceManifest(filePath)` | `string` | `Promise<WorkspaceManifest>` | `Error` (versao, targets invalidos), `SkillValidationError` (nomes) |
| `requireWorkspaceManifest(startDir?)` | `string` (opcional) | `Promise<{ manifest, filePath }>` | `WorkspaceNotFoundError` |
| `saveWorkspaceManifest(filePath, manifest)` | `string`, `WorkspaceManifest` | `Promise<void>` | Erros de I/O |
| `resolveManifestSkills(manifest)` | `WorkspaceManifest` | `ResolvedSkill[]` | — (sincrono, puro) |

### Tipos Exportados

```typescript
interface ResolvedSkill {
  name: string;
  targets: DeployTarget[];
}
```

### Constantes Exportadas

| Nome | Valor |
|------|-------|
| `WORKSPACE_FILENAMES` | `['ahub.workspace.json', '.ahub.json']` (readonly tuple) |

### Tipos Utilizados (de `./types.js`)

- `WorkspaceManifest` — shape do manifesto
- `WorkspaceSkillEntry` — entrada individual de skill
- `WorkspaceTargetGroup` — grupo de skills por target
- `DeployTarget` — `'claude-code' | 'codex' | 'cursor'`

## Dependencias

| Modulo | Uso |
|--------|-----|
| `node:fs/promises` | `readFile`, `writeFile` |
| `node:path` | `path.resolve`, `path.join`, `path.dirname`, `path.parse` |
| `./types.js` | `DeployTarget`, `WorkspaceManifest`, `WorkspaceSkillEntry`, `WorkspaceTargetGroup` |
| `./errors.js` | `WorkspaceNotFoundError` |
| `./sanitize.js` | `assertSafeSkillName` |

### Consumido por

- `src/core/sync.ts` — `resolveManifestSkills` para obter lista flat de skills
- `src/cli/commands/sync.ts` — `requireWorkspaceManifest` para carregar manifesto
- `src/api/routes/workspace.ts` — endpoints REST de workspace

## Efeitos Colaterais

| Operacao | Efeito |
|----------|--------|
| `findWorkspaceManifest` | Leitura de filesystem (tenta abrir arquivos em cada diretorio ascendente) |
| `loadWorkspaceManifest` | Leitura de um arquivo JSON do disco |
| `saveWorkspaceManifest` | Escrita de arquivo JSON no disco |
| `resolveManifestSkills` | Nenhum — funcao pura, sincrona |

## Decisoes de Design

| Decisao | Motivo |
|---------|--------|
| Busca ascendente (como `.gitignore`) | Permite que subpastas herdem o manifesto do projeto pai |
| Dois nomes aceitos (`ahub.workspace.json`, `.ahub.json`) | Flexibilidade — nome longo e explicito ou nome curto dot-file |
| `version: 1` obrigatorio | Forward-compatibility — permite evolucao do schema sem quebrar |
| Validacao de targets durante load (nao durante resolve) | Fail-fast na entrada — evita erros silenciosos durante sync |
| Merge de targets por uniao (Set) | Permite compor targets de formas diferentes sem duplicatas |
| Resultado ordenado alfabeticamente | Determinismo — mesma entrada sempre gera mesma saida |
| `resolveManifestSkills` e sincrono e puro | Facilita testes e composicao; nao depende de I/O |

## Changelog

| Data | Mudanca |
|------|---------|
| 2026-03-05 | Spec criada |
