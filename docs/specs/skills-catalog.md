# skills-catalog

> Spec comportamental — hub operacional de skills exibido na tela `/skills`.

## Proposito

Definir `/skills` como a superficie principal para operar skills entre nuvem e workspaces locais. A tela parte da divisao explicita entre `Nuvem` e `Workspaces`, mostra cada workspace por agente e oferece as acoes gerenciadas de baixar, subir, copiar, mover e comparar.

## Localizacao

- **UI**: `ui/src/pages/SkillsPage.tsx`, `ui/src/pages/SkillDetailPage.tsx`, `ui/src/components/deploy/DeployDialog.tsx`
- **Hooks**: `ui/src/hooks/useSkills.ts`
- **API consumida**: `src/api/routes/skills.ts`
- **Core**: `src/core/skills-hub.ts`, `src/core/workspace.ts`

## Invariantes

1. `/skills` usa `GET /api/skills/hub` como shell de leitura e `GET /api/skills/hub/workspace` para expandir cada workspace sob demanda.
2. A tela sempre separa `Nuvem` e `Workspaces`; quando recolhidos, apenas os cabecalhos dessas secoes ficam visiveis.
3. `Nuvem` lista cada skill global uma unica vez, porque o provider continua sendo a autoridade de nomes.
4. Cada workspace expandido agrupa o inventario local por agente (`Codex`, `Claude Code`, `Cursor`), sem misturar agentes no mesmo bloco.
5. O estado unificado das skills no hub e um dentre: `synced`, `cloud_only`, `local_only`, `diverged`, `missing_in_provider`.
6. O estado da skill nao substitui a informacao de manifesto; a UI continua exibindo separadamente se a skill esta ou nao vinculada ao manifesto do workspace.
7. `Baixar` sempre significa `nuvem -> workspace + agente`, com atualizacao do manifesto e deploy imediato.
8. `Subir` sempre significa `workspace + agente -> nuvem`; se a skill estiver `diverged`, a UI exige comparacao e confirmacao antes de sobrescrever.
9. `Copiar` preserva a origem e adiciona a skill ao destino; `Mover` faz `Copiar` e depois remove o target da origem com `undeploy`.
10. `/skills/:name` continua representando a definicao global da skill, mas o CTA principal passa a ser “Baixar para workspace”.

## Comportamentos (Given/When/Then)

### Cenario: Abrir o hub recolhido

- **Given**: Existem skills no provider e workspaces registrados
- **When**: O usuario abre `/skills`
- **Then**: A pagina mostra um cabecalho para `Nuvem` e um cabecalho para cada workspace, sem cards de skill visiveis enquanto os blocos estiverem recolhidos

### Cenario: Expandir a nuvem

- **Given**: O provider contem skills disponiveis
- **When**: O usuario expande a secao `Nuvem`
- **Then**: A lista mostra skills globais unicas, com busca/filtro por tipo e acao `Baixar para...`

### Cenario: Expandir um workspace

- **Given**: Existe um workspace registrado com inventario local
- **When**: O usuario expande esse workspace
- **Then**: A UI carrega sob demanda o detalhe do workspace e renderiza um painel separado por agente, cada um com contadores e lista de skills

### Cenario: Baixar da nuvem para um destino

- **Given**: O usuario escolheu uma ou mais skills da nuvem e um `workspace + agente`
- **When**: Confirma a operacao `Baixar`
- **Then**: A skill e adicionada ao manifesto do workspace, baixada do provider e escrita no diretorio local do agente

### Cenario: Comparar uma skill divergente

- **Given**: Uma skill local difere da versao da nuvem
- **When**: O usuario clica em `Comparar`
- **Then**: A UI abre um modal com preview lado a lado de `Local` e `Nuvem`, sem sobrescrever nada automaticamente

### Cenario: Confirmar upload apos comparacao

- **Given**: O modal de comparacao foi aberto para uma skill `diverged`
- **When**: O usuario confirma `Subir para nuvem`
- **Then**: A API usa a versao local canonicalizada e envia ao provider com `force=true`, registrando warning quando a origem local for lossless/lossy

### Cenario: Mover skill entre workspaces

- **Given**: Uma skill local existe em `workspace A + agente X`
- **When**: O usuario escolhe `Mover para...` e confirma um `workspace B + agente Y`
- **Then**: A skill e escrita no destino, o manifesto do destino recebe o novo target, e a origem e removida do manifesto com `undeploy`

## Decisoes de Design

| Decisao | Motivo |
|---------|--------|
| `/skills` como hub operacional | Reduz a ida e volta entre catalogo cloud-first e diagnostico local |
| Accordion multi-expand | Mantem a tela limpa quando recolhida e permite trabalhar em varios workspaces ao mesmo tempo |
| Comparacao obrigatoria para `diverged` | Impede sobrescrita silenciosa entre disco local e provider |
| Selecao + envio no primeiro corte | E mais clara e acessivel do que drag-and-drop para operacoes potencialmente destrutivas |
| Read model proprio para `/skills` | Evita reconstruir no frontend a relacao entre provider, manifesto, disco e formato de cada agente |

## Referencias de codigo

- `src/core/skills-hub.ts`
- `src/core/workspace.ts`
- `src/api/routes/skills.ts`
- `ui/src/pages/SkillsPage.tsx`
- `ui/src/pages/SkillDetailPage.tsx`
- `tests/core/skills-hub.test.ts`
- `tests/core/workspace.test.ts`

## Changelog

| Data | Mudanca |
|------|---------|
| 2026-03-06 | Spec criada para documentar o agrupamento de skills por workspace na tela `/skills` |
| 2026-03-07 | Reescrita para o modelo cloud-first com itens unicos, destino explicito `workspace + agente` e instalacao em lote |
| 2026-03-07 | Atualizada para o modelo de hub operacional com secoes `Nuvem` e `Workspaces`, comparacao obrigatoria de divergencia e acoes gerenciadas de download/upload/transfer |
