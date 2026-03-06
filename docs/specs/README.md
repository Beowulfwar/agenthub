# Specs — agent-hub

Documentacao comportamental spec-driven. Cada spec e' um contrato vivo que documenta invariantes, cenarios Given/When/Then e contratos de interface de cada modulo.

## Como usar

1. **Antes de modificar** um modulo → leia a spec correspondente
2. **Ao alterar comportamento** → atualize a spec E os testes de caracterizacao
3. **Ao criar novo modulo** → copie `_TEMPLATE.md` e preencha
4. **Rodar testes de caracterizacao**: `npx vitest tests/specs/`

## Indice

| Spec | Modulo | Codigo | Testes de Caracterizacao |
|------|--------|--------|--------------------------|
| [core-skill](core-skill.md) | Skill parse/serialize/validate | `src/core/skill.ts` | `tests/specs/core-skill.spec.ts` |
| [core-config](core-config.md) | Config CRUD | `src/core/config.ts` | `tests/specs/core-config.spec.ts` |
| [core-workspace](core-workspace.md) | Workspace manifest | `src/core/workspace.ts` | `tests/specs/core-workspace.spec.ts` |
| [core-sync](core-sync.md) | Sync engine | `src/core/sync.ts` | `tests/specs/core-sync.spec.ts` |
| [core-cache](core-cache.md) | Cache com TTL | `src/core/cache.ts` | `tests/specs/core-cache.spec.ts` |
| [storage-provider](storage-provider.md) | Storage factory + providers | `src/storage/` | — |
| [deploy-deployer](deploy-deployer.md) | Deploy factory + deployers | `src/deploy/` | — |
| [api-rest](api-rest.md) | API HTTP REST | `src/api/` | — |

## Convencoes

- Specs em portugues (sem acentos em nomes de arquivo)
- Formato Given/When/Then para cenarios comportamentais
- Um arquivo `.spec.ts` por modulo core (testes de caracterizacao)
- Testes `.spec.ts` validam contratos da spec (distinto de `.test.ts` unitarios)
- Template: [`_TEMPLATE.md`](_TEMPLATE.md)

## Diferenca entre `.test.ts` e `.spec.ts`

| Aspecto | `.test.ts` (unitario) | `.spec.ts` (caracterizacao) |
|---------|------------------------|------------------------------|
| Foco | Implementacao interna | Comportamento observavel |
| Documenta | Como funciona | O que deve acontecer |
| Quebra quando | Implementacao muda | Contrato e' violado |
| Referencia | Codigo-fonte | Spec em `docs/specs/` |
