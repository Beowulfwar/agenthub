# core-skill

> Spec comportamental — contrato vivo para agentes e desenvolvedores.

## Proposito

Parsing, serializacao e validacao de arquivos SKILL.md (YAML frontmatter via gray-matter). Responsavel tambem por I/O de pacotes de skill completos (diretorio com SKILL.md + subpastas opcionais).

## Localizacao

- **Codigo**: `src/core/skill.ts`
- **Testes unitarios**: `tests/core/skill.test.ts`
- **Testes de caracterizacao**: `tests/specs/core-skill.spec.ts`

## Invariantes

1. `parseSkill()` SEMPRE retorna um objeto `Skill` — nunca lanca excecao por frontmatter malformado (campos faltantes resultam em strings vazias)
2. `serializeSkill(parseSkill(raw))` preserva semanticamente name, description, body e metadata (round-trip)
3. `validateSkill()` rejeita skills sem `name` ou sem `description` com `SkillValidationError`
4. Todo nome de skill usado em I/O de filesystem passa por `assertSafeSkillName()` — nomes com `..`, `/`, `\` sao rejeitados
5. Todo caminho relativo de arquivo passa por `assertSafeRelativePath()` antes de escrita em disco
6. Apenas subdiretorios `agents/`, `scripts/`, `references/` sao incluidos no package (COMPANION_DIRS)

## Comportamentos (Given/When/Then)

### Parse de SKILL.md valido

- **Given**: String com frontmatter YAML contendo `name` e `description`
- **When**: `parseSkill(content)`
- **Then**: Retorna `Skill` com name, description extraidos do frontmatter, body do markdown, e metadata com campos extras

### Parse de SKILL.md sem campos obrigatorios

- **Given**: String com frontmatter vazio ou sem `name`/`description`
- **When**: `parseSkill(content)`
- **Then**: Retorna `Skill` com name='' e/ou description='' (nao lanca erro)

### Round-trip serialize/parse

- **Given**: Um `Skill` valido com name, description, body e metadata
- **When**: `parseSkill(serializeSkill(skill))`
- **Then**: O resultado preserva todos os campos do skill original

### Validacao rejeita skill incompleto

- **Given**: Um `Skill` com `name` vazio
- **When**: `validateSkill(skill)`
- **Then**: Lanca `SkillValidationError` com violations listando o campo faltante

### Carregamento de package do disco

- **Given**: Diretorio contendo SKILL.md e opcionalmente subpastas agents/, scripts/, references/
- **When**: `loadSkillPackage(dirPath)`
- **Then**: Retorna `SkillPackage` com skill parseado e array de files incluindo SKILL.md e arquivos dos subdiretorios

### Carregamento de package inexistente

- **Given**: Diretorio sem SKILL.md
- **When**: `loadSkillPackage(dirPath)`
- **Then**: Lanca `SkillNotFoundError`

### Extracao de extensoes do frontmatter

- **Given**: Skill com metadata contendo `tags: ["fiscal", "ops"]`, `targets: ["claude-code"]`, `category: "fiscal"`
- **When**: `extractSkillExtensions(skill)`
- **Then**: Retorna `{ tags: ["fiscal", "ops"], targets: ["claude-code"], category: "fiscal" }`

### Extracao de extensoes com metadata vazia

- **Given**: Skill sem metadata ou com metadata sem os campos especiais
- **When**: `extractSkillExtensions(skill)`
- **Then**: Retorna `{ tags: undefined, targets: undefined, category: undefined }`

## Contratos de Interface

### Funcoes Publicas

| Funcao | Input | Output | Throws |
|--------|-------|--------|--------|
| `parseSkill(content)` | `string` | `Skill` | — |
| `serializeSkill(skill)` | `Skill` | `string` | — |
| `validateSkill(skill)` | `Skill` | `void` | `SkillValidationError` |
| `loadSkillPackage(dirPath)` | `string` | `Promise<SkillPackage>` | `SkillNotFoundError` |
| `saveSkillPackage(dirPath, pkg)` | `string, SkillPackage` | `Promise<void>` | — |
| `extractSkillExtensions(skill)` | `Skill` | `SkillFrontmatterExtensions` | — |

### Tipos Exportados

Nenhum tipo exportado diretamente — tipos vem de `src/core/types.ts`.

## Dependencias

- **Usa**: `gray-matter`, `node:fs/promises`, `node:path`, `./types.js`, `./errors.js`, `./sanitize.js`
- **Usado por**: `src/core/cache.ts`, `src/storage/git-provider.ts`, `src/storage/drive-provider.ts`, `src/mcp/tools.ts`, `src/api/routes/skills.ts`

## Efeitos Colaterais

- `loadSkillPackage()`: Le arquivos do filesystem (SKILL.md + subdiretorios)
- `saveSkillPackage()`: Escreve arquivos no filesystem, cria diretorios recursivamente

## Decisoes de Design

| Decisao | Justificativa |
|---------|---------------|
| `parseSkill` nunca lanca erro | Permite carregar skills parcialmente invalidas para inspecao |
| `validateSkill` e' separado de `parseSkill` | Permite parse sem validacao (ex: import de skill legada) |
| Apenas 3 subdiretorios (agents/scripts/references) | Mantém pacotes focados; outros diretorios sao ignorados |
| `extractSkillExtensions` nao modifica o skill | Typed overlay read-only — nao interfere no parse/serialize |

## Changelog

| Data | Mudanca |
|------|---------|
| 2025-03-05 | Spec criada |
