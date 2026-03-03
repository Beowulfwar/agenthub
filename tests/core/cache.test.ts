import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Cache tests use a real temp directory on disk.
 *
 * Because cache.ts computes CACHE_DIR and INDEX_PATH as module-level
 * constants from AHUB_DIR (evaluated once at import time), we must
 * provide a stable mock value BEFORE the cache module is imported.
 *
 * vi.mock is hoisted, so we cannot reference file-level `const` vars
 * inside the factory.  Instead we compute the path inline using the
 * same `os` and `path` modules.
 */

// Mock config.js to return a fixed temp directory as AHUB_DIR.
// The factory must be self-contained because vi.mock is hoisted.
vi.mock('../../src/core/config.js', async () => {
  const nodeOs = await import('node:os');
  const nodePath = await import('node:path');
  return {
    AHUB_DIR: nodePath.default.join(nodeOs.default.tmpdir(), 'ahub-cache-test-stable'),
  };
});

// Import after mock is set up.
import { CacheManager } from '../../src/core/cache.js';

// Replicate the same path that the mock provides.
const TEST_AHUB_DIR = path.join(os.tmpdir(), 'ahub-cache-test-stable');
const CACHE_DIR = path.join(TEST_AHUB_DIR, 'cache');

beforeAll(async () => {
  await mkdir(CACHE_DIR, { recursive: true });
});

beforeEach(async () => {
  // Clean the cache directory between tests for isolation.
  await rm(CACHE_DIR, { recursive: true, force: true });
  await mkdir(CACHE_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(TEST_AHUB_DIR, { recursive: true, force: true });
});

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

describe('CacheManager', () => {
  let cache: CacheManager;

  beforeEach(() => {
    cache = new CacheManager();
  });

  describe('cacheSkill', () => {
    it('writes files and updates index', async () => {
      const pkg = makeSamplePackage('my-cached-skill');

      await cache.cacheSkill(pkg);

      // Verify file was written.
      const skillMd = await readFile(
        path.join(CACHE_DIR, 'my-cached-skill', 'SKILL.md'),
        'utf-8',
      );
      expect(skillMd).toContain('my-cached-skill');

      // Verify index was updated.
      const indexRaw = await readFile(
        path.join(CACHE_DIR, 'index.json'),
        'utf-8',
      );
      const index = JSON.parse(indexRaw);
      expect(index['my-cached-skill']).toBeDefined();
      expect(index['my-cached-skill'].cachedAt).toBeTypeOf('number');
    });
  });

  describe('getCachedSkill', () => {
    it('returns null for an unknown skill', async () => {
      const result = await cache.getCachedSkill('nonexistent');
      expect(result).toBeNull();
    });

    it('returns the cached package after caching', async () => {
      const pkg = makeSamplePackage('cached-skill');
      await cache.cacheSkill(pkg);

      const result = await cache.getCachedSkill('cached-skill');
      expect(result).not.toBeNull();
      expect(result!.skill.name).toBe('cached-skill');
      expect(result!.files.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('listCached', () => {
    it('returns sorted names of all cached skills', async () => {
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

  describe('isFresh', () => {
    it('returns true for a recently cached skill', async () => {
      await cache.cacheSkill(makeSamplePackage('fresh-skill'));

      // With default maxAge (1 hour), a just-cached skill should be fresh.
      const fresh = await cache.isFresh('fresh-skill');
      expect(fresh).toBe(true);
    });

    it('returns false for an expired entry', async () => {
      await cache.cacheSkill(makeSamplePackage('old-skill'));

      // Use maxAge of 0ms so the entry is immediately stale.
      const fresh = await cache.isFresh('old-skill', 0);
      expect(fresh).toBe(false);
    });

    it('returns false for an unknown skill', async () => {
      const fresh = await cache.isFresh('unknown-skill');
      expect(fresh).toBe(false);
    });
  });

  describe('clearCache', () => {
    it('removes all cached skills', async () => {
      await cache.cacheSkill(makeSamplePackage('skill-a'));
      await cache.cacheSkill(makeSamplePackage('skill-b'));

      await cache.clearCache();

      const names = await cache.listCached();
      expect(names).toEqual([]);

      // Skills should no longer be retrievable.
      const result = await cache.getCachedSkill('skill-a');
      expect(result).toBeNull();
    });

    it('resets the index to empty', async () => {
      await cache.cacheSkill(makeSamplePackage('skill-c'));
      await cache.clearCache();

      // Index should be empty object.
      const indexRaw = await readFile(
        path.join(CACHE_DIR, 'index.json'),
        'utf-8',
      );
      const index = JSON.parse(indexRaw);
      expect(Object.keys(index)).toHaveLength(0);
    });
  });
});
