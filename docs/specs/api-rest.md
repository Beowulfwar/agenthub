# api-rest

> Spec comportamental — contrato vivo da API HTTP do agent-hub.

## Proposito

Documentar o contrato observavel da API REST servida por Hono. A API passa a ser `content-first`: o identificador canonico e `type + name`, a nuvem usa `/api/content*` como superficie principal, `/api/skills*` continua como alias para `type='skill'`, e `rules` locais por workspace aparecem apenas no detalhe do hub.

## Localizacao

- **Codigo**: `src/api/server.ts`, `src/api/router.ts`, `src/api/routes/*.ts`
- **Core**: `src/core/skills-hub.ts`, `src/core/workspace.ts`, `src/core/workspace-catalog.ts`, `src/core/local-rules.ts`
- **Testes de caracterizacao**: `tests/specs/*.spec.ts`

## Invariantes

1. Toda resposta de sucesso usa envelope `{ data: T }`.
2. Toda resposta de erro usa envelope `{ error: { code, message } }`.
3. `/api/content` e a superficie canonica para listagem e CRUD de conteudos tipados.
4. `/api/skills` continua disponivel como alias legada para `type='skill'`.
5. `GET /api/skills/hub` devolve a shell do hub com secao `Nuvem` e resumo de `Workspaces`.
6. `GET /api/skills/hub/workspace` devolve `agents[]` para conteudos cloud-backed e `rules[]` para inventario local por app.
7. Acoes do hub (`download`, `upload`, `transfer`) aceitam `contents: Array<{ type, name }>`; `skills: string[]` continua aceito como alias legado.
8. `GET /api/skills/hub/diff` aceita `type` opcional e compara a identidade canonica informada.
9. `rules` locais nao entram no provider nem no manifesto cloud-backed.
10. Apenas `cursor` suporta CRUD local de rules na primeira fase; apps detect-only permanecem leitura/inventario.

## Comportamentos

### Cenario: Listar conteudos canonicamente

- **Given**: O provider contem `skill/review`, `prompt/review` e `subagent/review`
- **When**: `GET /api/content`
- **Then**: A resposta inclui `["skill/review", "prompt/review", "subagent/review"]`

### Cenario: Alias legado continua funcionando

- **Given**: O provider contem `skill/review`
- **When**: `GET /api/skills`
- **Then**: A resposta continua filtrando implicitamente para `type='skill'`

### Cenario: Expandir workspace no hub

- **Given**: Existe um workspace com conteudos locais em `codex`, `claude-code` e rules em `.cursor/rules`
- **When**: `GET /api/skills/hub/workspace?filePath=/projeto/app/ahub.workspace.json`
- **Then**: A resposta inclui `agents[]` com estados unificados por conteudo e `rules[]` agrupadas por app

### Cenario: Comparar conteudo tipado

- **Given**: Um `prompt/review` local diverge da nuvem
- **When**: `GET /api/skills/hub/diff?filePath=/projeto/app/ahub.workspace.json&target=codex&name=review&type=prompt`
- **Then**: A resposta inclui `contentId`, `type`, `local`, `cloud`, `status`, `canUpload` e `canDownload`

### Cenario: Baixar pelo hub usando payload canonico

- **Given**: O body contem `{ filePath, target: "codex", contents: [{ "type": "prompt", "name": "review" }] }`
- **When**: `POST /api/skills/hub/actions/download`
- **Then**: A API baixa `prompt/review`, faz deploy local e atualiza o manifesto com `contents[]`

### Cenario: Editar rule local de cursor

- **Given**: Existe uma rule local em `.cursor/rules/review.md`
- **When**: `PUT /api/skills/hub/rules/local` com `{ filePath, appId: "cursor", name: "review", content }`
- **Then**: A API grava o arquivo no workspace e nao toca no provider

## Endpoints principais

| Metodo | Rota | Descricao | Sucesso | Erro |
|--------|------|-----------|---------|------|
| GET | `/api/content?q=&type=&detailed=` | Listar conteudos do provider | `{ data: string[] \| SkillSummary[] }` | — |
| GET | `/api/content/:type/:name` | Obter `SkillPackage` completo por identidade canonica | `{ data: SkillPackage }` | 400, 404 |
| GET | `/api/content/:type/:name/info` | Estatisticas e metadata do conteudo | `{ data: SkillInfo }` | 400, 404 |
| PUT | `/api/content/:type/:name` | Criar ou atualizar conteudo | `{ data: { name, type } }` | 400, 404 |
| PATCH | `/api/content/:type/:name` | Atualizacao parcial | `{ data: { name, type } }` | 400, 404 |
| DELETE | `/api/content/:type/:name` | Remover conteudo | `{ data: { deleted } }` | 400, 404 |
| GET | `/api/skills` | Alias legado de listagem para `type='skill'` | `{ data: string[] \| SkillSummary[] }` | — |
| GET | `/api/skills/hub` | Shell do hub operacional | `{ data: SkillsHubShell }` | — |
| GET | `/api/skills/hub/workspace?filePath=` | Detalhe do workspace com `agents[]` e `rules[]` | `{ data: SkillsHubWorkspaceDetail }` | 400 |
| GET | `/api/skills/hub/diff?filePath=&target=&name=&type=` | Preview local vs nuvem | `{ data: SkillsHubDiffResult }` | 400 |
| POST | `/api/skills/hub/actions/download` | Baixar da nuvem para `workspace + agente` | `{ data: SkillsHubActionResult }` | 400 |
| POST | `/api/skills/hub/actions/upload` | Subir versao local para a nuvem | `{ data: SkillsHubActionResult }` | 400 |
| POST | `/api/skills/hub/actions/transfer` | Copiar ou mover conteudo entre workspaces | `{ data: SkillsHubActionResult }` | 400 |
| GET | `/api/skills/hub/rules/content?filePath=&appId=&name=&detectedPath=` | Ler o conteudo de uma rule local | `{ data: { path, content } }` | 400 |
| PUT | `/api/skills/hub/rules/local` | Criar/atualizar rule local suportada | `{ data: { path, created } }` | 400 |
| DELETE | `/api/skills/hub/rules/local` | Remover rule local suportada | `{ data: { path } }` | 400 |

## Efeitos Colaterais

- Rotas `/api/content/*` alteram somente o provider configurado.
- Rotas do hub alteram disco local do workspace e manifesto quando a operacao e cloud-backed.
- Rotas `/api/skills/hub/rules/*` alteram apenas arquivos locais do workspace; nao escrevem no provider nem no manifesto.

## Decisoes de Design

| Decisao | Justificativa |
|---------|---------------|
| `/api/content*` como superficie canonica | Elimina ambiguidade entre `skill`, `prompt` e `subagent` com mesmo slug |
| `/api/skills*` mantido como alias | Permite migracao gradual de UI, scripts e integrações existentes |
| `rules` fora do provider | Cada workspace pode divergir livremente em regras locais sem poluir o catalogo cloud |
| CRUD local inicial so para Cursor | Fecha o caso de uso principal sem fingir suporte oficial de escrita para apps detect-only |

## Changelog

| Data | Mudanca |
|------|---------|
| 2025-03-05 | Spec criada |
| 2026-03-07 | Atualizada para o hub operacional de skills |
| 2026-03-07 | Reescrita para o modelo `content-first`, rotas canônicas `/api/content*`, payload `contents[]` e rules locais por workspace |
