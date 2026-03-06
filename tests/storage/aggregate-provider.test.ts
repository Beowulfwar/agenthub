import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AggregateProvider,
  parseQualifiedName,
  formatQualifiedName,
} from '../../src/storage/aggregate-provider.js';
import type { StorageProvider } from '../../src/storage/provider.js';
import type { SkillPackage } from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function mockProvider(name: string, skills: string[]): StorageProvider {
  const pkgs = new Map<string, SkillPackage>();
  for (const s of skills) {
    pkgs.set(s, {
      skill: { name: s, description: `Desc for ${s}`, body: `Body for ${s}` },
      files: [{ relativePath: 'SKILL.md', content: `# ${s}` }],
    });
  }

  return {
    name: 'local' as const,
    healthCheck: vi.fn().mockResolvedValue({ ok: true, message: `${name} healthy` }),
    list: vi.fn(async (query?: string) => {
      const all = [...pkgs.keys()].sort();
      if (!query) return all;
      return all.filter((n) => n.toLowerCase().includes(query.toLowerCase()));
    }),
    exists: vi.fn(async (n: string) => pkgs.has(n)),
    get: vi.fn(async (n: string) => {
      const p = pkgs.get(n);
      if (!p) throw new Error(`Not found: ${n}`);
      return p;
    }),
    put: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    exportAll: vi.fn(async function* () {
      for (const p of pkgs.values()) yield p;
    }),
  };
}

// ---------------------------------------------------------------------------
// parseQualifiedName / formatQualifiedName
// ---------------------------------------------------------------------------

describe('parseQualifiedName', () => {
  it('returns null source for unqualified names', () => {
    expect(parseQualifiedName('my-skill')).toEqual({ source: null, name: 'my-skill' });
  });

  it('splits qualified names on first colon', () => {
    expect(parseQualifiedName('work:my-skill')).toEqual({ source: 'work', name: 'my-skill' });
  });

  it('handles names with multiple colons', () => {
    expect(parseQualifiedName('work:sub:skill')).toEqual({ source: 'work', name: 'sub:skill' });
  });
});

describe('formatQualifiedName', () => {
  it('joins source and name with colon', () => {
    expect(formatQualifiedName('work', 'my-skill')).toBe('work:my-skill');
  });
});

// ---------------------------------------------------------------------------
// AggregateProvider — single source
// ---------------------------------------------------------------------------

describe('AggregateProvider (single source)', () => {
  let provider: AggregateProvider;
  let inner: StorageProvider;

  beforeEach(() => {
    inner = mockProvider('local', ['alpha', 'beta']);
    provider = new AggregateProvider(new Map([['main', inner]]));
  });

  it('reports single source', () => {
    expect(provider.sourceCount).toBe(1);
    expect(provider.isMultiSource).toBe(false);
    expect(provider.sourceIds).toEqual(['main']);
  });

  it('lists skills without qualification', async () => {
    const names = await provider.list();
    expect(names).toEqual(['alpha', 'beta']);
  });

  it('gets a skill by unqualified name', async () => {
    const pkg = await provider.get('alpha');
    expect(pkg.skill.name).toBe('alpha');
  });

  it('also accepts qualified names', async () => {
    const pkg = await provider.get('main:alpha');
    expect(pkg.skill.name).toBe('alpha');
  });

  it('healthCheck delegates to inner', async () => {
    const result = await provider.healthCheck();
    expect(result.ok).toBe(true);
    expect(result.message).toContain('1 source(s)');
  });

  it('exists works', async () => {
    expect(await provider.exists('alpha')).toBe(true);
    expect(await provider.exists('nope')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AggregateProvider — multi-source
// ---------------------------------------------------------------------------

describe('AggregateProvider (multi-source)', () => {
  let provider: AggregateProvider;
  let work: StorageProvider;
  let personal: StorageProvider;

  beforeEach(() => {
    work = mockProvider('work', ['fiscal-nfe', 'shared-util']);
    personal = mockProvider('personal', ['my-notes', 'shared-util']);
    provider = new AggregateProvider(
      new Map([
        ['work', work],
        ['personal', personal],
      ]),
      'work',
    );
  });

  it('reports multi-source', () => {
    expect(provider.sourceCount).toBe(2);
    expect(provider.isMultiSource).toBe(true);
    expect(provider.sourceIds).toEqual(['work', 'personal']);
  });

  it('lists skills with qualified names', async () => {
    const names = await provider.list();
    expect(names).toEqual([
      'personal:my-notes',
      'personal:shared-util',
      'work:fiscal-nfe',
      'work:shared-util',
    ]);
  });

  it('gets skill by qualified name', async () => {
    const pkg = await provider.get('work:fiscal-nfe');
    expect(pkg.skill.name).toBe('fiscal-nfe');
  });

  it('gets skill by unqualified name from default source', async () => {
    const pkg = await provider.get('fiscal-nfe');
    expect(pkg.skill.name).toBe('fiscal-nfe');
    expect(work.get).toHaveBeenCalledWith('fiscal-nfe');
  });

  it('throws for unknown source', async () => {
    await expect(provider.get('unknown:skill')).rejects.toThrow(/not found/i);
  });

  it('listFromSource returns unqualified names', async () => {
    const names = await provider.listFromSource('personal');
    expect(names).toEqual(['my-notes', 'shared-util']);
  });

  it('healthCheck checks all sources', async () => {
    const result = await provider.healthCheck();
    expect(result.ok).toBe(true);
    expect(result.message).toContain('2 source(s)');
  });

  it('healthCheckSource checks specific source', async () => {
    const result = await provider.healthCheckSource('work');
    expect(result.ok).toBe(true);
  });

  it('healthCheckSource returns error for unknown source', async () => {
    const result = await provider.healthCheckSource('nope');
    expect(result.ok).toBe(false);
  });

  it('getSourceProvider returns provider for known source', () => {
    expect(provider.getSourceProvider('work')).toBe(work);
  });

  it('getSourceProvider returns undefined for unknown', () => {
    expect(provider.getSourceProvider('nope')).toBeUndefined();
  });

  it('put delegates to resolved source', async () => {
    const pkg: SkillPackage = {
      skill: { name: 'work:new-skill', description: 'New', body: 'Body' },
      files: [{ relativePath: 'SKILL.md', content: '# new' }],
    };
    await provider.put(pkg);
    expect(work.put).toHaveBeenCalledWith(
      expect.objectContaining({ skill: expect.objectContaining({ name: 'new-skill' }) }),
    );
  });

  it('delete delegates to resolved source', async () => {
    await provider.delete('personal:my-notes');
    expect(personal.delete).toHaveBeenCalledWith('my-notes');
  });

  it('exportAll yields qualified names', async () => {
    const all: SkillPackage[] = [];
    for await (const pkg of provider.exportAll()) {
      all.push(pkg);
    }
    const names = all.map((p) => p.skill.name).sort();
    expect(names).toEqual([
      'personal:my-notes',
      'personal:shared-util',
      'work:fiscal-nfe',
      'work:shared-util',
    ]);
  });
});

// ---------------------------------------------------------------------------
// AggregateProvider — no default, multi-source
// ---------------------------------------------------------------------------

describe('AggregateProvider (no default, multi-source)', () => {
  it('throws for unqualified name without default', async () => {
    const a = mockProvider('a', ['skill-a']);
    const b = mockProvider('b', ['skill-b']);
    const provider = new AggregateProvider(
      new Map([['a', a], ['b', b]]),
      undefined,
    );

    await expect(provider.get('skill-a')).rejects.toThrow(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// AggregateProvider — empty
// ---------------------------------------------------------------------------

describe('AggregateProvider (empty)', () => {
  it('healthCheck reports no sources', async () => {
    const provider = new AggregateProvider(new Map());
    const result = await provider.healthCheck();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('No sources configured');
  });
});
