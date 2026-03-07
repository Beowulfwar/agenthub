# agent-hub

CLI + MCP Server para gerenciamento centralizado de skills, prompts e tarefas de agentes AI.

Suporta **Git** e **Google Drive** como backends de armazenamento, permitindo sync entre ambientes e deploy para diferentes ferramentas (Claude Code, Codex, Cursor).

## Quick Start

```bash
# Instalar globalmente
npm install -g agent-hub

# Configurar com Git
ahub init --provider git --repo https://github.com/user/my-skills.git

# Configurar com Google Drive
ahub init --provider drive

# Listar skills
ahub list

# Baixar uma skill
ahub get fiscal-nfe-hub

# Deploy para Claude Code
ahub deploy fiscal-nfe-hub --target claude-code

# Deploy de todas as skills
ahub deploy --all --target claude-code
```

## Comandos

| Comando | Descricao |
|---------|-----------|
| `ahub init` | Configurar backend (git ou drive) |
| `ahub list` | Listar skills disponveis |
| `ahub search <query>` | Buscar por nome/descricao |
| `ahub get <name>` | Baixar skill para cache local |
| `ahub push <path>` | Enviar skill local para o storage |
| `ahub deploy <name> --target <t>` | Instalar skill no agente |
| `ahub deploy --all --target <t>` | Instalar todas as skills |
| `ahub import <path>` | Importar skill de pasta ou zip |
| `ahub export <name>` | Exportar skill como pasta ou zip |
| `ahub migrate --to <provider>` | Migrar entre Git e Drive |
| `ahub config set/get` | Configurar opcoes |
| `ahub health` | Verificar conectividade |
| `ahub mcp` | Iniciar servidor MCP |

## Deploy Targets

| Target | Destino | Formato |
|--------|---------|---------|
| `claude-code` | `~/.claude/commands/<name>.md` | SKILL.md completo |
| `codex` | `~/.codex/skills/<name>/` | Pasta completa |
| `cursor` | `.cursor/rules/<name>.md` | Body sem frontmatter |

## MCP Server

Para usar como MCP Server no Claude Code, adicione ao `settings.json`:

```json
{
  "mcpServers": {
    "agent-hub": {
      "command": "ahub",
      "args": ["mcp"]
    }
  }
}
```

Tools disponveis: `ahub_list`, `ahub_get`, `ahub_search`, `ahub_deploy`, `ahub_push`, `ahub_health`.

## Migracao entre Providers

```bash
# De Git para Google Drive
ahub migrate --to drive

# De Google Drive para Git
ahub migrate --to git --repo https://github.com/user/skills.git
```

## Formato de Skill

Cada skill segue o padrao:

```
skill-name/
  SKILL.md          # Prompt principal (YAML frontmatter + markdown)
  agents/           # Opcional: metadata de agente (openai.yaml)
  scripts/          # Opcional: scripts auxiliares
  references/       # Opcional: documentacao de apoio
```

Formato do `SKILL.md`:

```yaml
---
name: "skill-name"
description: "Descricao da skill"
---

# Titulo

Conteudo markdown da skill...
```

## Estrutura do Projeto

```
agent-hub/
  bin/ahub.ts           # CLI entrypoint
  src/
    core/               # Types, config, skill parser, cache
    storage/            # StorageProvider interface + Git/Drive
    cli/commands/       # Comandos CLI
    mcp/                # MCP Server
    deploy/             # Deployers (claude-code, codex, cursor)
```

## Desenvolvimento

```bash
npm install
npm run dev -- list          # Rodar em modo dev
npm run dev:stack            # Subir backend + frontend da UI
npm run build                # Build TypeScript
npm test                     # Rodar testes
```

O script `npm run dev:stack` usa `scripts/dev-stack.sh` e faz restart limpo do ambiente local:

- sobe a API em `3737` e a UI em `5173` por padrao
- backend roda em watch e recarrega automaticamente ao salvar alteracoes locais
- detecta portas ocupadas, encerra o processo anterior e reinicia os servicos
- em ambientes WSL, usa um `TMPDIR` local para evitar falhas do `tsx` em paths montados
- ao fechar com `Ctrl+C`, tenta encerrar os dois processos iniciados pelo script

Tambem aceita sobrescrever as portas e o host da UI:

```bash
BACKEND_PORT=3738 FRONTEND_PORT=5174 FRONTEND_HOST=127.0.0.1 npm run dev:stack
```

## Documentation

- **Specs**: `docs/specs/` — Behavioral specs for each module (Given/When/Then format)
- **Spec Index**: `docs/specs/README.md` — Master index with links
- **Template**: `docs/specs/_TEMPLATE.md` — Template for new specs
- **CLAUDE.md**: Developer guidance for AI agents

## Licenca

MIT
