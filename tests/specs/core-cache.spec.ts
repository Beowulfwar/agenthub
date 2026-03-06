/**
 * Characterization tests for core-cache module.
 *
 * These tests validate the behavioral contracts documented in
 * docs/specs/core-cache.md. They focus on observable behavior,
 * not implementation details.
 *
 * @see docs/specs/core-cache.md
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Mock config.js to return a fixed temp directory as AHUB_DIR.
// The factory must be self-contained because vi.mock is hoisted.
vi.mock('../../src/core/config.js', async () => {
  const nodeOs = await import('node:os');
  const nodePath = await import('node:path');
  return {
    AHUB_DIR: nodePath.default.join(nodeOs.default.tmpdir(), 'ahub-cache-spec-test'),
  };
});

// Import after mock is set up.
import { CacheManager } from '../../src/core/cache.js';

// Replicate the same path that the mock provides.
const TEST_AHUB_DIR = path.join(os.tmpdir(), 'ahub-cache-spec-test');
const CACHE_DIR = path.join(TEST_AHUB_DIR, 'cache');

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await mkdir(CACHE_DIR, { recursive: true });
});

beforeEach(async () => {
  await rm(CACHE_DIR, { recursive: true, force: true });
  await mkdir(CACHE_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(TEST_AHUB_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSamplePackage(name: string) {
  return {
    skill: {
      name,
      description: `Description for ${name}`,
      body: `# ${name}\n\nBody content.`,
      metadata: {},
    },
    files: [
      {
        relativePath: 'SKILL.md',
        content: [
          '---',
          `name: "${name}"`,
          `description: "Description for ${name}"`,
          '---',
          '',
          `# ${name}`,
          '',
          'Body content.',
          '',
        ].join('\n'),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Contract: cacheSkill persists package to disk
// ---------------------------------------------------------------------------

describe('Spec: cacheSkill persists package to disk', () => {
  let cache: CacheManager;

  beforeEach(() => {
    cache = new CacheManager();
  });

  it('writes files to cache/<name>/ directory', async () => {
    const pkg = makeSamplePackage('persisted-skill');

    await cache.cacheSkill(pkg);

    const skillMd = await readFile(
      path.join(CACHE_DIR, 'persisted-skill', 'SKILL.md'),
      'utf-8',
    );
    expect(skillMd).toContain('persisted-skill');
  });

  it('updates index.json with cachedAt timestamp', async () => {
    const pkg = makeSamplePackage('indexed-skill');

    await cache.cacheSkill(pkg);

    const indexRaw = await readFile(
      path.join(CACHE_DIR, 'index.json'),
      'utf-8',
    );
    const index = JSON.parse(indexRaw);
    expect(index['indexed-skill']).toBeDefined();
    expect(index['indexed-skill'].cachedAt).toBeTypeOf('number');
  });
});

// ---------------------------------------------------------------------------
// Contract: getCachedSkill retrieves stored package
// ---------------------------------------------------------------------------

describe('Spec: getCachedSkill retrieves stored package', () => {
  let cache: CacheManager;

  beforeEach(() => {
    cache = new CacheManager();
  });

  it('returns null for unknown skill name', async () => {
    const result = await cache.getCachedSkill('nonexistent-skill');
    expect(result).toBeNull();
  });

  it('returns complete SkillPackage after cacheSkill', async () => {
    const pkg = makeSamplePackage('retrievable-skill');
    await cache.cacheSkill(pkg);

    const result = await cache.getCachedSkill('retrievable-skill');
    expect(result).not.toBeNull();
  });

  it('returned skill has correct name and files', async () => {
    const pkg = makeSamplePackage('named-skill');
    await cache.cacheSkill(pkg);

    const result = await cache.getCachedSkill('named-skill');
    expect(result!.skill.name).toBe('named-skill');
    expect(result!.files.length).toBeGreaterThanOrEqual(1);

    const skillMdFile = result!.files.find((f) => f.relativePath === 'SKILL.md');
    expect(skillMdFile).toBeDefined();
    expect(skillMdFile!.content).toContain('named-skill');
  });
});

// ---------------------------------------------------------------------------
// Contract: listCached returns sorted names
// ---------------------------------------------------------------------------

describe('Spec: listCached returns sorted names', () => {
  let cache: CacheManager;

  beforeEach(() => {
    cache = new CacheManager();
  });

  it('returns sorted alphabetical list', async () => {
    await cache.cacheSkill(makeSamplePackage('zebra-skill'));
    await cache.cacheSkill(makeSamplePackage('alpha-skill'));
    await cache.cacheSkill(makeSamplePackage('middle-skill'));

    const names = await cache.listCached();
    expect(names).toEqual(['alpha-skill', 'middle-skill', 'zebra-skill']);
  });

  it('returns empty array when nothing is cached', async () => {
    const names = await cache.listCached();
    expect(names).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Contract: isFresh respects TTL
// ---------------------------------------------------------------------------

describe('Spec: isFresh respects TTL', () => {
  let cache: CacheManager;

  beforeEach(() => {
    cache = new CacheManager();
  });

  it('recently cached skill is fresh (default 1h TTL)', async () => {
    await cache.cacheSkill(makeSamplePackage('fresh-skill'));

    const fresh = await cache.isFresh('fresh-skill');
    expect(fresh).toBe(true);
  });

  it('skill is stale when maxAge is 0ms', async () => {
    await cache.cacheSkill(makeSamplePackage('stale-skill'));

    const fresh = await cache.isFresh('stale-skill', 0);
    expect(fresh).toBe(false);
  });

  it('unknown skill is never fresh', async () => {
    const fresh = await cache.isFresh('never-cached-skill');
    expect(fresh).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Contract: clearCache removes everything
// ---------------------------------------------------------------------------

describe('Spec: clearCache removes everything', () => {
  let cache: CacheManager;

  beforeEach(() => {
    cache = new CacheManager();
  });

  it('all cached skills are removed', async () => {
    await cache.cacheSkill(makeSamplePackage('skill-one'));
    await cache.cacheSkill(makeSamplePackage('skill-two'));

    await cache.clearCache();

    const names = await cache.listCached();
    expect(names).toEqual([]);
  });

  it('index is reset to empty', async () => {
    await cache.cacheSkill(makeSamplePackage('skill-to-clear'));

    await cache.clearCache();

    const indexRaw = await readFile(
      path.join(CACHE_DIR, 'index.json'),
      'utf-8',
    );
    const index = JSON.parse(indexRaw);
    expect(Object.keys(index)).toHaveLength(0);
  });

  it('getCachedSkill returns null after clear', async () => {
    await cache.cacheSkill(makeSamplePackage('doomed-skill'));

    await cache.clearCache();

    const result = await cache.getCachedSkill('doomed-skill');
    expect(result).toBeNull();
  });
});
