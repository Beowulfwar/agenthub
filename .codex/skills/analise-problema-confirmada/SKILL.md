---
name: analise-problema-confirmada
description: Analisar problemas reportados (bugs, falhas logicas, comportamentos inesperados ou riscos) com foco em nuances, dependencias e pontos nao verificados. Use quando houver um problema relatado e for necessario confirmar se procede, mapear dependencias ocultas e concluir como confirmado, nao procede ou ambiguo antes de propor correcao.
---

# Analise Problema Confirmada

## Objetivo

Confirmar se um problema reportado procede com base em evidencias do codigo, dependencias e fluxos reais. Priorizar nuances e pontos normalmente ignorados ao investigar. Evitar validacoes obvias e conclusoes sem base, orientando a decisao entre confirmado, nao procede ou ambiguo.

## Fluxo obrigatorio de analise

1. Identificar exatamente onde o problema foi reportado (arquivo, funcao, fluxo) e o ponto de entrada/impacto.
2. Mapear dependencias diretas e indiretas (imports, chamadas, efeitos colaterais, dados persistidos, configs, flags, envs).
3. Investigar caminhos alternativos e nao obvios (fallbacks, retries, idempotencia, concorrencia, jobs, caches).
4. Rastrear fluxo de dados fim-a-fim (normalizacoes, defaults, serializacao, timezone, rounding, validacoes).
5. Verificar se o comportamento reportado realmente ocorre com base na logica existente.
6. Determinar o estado do problema: confirmado, nao procede ou ambiguo.
7. Se confirmado, avaliar o impacto da correcao em fluxos adjacentes, contratos e dependencias.

## Evidencias a coletar

- Condicoes, estados e branches relevantes que comprovem o comportamento.
- Fluxo de dados entre camadas e modulos (API, services, repositorio, integrações).
- Contratos e schemas consumidos/emitidos (payloads, DTOs, tabelas, views, triggers).
- Efeitos colaterais observaveis (persistencia, logs, filas, eventos, caches).
- Fluxos adjacentes potencialmente afetados pela correcao proposta.
- Defaults, overrides por tenant, flags, variaveis de ambiente e configuracoes remotas.
- Caminhos alternativos (fallbacks, retries, timeouts, tratamentos silenciosos de erro).

## Locais nao obvios para procurar evidencias

- Middlewares, interceptors, validadores e wrappers compartilhados.
- Jobs/cron/background tasks e seus gatilhos.
- Migrations, backfills, scripts de manutencao e seeds.
- Adapters de integracao externa e mapeamentos de payload.
- Serializacao/deserializacao e conversoes (timezone, moeda, arredondamento).
- Camadas de cache e memoizacao (local, redis, in-memory).
- Feature flags, configs por ambiente e overrides por empresa.

## Regras de decisao

- Somente concluir "problema confirmado" com evidencia clara no codigo.
- Se houver ambiguidade, declarar explicitamente e listar informacoes faltantes.
- Se o problema nao proceder, justificar tecnicamente com base na logica real.
- Nao usar linguagem especulativa; afirmar apenas com base em evidencias.

## Regras para alteracoes

- Aplicar mudancas apenas quando o problema estiver confirmado.
- Fazer alteracoes minimas, localizadas e defensivas.
- Nao refatorar amplamente nem alterar regras de negocio para "forcar" correcao.
- Nao introduzir novas dependencias.
- Preferir correcoes com baixo risco de regressao.
- Antes de corrigir, verificar se a mudanca afeta outras partes do codigo e ajustar o escopo quando necessario.
- Avaliar se a correcao exige ajuste mais abrangente para manter consistencia do fluxo.
- Nao propor testes; foco exclusivo em diagnostico com base no codigo.

## Integracao entre modulos e repositorios

- Cruzar chamadas entre modulos e camadas quando o fluxo exigir.
- Verificar contratos entre repositorios quando houver integracao (backend, frontend, shared).
- Se o problema for restrito a um repo, nao ampliar escopo sem evidencia.

## Gatilhos e anti-gatilhos

- Usar quando houver um problema reportado que precisa ser confirmado antes de agir.
- Nao usar para review de PR/diff; nesses casos usar `revisao-geral-codigo`.
- Nao usar para caca de bugs sem relato; nesses casos usar `procura-sistematica-bugs`.

## Referencias (carregar sob demanda)

- `references/official-links.md`

## Formato de saida

- Secao "Resumo da analise" curta e objetiva.
- Secao "Evidencias encontradas" com trechos, fluxos e dependencias relevantes.
- Secao "Locais nao obvios verificados" com o que foi checado fora do caminho principal.
- Secao "Conclusao" com um dos estados: Problema confirmado, Problema nao procede, Ambiguo.
- Secao "Impacto e abrangencia" com riscos e necessidade de ajuste mais amplo (se aplicavel).
- Se houver alteracoes: listar o que foi alterado e o motivo tecnico de cada alteracao.
