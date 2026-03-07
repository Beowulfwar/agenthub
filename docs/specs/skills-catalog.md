# skills-catalog

> Spec comportamental — catalogo unificado de skills exibido na tela `/skills`.

## Proposito

Definir uma fonte unica e confiavel para a tela `/skills`. O catalogo deve unir inventario do provider, vinculacao por manifesto e observacao do filesystem local, deixando explicito o que esta configurado, o que foi detectado apenas no disco e onde existe drift por workspace.

## Localizacao

- **UI**: `ui/src/pages/SkillsPage.tsx`, `ui/src/components/skills/SearchBar.tsx`, `ui/src/components/deploy/DeployDialog.tsx`
- **Hooks**: `ui/src/hooks/useSkills.ts`
- **API consumida**: `src/api/routes/skills.ts`
- **Core**: `src/core/workspace-catalog.ts`, `src/core/explorer.ts`

## Invariantes

1. A tela `/skills` usa `GET /api/skills/catalog` como fonte de verdade; ela nao reconstrui agrupamentos localmente a partir de heuristicas soltas.
2. Cada secao de workspace mostra o estado combinado de cada skill em quatro situacoes: `Manifesto + local`, `So manifesto`, `So local` e `Fora do provider`.
3. `skills configuradas` significam skills declaradas no manifesto do workspace.
4. `skills detectadas localmente` significam skills encontradas em diretorios reconhecidos como `.skills`, `.codex/skills`, `.claude/skills` e equivalentes.
5. Deteccao local nao cria vinculacao oficial com o workspace; o vinculo oficial continua sendo o manifesto.
6. Skills presentes no provider e ausentes de todos os manifests aparecem em `Sem workspace`.
7. Workspaces com erro de leitura de manifesto nao entram nas secoes normais e precisam gerar aviso explicito.
8. A selecao para deploy continua sendo por nome de skill; quando uma skill aparece em mais de uma secao, a selecao reflete em todas as ocorrencias visiveis.
9. Skills fora do provider nao podem ser tratadas como deployaveis, mesmo quando aparecem por deteccao local ou referencia no manifesto.

## Comportamentos (Given/When/Then)

### Cenario: Exibir estado combinado por workspace

- **Given**: Existe um workspace registrado com manifesto valido e skills detectadas localmente
- **When**: O usuario abre `/skills`
- **Then**: A secao do workspace mostra contadores de `configuradas`, `detectadas localmente` e `drift`, alem do estado individual de cada skill

### Cenario: Skill so no manifesto

- **Given**: A skill `x` esta no manifesto, mas nao foi detectada nas pastas locais do workspace
- **When**: O usuario abre `/skills`
- **Then**: A skill aparece com status `So manifesto`

### Cenario: Skill so local

- **Given**: A skill `y` foi encontrada em `.skills` ou `.codex/skills`, mas nao esta no manifesto
- **When**: O usuario abre `/skills`
- **Then**: A skill aparece com status `So local`, caracterizando drift

### Cenario: Skill referenciada e ausente do provider

- **Given**: O manifesto referencia `skill-antiga`, mas ela nao existe mais no provider
- **When**: O usuario abre `/skills`
- **Then**: A skill aparece com status `Fora do provider` e nao deve ser tratada como deployavel

### Cenario: Filtrar por workspace

- **Given**: Existem skills distribuidas entre varios workspaces
- **When**: O usuario escolhe um workspace especifico no filtro da tela
- **Then**: Apenas a secao desse workspace permanece visivel, preservando os estados de drift

### Cenario: Workspace com manifesto invalido

- **Given**: Um workspace registrado nao pode ter o manifesto carregado
- **When**: O usuario abre `/skills`
- **Then**: A tela exibe um aviso separado com o erro e a quantidade de skills locais detectadas nesse workspace

## Decisoes de Design

| Decisao | Motivo |
|---------|--------|
| Catalogo unificado no backend | Evita que cada tela invente sua propria regra de reconhecimento de skill |
| Manifesto como verdade do vinculo | Mantem a relacao skill-workspace deterministica e editavel |
| Filesystem local como estado observado | Permite detectar drift sem transformar artefatos sincronizados em fonte canonica |
| Secao `Sem workspace` apenas para skills do provider | Evita esconder inventario ainda nao associado a projetos |
| Status explicitos por skill | Reduz ambiguidade sobre o que esta configurado, sincronizado ou faltando |

## Changelog

| Data | Mudanca |
|------|---------|
| 2026-03-06 | Spec criada para documentar o agrupamento de skills por workspace na tela `/skills` |
| 2026-03-06 | Atualizada para refletir o catalogo unificado provider + manifests + deteccao local, com estados de drift por skill e contadores separados de configuracao vs deteccao |
