# {Nome do Modulo}

> Spec comportamental — contrato vivo para agentes e desenvolvedores.

## Proposito

{1-2 frases: o que este modulo faz e por que existe}

## Localizacao

- **Codigo**: `src/{path}/{file}.ts`
- **Testes unitarios**: `tests/{path}/{file}.test.ts`
- **Testes de caracterizacao**: `tests/specs/{module}.spec.ts`

## Invariantes

{Regras que NUNCA podem ser violadas — listar cada uma como item numerado}

1. ...
2. ...

## Comportamentos (Given/When/Then)

### {Cenario 1}

- **Given**: {pre-condicao}
- **When**: {acao}
- **Then**: {resultado esperado}

### {Cenario 2}

- **Given**: {pre-condicao}
- **When**: {acao}
- **Then**: {resultado esperado}

## Contratos de Interface

### Funcoes Publicas

| Funcao | Input | Output | Throws |
|--------|-------|--------|--------|
| `funcao()` | `tipo` | `tipo` | `ErroTipo` |

### Tipos Exportados

{Lista dos tipos publicos com descricao curta}

## Dependencias

- **Usa**: {modulos que este importa}
- **Usado por**: {modulos que importam este}

## Efeitos Colaterais

{Filesystem, rede, estado global — listar explicitamente}

## Decisoes de Design

| Decisao | Justificativa |
|---------|---------------|
| ... | ... |

## Changelog

| Data | Mudanca |
|------|---------|
| {data} | Spec criada |
