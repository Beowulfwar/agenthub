# skills-catalog

> Spec comportamental — hub operacional de conteudos exibido na rota `/skills`.

## Proposito

Definir `/skills` como alias de produto para o hub principal de conteudos. A tela continua na mesma rota, mas agora opera `skill`, `prompt` e `subagent` como entidades de primeira classe, mantendo `rules` locais em uma secao separada por workspace.

## Localizacao

- **UI**: `ui/src/pages/SkillsPage.tsx`, `ui/src/pages/SkillDetailPage.tsx`, `ui/src/components/deploy/DeployDialog.tsx`
- **Hooks**: `ui/src/hooks/useSkills.ts`
- **API consumida**: `src/api/routes/skills.ts`
- **Core**: `src/core/skills-hub.ts`, `src/core/workspace.ts`, `src/core/local-rules.ts`

## Invariantes

1. `/skills` usa `GET /api/skills/hub` como shell de leitura e `GET /api/skills/hub/workspace` para expandir workspaces sob demanda.
2. A identidade de selecao no hub e `contentId = type/name`; a UI nao depende mais de `name` puro.
3. A secao `Nuvem` lista conteudos globais unicos, com filtro por tipo.
4. Cada workspace expandido separa `Contents` (cloud-backed) e `Rules` (inventario local por app).
5. `Contents` continuam agrupados por agente (`Codex`, `Claude Code`, `Cursor`) com estados `synced`, `cloud_only`, `local_only`, `diverged`, `missing_in_provider`.
6. `Rules` nunca executam acoes cloud; mostram apenas inventario local, `source = projected|local` e suporte de escrita do app.
7. Regras projetadas de `Cursor` podem coexistir com a secao de conteudos; elas aparecem em `Rules` para auditoria local, nao para substituir o hub cloud-backed.
8. Download, upload, copia, movimento e diff passam `contents[]` para a API, preservando alias legados apenas por compatibilidade.
9. A rota de detalhe canonica e `/skills/:type/:name`, com `/skills/:name` mantida como alias legado de `skill`.
10. O workspace form salva manifesto em `version: 2` com `contents[]`, sem apagar `prompts` e `subagents`.

## Comportamentos

### Cenario: Filtrar por tipo na nuvem

- **Given**: O provider contem `skill/review`, `prompt/review` e `subagent/review`
- **When**: O usuario filtra `Tipo = prompt`
- **Then**: A lista de `Nuvem` mostra apenas `prompt/review`

### Cenario: Selecionar dois conteudos com mesmo slug

- **Given**: Existem `skill/review` e `prompt/review`
- **When**: O usuario seleciona ambos na secao `Nuvem`
- **Then**: As acoes em lote preservam as duas identidades sem colisao de checkbox, diff ou download

### Cenario: Expandir um workspace

- **Given**: Existe um workspace registrado com inventario local
- **When**: O usuario expande esse workspace
- **Then**: A UI renderiza blocos por agente em `Contents` e uma secao adicional `Rules locais por app`

### Cenario: Editar rule local do Cursor

- **Given**: O workspace possui uma rule em `.cursor/rules/review.md`
- **When**: O usuario usa `Editar` na secao `Rules`
- **Then**: A UI abre um editor local, salva o arquivo no workspace e recarrega o detalhe sem tocar na nuvem

### Cenario: App detect-only continua leitura

- **Given**: O workspace possui rules detectadas para `Windsurf` ou `Continue`
- **When**: O usuario expande a secao `Rules`
- **Then**: As rules aparecem com status de inventario, mas sem botoes de edicao/remocao

### Cenario: Abrir detalhe tipado

- **Given**: O usuario clica em `prompt/review` na secao `Nuvem`
- **When**: A UI navega para o detalhe
- **Then**: A rota aberta e `/skills/prompt/review`, e clone/rename/delete continuam operando sobre essa identidade tipada

## Decisoes de Design

| Decisao | Motivo |
|---------|--------|
| Manter a rota `/skills` | Preserva descoberta do produto enquanto o vocabulário migra para “conteudos” |
| Selecao por `contentId` | Resolve o problema real de colisao entre tipos diferentes com o mesmo slug |
| `Rules` em secao separada | Torna visivel o estado local por workspace sem misturar regra local com catalogo cloud-backed |
| CRUD local inicial so para Cursor | Fecha o caso principal com layout oficial conhecido |

## Referencias de codigo

- `src/core/skills-hub.ts`
- `src/core/local-rules.ts`
- `src/api/routes/skills.ts`
- `ui/src/pages/SkillsPage.tsx`
- `ui/src/pages/SkillDetailPage.tsx`
- `ui/src/components/workspace/WorkspaceForm.tsx`
- `tests/core/skills-hub.test.ts`
- `tests/core/workspace.test.ts`

## Changelog

| Data | Mudanca |
|------|---------|
| 2026-03-06 | Spec criada para o hub operacional na rota `/skills` |
| 2026-03-07 | Atualizada para o modelo cloud-first com instalacao em lote |
| 2026-03-07 | Reescrita para o hub de conteudos com identidade `type/name`, detalhe tipado e rules locais por workspace |
