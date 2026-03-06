# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**agent-hub** is a CLI + MCP Server for managing AI agent skills (prompt packages) across Git and Google Drive storage backends. It deploys skills to Claude Code, Codex, and Cursor. Written in TypeScript (ESM), published as an npm package (`ahub` binary).

## Commands

```bash
npm install              # Install dependencies
npm run build            # TypeScript compile (tsc -p tsconfig.build.json)
npm run dev -- <cmd>     # Run CLI in dev mode via tsx (e.g., npm run dev -- list)
npm run lint             # Type check only (tsc --noEmit)
npm test                 # Run all tests (vitest)
npx vitest tests/core/skill.test.ts        # Run a single test file
npx vitest --watch                         # Watch mode
npx vitest --coverage                      # With coverage
```

## Architecture

```
bin/ahub.ts              → CLI entrypoint (Commander.js program)
src/
  index.ts               → Public API barrel (re-exports everything)
  core/
    types.ts             → All interfaces: Skill, SkillPackage, AhubConfig, DeployTarget, etc.
    config.ts            → ~/.ahub/config.json read/write, deploy path defaults
    skill.ts             → parseSkill (gray-matter), serializeSkill, validateSkill, loadSkillPackage, saveSkillPackage
    cache.ts             → CacheManager: ~/.ahub/cache/ with index.json freshness tracking
    errors.ts            → Error hierarchy: AhubError → SkillNotFoundError, SkillValidationError, etc.
    sanitize.ts          → Path traversal prevention: assertSafeSkillName, assertSafeRelativePath
  storage/
    provider.ts          → StorageProvider interface (list, get, put, delete, exportAll)
    factory.ts           → createProvider(config) → GitProvider | DriveProvider
    git-provider.ts      → Git backend via simple-git, local clone at ~/.ahub/repos/<name>/
    drive-provider.ts    → Google Drive backend via googleapis, OAuth2 flow on port 3000
  deploy/
    deployer.ts          → Deployer interface + createDeployer factory (lazy imports)
    claude-code.ts       → Writes body to ~/.claude/commands/<name>.md
    codex.ts             → Copies full package to ~/.codex/skills/<name>/
    cursor.ts            → Writes body to <cwd>/.cursor/rules/<name>.md
  cli/
    index.ts             → createCli() registers all Commander sub-commands
    commands/*.ts         → One file per CLI command (init, list, get, push, deploy, etc.)
  mcp/
    server.ts            → MCP server startup (stdio transport)
    tools.ts             → registerTools: ahub_list, ahub_get, ahub_search, ahub_deploy, ahub_push, ahub_health
tests/
  core/*.test.ts         → Unit tests for core modules
  storage/*.test.ts      → Storage factory tests
  fixtures/              → Sample SKILL.md for tests
  mcp/mcp-e2e.mjs        → MCP end-to-end smoke test
```

### Key Patterns

- **Provider pattern**: `StorageProvider` interface with `GitProvider` and `DriveProvider` implementations, selected by `createProvider(config)` factory.
- **Deployer pattern**: Same factory approach with `Deployer` interface and three targets, lazy-imported via `createDeployer(target)`.
- **Skill format**: Each skill is a directory with a `SKILL.md` (YAML frontmatter parsed by `gray-matter`) plus optional `agents/`, `scripts/`, `references/` subdirectories.
- **Config at `~/.ahub/config.json`**: Stores active provider (`git` | `drive`) and provider-specific settings.
- **Cache at `~/.ahub/cache/`**: Per-skill directories with `index.json` for freshness (1h default TTL).
- **Path safety**: All skill names and file paths are validated by `sanitize.ts` before any filesystem operation (prevents traversal).
- **ESM throughout**: `"type": "module"` in package.json, all imports use `.js` extensions, `NodeNext` module resolution.

### TypeScript Configuration

- Target: ES2022, Module: NodeNext, strict mode enabled
- Build config (`tsconfig.build.json`) extends `tsconfig.json` and excludes tests
- Tests use vitest with `globals: true` and node environment

### Dependencies

- **commander**: CLI framework
- **gray-matter**: YAML frontmatter parsing for SKILL.md files
- **simple-git**: Git operations for GitProvider
- **googleapis**: Google Drive API for DriveProvider (lazy-imported)
- **@modelcontextprotocol/sdk**: MCP server implementation
- **zod**: Schema validation for MCP tool parameters
- **inquirer, chalk, ora**: CLI UX (prompts, colors, spinners)

## Spec-Driven Development

Specs comportamentais vivem em `docs/specs/`. Cada módulo core tem uma spec que documenta invariantes, contratos de interface e cenários Given/When/Then.

### Workflow para agentes

1. **Antes de modificar** um módulo → ler `docs/specs/{module}.md`
2. **Ao alterar comportamento** → atualizar a spec E rodar `npx vitest tests/specs/`
3. **Ao criar novo módulo** → copiar `docs/specs/_TEMPLATE.md` e preencher
4. **Testes de caracterização** (`tests/specs/*.spec.ts`) validam contratos da spec
   - Diferentes de `.test.ts` unitários: focam em comportamento observável
   - Rodar antes e depois de mudanças: `npx vitest tests/specs/`

### Referências

- Template: `docs/specs/_TEMPLATE.md`
- Índice: `docs/specs/README.md`
- Specs existentes: core-skill, core-config, core-workspace, core-sync, core-cache, storage-provider, deploy-deployer, api-rest
