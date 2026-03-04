/**
 * Local cache for skill packages.
 *
 * Cached data lives under `~/.ahub/cache/`.  Each skill is stored as a
 * directory of files, and an `index.json` tracks the last-cached timestamp
 * for freshness checks.
 *
 * Directory layout:
 *
 *   ~/.ahub/cache/
 *     index.json              <- { [skillName]: { cachedAt: number } }
 *     <skill-name>/
 *       SKILL.md
 *       agents/openai.yaml
 *       ...
 */

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { AHUB_DIR } from './config.js';
import type { SkillFile, SkillPackage } from './types.js';
import { parseSkill } from './skill.js';
import { assertSafeRelativePath, assertSafeSkillName } from './sanitize.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Root of the cache directory. */
const CACHE_DIR = path.join(AHUB_DIR, 'cache');

/** Path to the cache index file. */
const INDEX_PATH = path.join(CACHE_DIR, 'index.json');

/** Default maximum age (in ms) before a cached entry is stale (1 hour). */
const DEFAULT_MAX_AGE_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Index types
// ---------------------------------------------------------------------------

interface CacheEntry {
  /** Unix epoch ms when the skill was last written to the cache. */
  cachedAt: number;
}

interface CacheIndex {
  [skillName: string]: CacheEntry;
}

// ---------------------------------------------------------------------------
// CacheManager
// ---------------------------------------------------------------------------

export class CacheManager {
  // -----------------------------------------------------------------------
  // Read operations
  // -----------------------------------------------------------------------

  /**
   * Retrieve a previously cached skill package.
   *
   * @param name - The skill name (must match the directory name in the cache).
   * @returns The `SkillPackage`, or `null` if nothing is cached for this name.
   */
  async getCachedSkill(name: string): Promise<SkillPackage | null> {
    const index = await this.readIndex();
    if (!(name in index)) {
      return null;
    }

    const skillDir = path.join(CACHE_DIR, name);
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    let raw: string;
    try {
      raw = await readFile(skillMdPath, 'utf-8');
    } catch {
      // Index references a skill that no longer exists on disk -- clean up.
      delete index[name];
      await this.writeIndex(index);
      return null;
    }

    const skill = parseSkill(raw);
    const files = await this.walkDir(skillDir, skillDir);

    return { skill, files };
  }

  /**
   * Return a list of skill names currently in the cache.
   */
  async listCached(): Promise<string[]> {
    const index = await this.readIndex();
    return Object.keys(index).sort();
  }

  /**
   * Check whether a cached skill is still fresh (i.e. was cached within
   * `maxAgeMs` milliseconds of now).
   *
   * @param name      - Skill name.
   * @param maxAgeMs  - Maximum acceptable age in milliseconds.
   *                    Defaults to 1 hour.
   * @returns `true` when a fresh cache entry exists, `false` otherwise.
   */
  async isFresh(
    name: string,
    maxAgeMs: number = DEFAULT_MAX_AGE_MS,
  ): Promise<boolean> {
    const index = await this.readIndex();
    const entry = index[name];
    if (!entry) {
      return false;
    }
    return Date.now() - entry.cachedAt < maxAgeMs;
  }

  // -----------------------------------------------------------------------
  // Write operations
  // -----------------------------------------------------------------------

  /**
   * Store a skill package in the cache.
   *
   * Overwrites any previously cached version of the same skill.
   *
   * @param pkg - The skill package to cache.
   */
  async cacheSkill(pkg: SkillPackage): Promise<void> {
    assertSafeSkillName(pkg.skill.name);

    const name = pkg.skill.name;
    const skillDir = path.join(CACHE_DIR, name);

    // Remove stale data for this skill, if any.
    await rm(skillDir, { recursive: true, force: true });
    await mkdir(skillDir, { recursive: true });

    // Write every file in the package.
    for (const file of pkg.files) {
      assertSafeRelativePath(file.relativePath);
      const target = path.join(skillDir, file.relativePath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.content, 'utf-8');
    }

    // Update the index.
    const index = await this.readIndex();
    index[name] = { cachedAt: Date.now() };
    await this.writeIndex(index);
  }

  /**
   * Remove all cached skills and reset the index.
   */
  async clearCache(): Promise<void> {
    await rm(CACHE_DIR, { recursive: true, force: true });
    await mkdir(CACHE_DIR, { recursive: true });
    await this.writeIndex({});
  }

  // -----------------------------------------------------------------------
  // Index helpers
  // -----------------------------------------------------------------------

  /**
   * Read and parse `index.json`. Returns an empty object when the file
   * does not exist.
   */
  private async readIndex(): Promise<CacheIndex> {
    try {
      const raw = await readFile(INDEX_PATH, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as CacheIndex;
      }
      return {};
    } catch {
      return {};
    }
  }

  /**
   * Persist the index to disk, creating the cache directory if needed.
   */
  private async writeIndex(index: CacheIndex): Promise<void> {
    await mkdir(CACHE_DIR, { recursive: true });
    const content = JSON.stringify(index, null, 2) + '\n';
    await writeFile(INDEX_PATH, content, 'utf-8');
  }

  // -----------------------------------------------------------------------
  // Filesystem helpers
  // -----------------------------------------------------------------------

  /**
   * Recursively walk `dirPath` and collect all files as `SkillFile[]`
   * with paths relative to `basePath`.
   */
  private async walkDir(
    dirPath: string,
    basePath: string,
  ): Promise<SkillFile[]> {
    const results: SkillFile[] = [];

    let entries: import('node:fs').Dirent[];
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch {
      return results;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const nested = await this.walkDir(fullPath, basePath);
        results.push(...nested);
      } else if (entry.isFile()) {
        const content = await readFile(fullPath, 'utf-8');
        const relativePath = path.relative(basePath, fullPath);
        results.push({ relativePath, content });
      }
    }

    return results;
  }
}
