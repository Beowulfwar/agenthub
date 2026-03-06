# workspace-management

> Spec comportamental — fluxo de produto para workspaces, sync profiles e diretorios reconhecidos por agentes.

## Proposito

Definir o comportamento do agent-hub como um gerenciador de conteudo reutilizavel entre projetos e agentes. O sistema centraliza skills, prompts e subagents em storage remoto (GitHub, Google Drive ou outros providers), permite registrar multiplos projetos locais como workspaces, e sincroniza o conteudo de cada projeto para diretorios reconhecidos por agentes como Codex, Claude Code e Cursor.

## Intencao de produto

1. O usuario pode ter multiplos projetos/workspaces registrados ao mesmo tempo.
2. Cada workspace representa um projeto local, nao um “perfil abstrato”.
3. Um projeto pode comecar vazio, sem skills locais, e receber skills depois via sync/download.
4. O arquivo `ahub.workspace.json` e um artefato interno de projeto: ele guarda o perfil de sync do projeto, nao e a origem das skills.
5. O sistema deve priorizar diretorios reconhecidos pelo proprio projeto ativo (por exemplo `.codex`, `.claude`, `.cursor`) para evitar misturar skills de projetos diferentes.
6. Configuracoes globais de `deployTargets` continuam validas e tem precedencia quando o usuario quer sobrescrever os caminhos padrao.

## Localizacao

- **UI**: `ui/src/pages/WorkspacePage.tsx`, `ui/src/components/workspace/WorkspaceForm.tsx`, `ui/src/components/workspace/WorkspaceSelector.tsx`, `ui/src/components/workspace/CreateWorkspaceDialog.tsx`
- **API**: `src/api/routes/workspace.ts`, `src/api/routes/sync.ts`, `src/api/routes/deploy.ts`
- **Core**: `src/core/config.ts`, `src/core/workspace.ts`, `src/core/sync.ts`

## Invariantes

1. Workspace e sempre um diretorio de projeto registrado pelo usuario.
2. O usuario pode alternar entre workspaces sem apagar os demais.
3. O projeto pode existir mesmo com `skills: []` ou sem skills locais detectadas.
4. `ahub.workspace.json` descreve o que sera sincronizado para o projeto; ele nao armazena os pacotes remotos em si.
5. A UI deve explicitar o diretorio do projeto e esconder o conceito de manifest como detalhe de implementacao, sempre que possivel.
6. Para cada target suportado, a UI deve mostrar o diretorio reconhecido que sera usado pelo sync.
7. Precedencia de diretorio de deploy por target:
   - `config.deployTargets[target]`
   - raiz local do workspace ativo (ex.: `project/.codex`)
   - padrao nativo da ferramenta quando nao houver workspace selecionado

## Comportamentos (Given/When/Then)

### Cenario: Registrar varios projetos

- **Given**: O usuario registra `/repos/app-a`, `/repos/app-b` e `/repos/app-c`
- **When**: Abre o seletor de workspace
- **Then**: Os 3 projetos aparecem como workspaces independentes, com um ativo por vez

### Cenario: Projeto novo sem skills locais

- **Given**: O usuario registra um projeto recem-clonado sem `.skills`, `.codex`, `.claude` ou `.cursor`
- **When**: Abre a tela `/workspace`
- **Then**: A tela continua valida, mostra os diretorios reconhecidos que serao criados no primeiro sync e permite salvar um profile vazio

### Cenario: Sync por projeto

- **Given**: O projeto ativo e `/repos/app-a`
- **When**: O usuario executa sync para target `codex`
- **Then**: Os arquivos sao enviados preferencialmente para `/repos/app-a/.codex/...` (ou override global), sem misturar com outro projeto

### Cenario: Override global

- **Given**: Existe `config.deployTargets.codex = "/custom/codex"`
- **When**: O usuario abre a tela do workspace ou executa sync
- **Then**: O target `codex` usa `/custom/codex` como raiz e a UI mostra a origem como `Global override`

## Decisoes de Design

| Decisao | Motivo |
|---------|--------|
| Workspace = projeto local | O usuario pensa em projetos, nao em manifests |
| `ahub.workspace.json` continua existindo | Mantem rastreabilidade e reabertura consistente do projeto |
| Diretorios por agente visiveis na UI | Garante que o usuario entenda onde Codex/Claude/Cursor vao ler os arquivos |
| Paths locais por workspace como padrao | Evita misturar skills de projetos diferentes no mesmo diretorio global |

## Changelog

| Data | Mudanca |
|------|---------|
| 2026-03-06 | Spec criada para formalizar workspaces multi-projeto e diretorios reconhecidos por agente |
