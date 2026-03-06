# deploy-deployer

> Spec comportamental — contrato vivo para agentes e desenvolvedores.

## Proposito

Contrato para todos os alvos de deploy (`Deployer`) e factory assincrona que instancia o deployer correto usando import dinamico (`createDeployer`). Cada deployer sabe instalar (deploy) e remover (undeploy) uma skill no ambiente alvo — Claude Code, Codex ou Cursor — cada um com seu proprio formato de arquivo e diretorio padrao.

## Localizacao

- **Codigo**: `src/deploy/deployer.ts` (interface + factory), `src/deploy/claude-code.ts`, `src/deploy/codex.ts`, `src/deploy/cursor.ts`
- **Testes unitarios**: `tests/deploy/deployer.test.ts`
- **Testes de caracterizacao**: `tests/specs/deploy-deployer.spec.ts`

## Invariantes

1. A factory usa `import()` dinamico (lazy import) — so carrega o codigo do deployer que sera usado, nunca importa todos os tres deployers de uma vez
2. `createDeployer()` e `async` porque usa `import()` dinamico
3. `deploy()` sempre retorna o caminho absoluto onde a skill foi escrita no disco
4. `customPath` sobrescreve o diretorio padrao quando fornecido ao construtor; ele pode apontar para a raiz do agente (ex.: `/repo/.codex`) ou para um subdiretorio especifico por tipo (ex.: `/repo/.codex/skills`)
5. Todo deployer valida o nome da skill com `assertSafeSkillName()` antes de qualquer operacao de escrita (prevencao de path traversal)
6. `undeploy()` e idempotente: se o arquivo/diretorio nao existe, retorna silenciosamente sem erro
7. Cada deployer produz formato diferente: claude-code escreve `.md` com body, codex copia diretorio completo, cursor escreve `.md` com body
8. Target desconhecido na factory lanca `Error` generico (nao `AhubError`)

## Comportamentos (Given/When/Then)

### Factory cria ClaudeCodeDeployer com import lazy

- **Given**: `target === 'claude-code'` e `customPath` nao fornecido
- **When**: `await createDeployer(target)`
- **Then**: Importa dinamicamente `./claude-code.js`, retorna `ClaudeCodeDeployer` com `deployer.target === 'claude-code'` e basePath `~/.claude/commands`

### Factory cria CodexDeployer com caminho customizado

- **Given**: `target === 'codex'` e `customPath === '/custom/path/skills'`
- **When**: `await createDeployer(target, customPath)`
- **Then**: Importa dinamicamente `./codex.js`, retorna `CodexDeployer` com basePath `/custom/path/skills`

### Factory aceita raiz de workspace para target

- **Given**: `target === 'codex'` e `customPath === '/repo/app/.codex'`
- **When**: `await createDeployer(target, customPath)` seguido de `deploy(pkg)` para `type === 'skill'`
- **Then**: O deploy acontece em `/repo/app/.codex/skills/<name>/`

### Factory cria CursorDeployer com cwd como base

- **Given**: `target === 'cursor'` e `customPath` nao fornecido
- **When**: `await createDeployer(target)`
- **Then**: Importa dinamicamente `./cursor.js`, retorna `CursorDeployer` com basePath `<cwd>/.cursor/rules`

### Factory rejeita target desconhecido

- **Given**: `target === 'vscode'` (valor invalido)
- **When**: `await createDeployer(target)`
- **Then**: Lanca `Error` com mensagem `"Unknown deploy target: vscode"`

### ClaudeCodeDeployer escreve body sem frontmatter

- **Given**: `SkillPackage` com `skill.name === 'fiscal-nfe'` e `skill.body` contendo instrucoes Markdown
- **When**: `deployer.deploy(pkg)`
- **Then**: Cria `~/.claude/commands/` se nao existir, escreve `fiscal-nfe.md` com conteudo `skill.body + '\n'` (sem YAML frontmatter), retorna caminho absoluto

### CodexDeployer copia diretorio completo do pacote

- **Given**: `SkillPackage` com `skill.name === 'performance-sql'` e files `[SKILL.md, agents/config.yaml, scripts/run.sh]`
- **When**: `deployer.deploy(pkg)`
- **Then**: Remove diretorio existente `~/.codex/skills/performance-sql/` (clean deploy), cria diretorio e escreve cada arquivo respeitando subpastas, valida cada `relativePath` com `assertSafeRelativePath()`, retorna caminho absoluto do diretorio

### undeploy() e idempotente quando skill nao existe

- **Given**: Nenhuma skill `'inexistente'` foi deployada no alvo
- **When**: `deployer.undeploy('inexistente')`
- **Then**: Retorna sem erro, nao lanca excecao

## Contratos de Interface

### Funcoes Publicas

| Funcao | Input | Output | Throws |
|--------|-------|--------|--------|
| `createDeployer(target, customPath?)` | `DeployTarget, string?` | `Promise<Deployer>` | `Error` (target desconhecido) |

### Interface Deployer

| Metodo | Input | Output | Throws |
|--------|-------|--------|--------|
| `deploy(pkg)` | `SkillPackage` | `Promise<string>` (caminho absoluto) | — |
| `undeploy(name)` | `string` | `Promise<void>` | — |

### Tipos Exportados

- `Deployer` — interface do contrato de deploy
- `DeployTarget` — `'claude-code' | 'codex' | 'cursor'`

### Caminhos Padrao

| Target | Caminho Padrao | Formato |
|--------|---------------|---------|
| `claude-code` | `~/.claude/commands/<name>.md` | Body Markdown (sem frontmatter) |
| `codex` | `~/.codex/skills/<name>/` | Diretorio completo (todos os arquivos) |
| `cursor` | `<cwd>/.cursor/rules/<name>.md` | Body Markdown (sem frontmatter) |

## Dependencias

- **Usa**: `node:fs/promises` (`mkdir`, `writeFile`, `rm`, `access`), `node:path`, `node:os` (`homedir`), `core/sanitize.ts` (`assertSafeSkillName`, `assertSafeRelativePath`), `core/types.ts` (`DeployTarget`, `SkillPackage`)
- **Usado por**: `src/cli/commands/deploy.ts`, `src/mcp/tools.ts`, `src/api/routes/deploy.ts`, `src/core/sync.ts`

## Efeitos Colaterais

- `ClaudeCodeDeployer.deploy()`: Cria diretorio `~/.claude/commands/` se nao existir; escreve arquivo `.md`
- `ClaudeCodeDeployer.undeploy()`: Remove arquivo `.md` do disco
- `CodexDeployer.deploy()`: Remove diretorio existente da skill (clean deploy); cria diretorio e todos os arquivos
- `CodexDeployer.undeploy()`: Remove diretorio recursivamente (`rm -rf`)
- `CursorDeployer.deploy()`: Cria diretorio `.cursor/rules/` no cwd se nao existir; escreve arquivo `.md`
- `CursorDeployer.undeploy()`: Remove arquivo `.md` do disco

## Decisoes de Design

| Decisao | Justificativa |
|---------|---------------|
| Lazy import via `import()` dinamico | Cada deployer so e carregado quando necessario; quem usa `claude-code` nunca carrega `codex` |
| Factory assincrona | `createDeployer()` e `async` por causa do `import()` dinamico, diferente da factory de StorageProvider |
| CodexDeployer faz clean deploy | Remove diretorio inteiro antes de escrever; evita arquivos orfaos de versoes anteriores |
| CodexDeployer valida cada relativePath | Alem do nome da skill, valida caminho relativo dos arquivos com `assertSafeRelativePath()` |
| CursorDeployer usa cwd (nao home) | Cursor trabalha com regras locais ao projeto; basePath padrao e `process.cwd()/.cursor/rules/` |
| undeploy() nao lanca erro se skill nao existe | Verifica existencia antes de remover e retorna silenciosamente; torna operacao idempotente e segura |
| Factory nao usa exhaustive switch | Usa `default: throw new Error(...)` simples; `DeployTarget` e consumido em mais contextos |

## Changelog

| Data | Mudanca |
|------|---------|
| 2025-03-05 | Spec criada |
| 2026-03-06 | Documentado suporte a `customPath` como raiz do agente/workspace, nao apenas subdiretorio final |
