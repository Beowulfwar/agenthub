/**
 * Local filesystem storage provider.
 *
 * Reads/writes skills directly from a local directory.
 * Each subdirectory containing a marker file (SKILL.md, PROMPT.md, or
 * AGENT.md) is treated as a content package.
 *
 * No git, no clone — just local filesystem operations.
 */

import { access, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import type { ContentType, HealthCheckResult, LocalConfig, SkillPackage } from '../core/types.js';
import { ALL_MARKER_FILES, MARKER_TO_TYPE } from '../core/types.js';
import { SkillNotFoundError } from '../core/errors.js';
import { assertSafeSkillName } from '../core/sanitize.js';
import { loadSkillPackage, saveSkillPackage } from '../core/skill.js';
import type { ListOptions, StorageProvider } from './provider.js';

export class LocalProvider implements StorageProvider {
  readonly name = 'local' as const;
  private readonly directory: string;

  constructor(config: LocalConfig) {
    this.directory = path.resolve(config.directory);
  }

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      await access(this.directory);
      return { ok: true, message: `Local directory accessible: ${this.directory}` };
    } catch {
      return { ok: false, message: `Directory not accessible: ${this.directory}` };
    }
  }

  async list(options?: string | ListOptions): Promise<string[]> {
    const opts = typeof options === 'string' ? { query: options } : (options ?? {});
    const names: string[] = [];

    let entries: import('node:fs').Dirent[];
    try {
      entries = await readdir(this.directory, { withFileTypes: true });
    } catch {
      return names;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // Check if this subdirectory has any known marker file.
      const dirPath = path.join(this.directory, entry.name);
      let detectedType: ContentType | null = null;

      for (const marker of ALL_MARKER_FILES) {
        try {
          await access(path.join(dirPath, marker));
          detectedType = MARKER_TO_TYPE[marker] ?? 'skill';
          break;
        } catch {
          // Not found, try next marker.
        }
      }

      if (detectedType === null) continue;

      // Filter by type if specified.
      if (opts.type && detectedType !== opts.type) continue;

      names.push(entry.name);
    }

    names.sort();

    if (opts.query) {
      const lower = opts.query.toLowerCase();
      return names.filter((n) => n.toLowerCase().includes(lower));
    }

    return names;
  }

  async exists(name: string): Promise<boolean> {
    assertSafeSkillName(name);
    const dirPath = path.join(this.directory, name);

    // Check for any known marker file.
    for (const marker of ALL_MARKER_FILES) {
      try {
        await access(path.join(dirPath, marker));
        return true;
      } catch {
        // Try next marker.
      }
    }

    return false;
  }

  async get(name: string): Promise<SkillPackage> {
    assertSafeSkillName(name);
    const dirPath = path.join(this.directory, name);
    return loadSkillPackage(dirPath);
  }

  async put(pkg: SkillPackage): Promise<void> {
    assertSafeSkillName(pkg.skill.name);
    const dirPath = path.join(this.directory, pkg.skill.name);
    await saveSkillPackage(dirPath, pkg);
  }

  async delete(name: string): Promise<void> {
    assertSafeSkillName(name);
    const dirPath = path.join(this.directory, name);

    if (!(await this.exists(name))) {
      throw new SkillNotFoundError(name);
    }

    await rm(dirPath, { recursive: true, force: true });
  }

  async *exportAll(): AsyncIterable<SkillPackage> {
    const names = await this.list();
    for (const name of names) {
      yield await this.get(name);
    }
  }
}
