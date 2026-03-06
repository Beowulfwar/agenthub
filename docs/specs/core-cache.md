# core-cache

> Spec comportamental — contrato vivo para agentes e desenvolvedores.

## Proposito

Cache local de skill packages em `~/.ahub/cache/`. Armazena pacotes buscados do storage provider para evitar fetches repetidos dentro da janela de freshness. Usa um arquivo `index.json` para rastrear timestamps e verificar se entradas estao frescas.

## Localizacao

- **Arquivo fonte**: `src/core/cache.ts`
- **Testes**: `tests/core/cache.test.ts`
- **Artefato em disco**: `~/.ahub/cache/` com `index.json` e subdiretorios por skill

### Layout em disco

```
~/.ahub/cache/
  index.json              <- { [skillName]: { cachedAt: number } }
  <skill-name>/
    SKILL.md
    agents/openai.yaml
    ...
```

## Invariantes

1. O diretorio de cache e sempre `~/.ahub/cache/` (derivado de `AHUB_DIR` + `'cache'`).
2. O indice e sempre `~/.ahub/cache/index.json`.
3. TTL padrao e 1 hora (3.600.000 ms).
4. `isFresh` retorna `false` quando a entrada nao existe no index.
5. `isFresh` retorna `false` quando a diferenca entre `Date.now()` e `cachedAt` excede `maxAgeMs`.
6. `getCachedSkill` auto-limpa o index quando os arquivos em disco estao ausentes (retorna `null` e remove a entrada).
7. `cacheSkill` remove dados antigos antes de escrever novos (`rm` + `mkdir`).
8. Nomes de skills sao validados via `assertSafeSkillName` antes de qualquer operacao de escrita.
9. Caminhos relativos de arquivos sao validados via `assertSafeRelativePath` antes de escrita.
10. `clearCache` remove o diretorio inteiro e recria com index vazio.
11. `listCached` retorna nomes ordenados alfabeticamente.
12. `readIndex` retorna objeto vazio (`{}`) quando `index.json` nao existe ou e invalido.
13. `writeIndex` cria o diretorio de cache se nao existir.

## Comportamentos (Given/When/Then)

### Cenario: Verificar freshness de skill cacheada recentemente

- **Given**: `index.json` contém `{ "my-skill": { "cachedAt": <agora - 30min> } }`.
- **When**: `isFresh('my-skill')` e chamado (TTL padrao de 1h).
- **Then**: Retorna `true` (30 minutos < 1 hora).

### Cenario: Verificar freshness de skill expirada

- **Given**: `index.json` contém `{ "my-skill": { "cachedAt": <agora - 2h> } }`.
- **When**: `isFresh('my-skill')` e chamado (TTL padrao de 1h).
- **Then**: Retorna `false` (2 horas > 1 hora).

### Cenario: Verificar freshness de skill inexistente

- **Given**: `index.json` esta vazio (`{}`).
- **When**: `isFresh('nao-existe')` e chamado.
- **Then**: Retorna `false`.

### Cenario: Verificar freshness com TTL customizado

- **Given**: `index.json` contém `{ "my-skill": { "cachedAt": <agora - 10min> } }`.
- **When**: `isFresh('my-skill', 300000)` e chamado (TTL de 5 minutos).
- **Then**: Retorna `false` (10 minutos > 5 minutos).

### Cenario: Recuperar skill cacheada com arquivos integros

- **Given**: Diretorio `~/.ahub/cache/my-skill/` contém `SKILL.md` valido e `agents/openai.yaml`. Index contém entrada para `my-skill`.
- **When**: `getCachedSkill('my-skill')` e chamado.
- **Then**: Retorna `SkillPackage` com `skill` parseado do `SKILL.md` e `files` contendo todos os arquivos recursivamente.

### Cenario: Auto-limpeza quando arquivos em disco estao ausentes

- **Given**: `index.json` contém `{ "my-skill": { "cachedAt": ... } }` mas o diretorio `~/.ahub/cache/my-skill/` foi deletado manualmente.
- **When**: `getCachedSkill('my-skill')` e chamado.
- **Then**: Retorna `null`. A entrada `my-skill` e removida do `index.json`.

### Cenario: Cachear skill sobrescreve versao anterior

- **Given**: Diretorio `~/.ahub/cache/my-skill/` ja existe com dados antigos.
- **When**: `cacheSkill(novoPacote)` e chamado com `novoPacote.skill.name === 'my-skill'`.
- **Then**: Diretorio antigo e removido (`rm -rf`). Novo diretorio e criado com os arquivos do pacote. `index.json` e atualizado com `cachedAt` = agora.

### Cenario: Cachear skill com nome malicioso

- **Given**: Um `SkillPackage` com `skill.name === '../evil-traversal'`.
- **When**: `cacheSkill(pkg)` e chamado.
- **Then**: Lanca `SkillValidationError` — `assertSafeSkillName` rejeita o nome.

### Cenario: Cachear skill com path relativo malicioso

- **Given**: Um `SkillPackage` com arquivo `{ relativePath: '../../etc/passwd', content: '...' }`.
- **When**: `cacheSkill(pkg)` e chamado.
- **Then**: Lanca `SkillValidationError` — `assertSafeRelativePath` rejeita o caminho.

### Cenario: Limpar todo o cache

- **Given**: Cache contém 5 skills e `index.json` com 5 entradas.
- **When**: `clearCache()` e chamado.
- **Then**: Diretorio `~/.ahub/cache/` e removido e recriado vazio. `index.json` e reescrito como `{}`.

### Cenario: Listar skills cacheadas

- **Given**: `index.json` contém entradas para `zebra-skill`, `alpha-skill`, `mid-skill`.
- **When**: `listCached()` e chamado.
- **Then**: Retorna `['alpha-skill', 'mid-skill', 'zebra-skill']` (ordenado alfabeticamente).

## Contratos de Interface

### Classe: `CacheManager`

| Metodo | Entrada | Saida | Lanca |
|--------|---------|-------|-------|
| `getCachedSkill(name)` | `string` | `Promise<SkillPackage \| null>` | — |
| `listCached()` | — | `Promise<string[]>` | — |
| `isFresh(name, maxAgeMs?)` | `string`, `number?` | `Promise<boolean>` | — |
| `cacheSkill(pkg)` | `SkillPackage` | `Promise<void>` | `SkillValidationError` (nome ou path inseguro) |
| `clearCache()` | — | `Promise<void>` | Erros de I/O |

### Constantes Internas

| Nome | Valor | Visibilidade |
|------|-------|-------------|
| `CACHE_DIR` | `path.join(AHUB_DIR, 'cache')` | modulo |
| `INDEX_PATH` | `path.join(CACHE_DIR, 'index.json')` | modulo |
| `DEFAULT_MAX_AGE_MS` | `3600000` (1 hora) | modulo |

### Tipos Internos

```typescript
interface CacheEntry {
  cachedAt: number;  // Unix epoch ms
}

interface CacheIndex {
  [skillName: string]: CacheEntry;
}
```

### Tipos Utilizados

- `SkillPackage` (de `./types.js`) — pacote completo com skill + files
- `SkillFile` (de `./types.js`) — `{ relativePath, content }`
- `Skill` (de `./types.js`) — skill parseada do SKILL.md

## Dependencias

| Modulo | Uso |
|--------|-----|
| `node:fs/promises` | `mkdir`, `readdir`, `readFile`, `rm`, `writeFile` |
| `node:path` | `path.join`, `path.dirname`, `path.relative` |
| `./config.js` | `AHUB_DIR` — para derivar `CACHE_DIR` |
| `./types.js` | `SkillPackage`, `SkillFile` |
| `./skill.js` | `parseSkill` — para reconstruir `Skill` a partir do `SKILL.md` cacheado |
| `./sanitize.js` | `assertSafeSkillName`, `assertSafeRelativePath` |

### Consumido por

- `src/core/sync.ts` — instancia `CacheManager` para verificar freshness e cachear apos fetch
- `src/api/routes/cache.ts` — endpoints REST de cache
- `src/mcp/tools.ts` — tools MCP que consultam cache

## Efeitos Colaterais

| Operacao | Efeito |
|----------|--------|
| `getCachedSkill` | Leitura de filesystem; pode remover entrada do `index.json` se inconsistente |
| `listCached` | Leitura de `index.json` |
| `isFresh` | Leitura de `index.json` |
| `cacheSkill` | Remove diretorio antigo, cria novo diretorio com arquivos, atualiza `index.json` |
| `clearCache` | Remove e recria `~/.ahub/cache/` inteiro |

## Decisoes de Design

| Decisao | Motivo |
|---------|--------|
| `index.json` separado dos arquivos | Verificacao de freshness sem precisar ler o pacote inteiro |
| TTL padrao de 1 hora | Equilibrio entre atualidade e performance para uso interativo |
| `rm` + `mkdir` ao cachear (nao merge) | Simplicidade — evita arquivos orfaos de versoes anteriores |
| Auto-limpeza em `getCachedSkill` | Resiliencia — cache inconsistente se autocorrige |
| `readIndex` retorna `{}` para erros | Defensivo — cache corrompido nao impede operacao |
| Validacao de nomes e paths antes de I/O | Seguranca — previne path traversal (C3/C4) |
| `listCached` ordenado | Determinismo — mesma saida para mesma entrada |
| `walkDir` recursivo para reconstruir pacote | Suporta subdiretorios (`agents/`, `scripts/`, `references/`) |

## Changelog

| Data | Mudanca |
|------|---------|
| 2026-03-05 | Spec criada |
