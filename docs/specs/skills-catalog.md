# skills-catalog

> Spec comportamental — catalogo global de skills da nuvem exibido na tela `/skills`.

## Proposito

Definir `/skills` como a superficie principal de descoberta e instalacao de skills. A tela sempre parte do inventario unico do provider e usa `workspace + agente` apenas como contexto de destino e de estado de instalacao.

## Localizacao

- **UI**: `ui/src/pages/SkillsPage.tsx`, `ui/src/pages/SkillDetailPage.tsx`, `ui/src/components/deploy/DeployDialog.tsx`
- **Hooks**: `ui/src/hooks/useSkills.ts`, `ui/src/hooks/useDeploy.ts`
- **API consumida**: `src/api/routes/skills.ts`, `src/api/routes/deploy.ts`
- **Core**: `src/core/workspace-catalog.ts`

## Invariantes

1. A tela `/skills` usa `GET /api/skills/catalog` como fonte de verdade; ela nao reconstrui agrupamentos por workspace no frontend.
2. Cada skill da nuvem aparece uma unica vez no catalogo, porque o provider e a autoridade global para nomes.
3. Selecionar `workspace` e `agente` nao duplica itens; apenas resolve o `installState` de cada skill para aquele destino.
4. Sem `workspace + agente`, o `installState` e `unknown`, os checkboxes ficam desabilitados e nao ha instalacao em lote.
5. Os filtros globais da tela sao `texto`, `tipo`, `categoria` e `tag`.
6. Os filtros de destino da tela sao `workspace`, `agente` e `estado no destino`.
7. `POST /api/deploy` para a UI de skills sempre envia `workspaceFilePath` e `target` explicitos.
8. Drift local, skills fora do manifesto e problemas de inventario local nao sao exibidos em `/skills`; esses estados pertencem a `/workspace`.
9. A pagina `/skills/:name` continua representando a definicao global da skill; o CTA principal e instalar, nunca “atribuir automaticamente” a um workspace.

## Comportamentos (Given/When/Then)

### Cenario: Abrir o catalogo sem destino

- **Given**: Existem skills disponiveis no provider
- **When**: O usuario abre `/skills` sem escolher `workspace` nem `agente`
- **Then**: Cada skill aparece uma unica vez, a tela exibe apenas o catalogo global e a selecao em lote permanece desabilitada

### Cenario: Escolher destino explicito

- **Given**: O usuario escolheu um workspace e depois um agente
- **When**: O catalogo e recarregado
- **Then**: Cada card passa a mostrar `Instalada` ou `Nao instalada` apenas para aquele destino

### Cenario: Trocar workspace

- **Given**: O usuario ja havia escolhido skills e um agente
- **When**: Troca o workspace no seletor de destino
- **Then**: O agente e a selecao atual sao limpos antes de continuar

### Cenario: Filtrar por estado no destino

- **Given**: Existe um destino selecionado com algumas skills instaladas e outras nao
- **When**: O usuario escolhe o filtro `Instalada`
- **Then**: A lista mostra apenas as skills presentes naquele `workspace + agente`, mas as contagens de estado continuam refletindo o resultado base do destino

### Cenario: Instalar varias skills

- **Given**: O usuario escolheu `workspace + agente` e marcou varias skills
- **When**: Confirma a instalacao
- **Then**: O dialogo envia um lote unico para `POST /api/deploy` com `skills[]`, `workspaceFilePath` e `target`

### Cenario: Abrir detalhe global de uma skill

- **Given**: O usuario abre `/skills/fiscal-nfe`
- **When**: Clica em `Instalar`
- **Then**: O dialogo solicita ou reutiliza um destino explicito antes do deploy

## Decisoes de Design

| Decisao | Motivo |
|---------|--------|
| Catalogo cloud-first | Mantem nomes unicos e elimina repeticao artificial por workspace |
| Destino separado do inventario | Permite comparar “catalogo global” e “estado local” sem misturar conceitos |
| Instalacao em lote para um unico destino por vez | Reduz ambiguidade operacional e facilita feedback de sucesso/falha |
| Filtros globais independentes do workspace | A busca principal e sobre o catalogo da nuvem, nao sobre o disco local |
| Pagina de detalhe continua global | A skill deve ter uma unica definicao central, independentemente de quantos workspaces a usem |

## Changelog

| Data | Mudanca |
|------|---------|
| 2026-03-06 | Spec criada para documentar o agrupamento de skills por workspace na tela `/skills` |
| 2026-03-07 | Reescrita para o modelo cloud-first com itens unicos, destino explicito `workspace + agente` e instalacao em lote |
