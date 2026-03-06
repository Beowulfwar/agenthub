# workspace-management

> Spec comportamental — fluxo de produto para gerenciamento de multiplos workspaces e diretorios reconhecidos por agentes.

## Proposito

Definir o comportamento do agent-hub como um gerenciador de conteudo reutilizavel entre projetos e agentes. O sistema centraliza skills, prompts e subagents em storage remoto (GitHub, Google Drive ou outros providers), permite registrar multiplos projetos locais como workspaces, e sincroniza o conteudo de cada projeto para diretorios reconhecidos por agentes como Codex, Claude Code e Cursor.

## Intencao de produto

1. O usuario pode ter multiplos projetos/workspaces registrados ao mesmo tempo.
2. Cada workspace representa um projeto local, nao um “perfil abstrato”.
3. Qualquer diretorio pode virar um workspace.
4. Um projeto pode comecar vazio, sem skills locais, e receber skills depois via sync/download.
5. O arquivo `ahub.workspace.json` e um artefato interno de projeto: ele guarda o perfil de sync do projeto, nao e a origem das skills.
6. O sistema deve priorizar diretorios reconhecidos pelo proprio projeto ativo (por exemplo `.codex`, `.claude`, `.cursor`) para evitar misturar skills de projetos diferentes.
7. Configuracoes globais de `deployTargets` continuam validas e tem precedencia quando o usuario quer sobrescrever os caminhos padrao.

## Localizacao

- **UI**: `ui/src/pages/WorkspacePage.tsx`, `ui/src/components/workspace/WorkspaceForm.tsx`, `ui/src/components/workspace/WorkspaceSelector.tsx`, `ui/src/components/workspace/CreateWorkspaceDialog.tsx`
- **API**: `src/api/routes/workspace.ts`, `src/api/routes/sync.ts`, `src/api/routes/deploy.ts`
- **Core**: `src/core/config.ts`, `src/core/workspace.ts`, `src/core/sync.ts`

## Invariantes

1. Workspace e sempre um diretorio de projeto registrado pelo usuario.
2. A UI de `/workspace` mostra e edita apenas workspaces registrados; pastas fora da lista nao exibem skills nem detalhes.
3. O usuario pode alternar entre workspaces sem apagar os demais.
4. O projeto pode existir mesmo com `skills: []` ou sem skills locais detectadas.
5. `ahub.workspace.json` descreve o que sera sincronizado para o projeto; ele nao armazena os pacotes remotos em si.
6. A UI deve explicitar o diretorio do projeto e esconder o conceito de manifest como detalhe de implementacao, sempre que possivel.
7. Para cada target suportado, a UI deve mostrar o diretorio reconhecido que sera usado pelo sync.
8. Quando nao houver workspaces cadastrados, a UI deve sugerir pastas a partir de skills locais encontradas em estruturas conhecidas como `.skills`, `.codex`, `.claude` e `.cursor`.
9. O fluxo de selecao de pasta deve ser guiado por navegacao visual e sugestoes; a UI nao deve depender de digitacao manual de caminhos.
10. Campos que exigem contexto extra devem usar ajuda contextual discreta (tooltip/hover hint), em vez de espalhar textos longos pela tela.
11. Precedencia de diretorio de deploy por target:
   - `config.deployTargets[target]`
   - raiz local do workspace ativo (ex.: `project/.codex`)
   - padrao nativo da ferramenta quando nao houver workspace selecionado

## Comportamentos (Given/When/Then)

### Cenario: Registrar varios projetos

- **Given**: O usuario registra `/repos/app-a`, `/repos/app-b` e `/repos/app-c`
- **When**: Abre o seletor de workspace
- **Then**: Os 3 projetos aparecem como workspaces independentes, com um ativo por vez

### Cenario: Qualquer pasta pode virar workspace

- **Given**: O usuario escolhe `/repos/app-novo`
- **When**: Clica em `Novo workspace` e registra essa pasta
- **Then**: O sistema cria `ahub.workspace.json` dentro dela quando necessario e adiciona a pasta na lista de workspaces

### Cenario: Projeto novo sem skills locais

- **Given**: O usuario registra um projeto recem-clonado sem `.skills`, `.codex`, `.claude` ou `.cursor`
- **When**: Abre a tela `/workspace`
- **Then**: A tela continua valida, mostra os diretorios reconhecidos que serao criados no primeiro sync e permite salvar um profile vazio

### Cenario: Sugestoes automaticas de workspace

- **Given**: Existe um projeto com `./.skills` ou `./.codex/skills`
- **When**: O usuario ainda nao cadastrou workspaces e abre `/workspace`
- **Then**: O sistema sugere o diretorio raiz do projeto como workspace inicial, nunca apenas a subpasta de skills

### Cenario: Selecao guiada sem digitar caminho

- **Given**: O usuario abre o modal `Novo workspace`
- **When**: Escolhe uma pasta navegando pelas sugestoes e subpastas
- **Then**: O caminho aparece apenas como texto de confirmacao, sem exigir digitacao manual

### Cenario: Skills visiveis apenas para workspaces cadastrados

- **Given**: Existe um projeto local com skills, mas ele nao foi cadastrado
- **When**: O usuario abre `/workspace`
- **Then**: As skills desse projeto nao aparecem nos detalhes ate que a pasta seja adicionada na lista de workspaces

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
| CRUD explicito na tela `/workspace` | Facilita consulta, busca e manutencao quando houver muitos projetos |
| `ahub.workspace.json` continua existindo | Mantem rastreabilidade e reabertura consistente do projeto |
| Sugestoes por skills detectadas | Acelera o primeiro cadastro sem obrigar o usuario a conhecer a estrutura interna |
| Selecao guiada sem input de caminho | Reduz erro de digitacao e elimina dois fluxos concorrentes para o mesmo objetivo |
| Tooltip curto ao lado dos campos | Mantem a interface legivel sem perder contexto operacional |
| Diretorios por agente visiveis na UI | Garante que o usuario entenda onde Codex/Claude/Cursor vao ler os arquivos |
| Paths locais por workspace como padrao | Evita misturar skills de projetos diferentes no mesmo diretorio global |

## Changelog

| Data | Mudanca |
|------|---------|
| 2026-03-06 | Spec criada para formalizar workspaces multi-projeto e diretorios reconhecidos por agente |
| 2026-03-06 | Atualizada para refletir CRUD de multiplos workspaces, sugestoes por skills detectadas e exibicao restrita a workspaces cadastrados |
| 2026-03-06 | Atualizada para modal unico de selecao, navegacao sem digitacao manual e ajuda contextual por hover |
