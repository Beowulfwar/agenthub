/**
 * Local filesystem storage provider.
 *
 * Canonical layout:
 *   <root>/skills/<name>/
 *   <root>/prompts/<name>/
 *   <root>/subagents/<name>/
 *
 * Legacy flat directories remain readable as fallback:
 *   <root>/<name>/
 */

import { access, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import type {
  ContentPackage,
  ContentRef,
  ContentType,
  HealthCheckResult,
  LocalConfig,
} from '../core/types.js';
import { ALL_MARKER_FILES, MARKER_TO_TYPE } from '../core/types.js';
import { SkillNotFoundError } from '../core/errors.js';
import { parseContentRef, formatContentRef } from '../core/content-ref.js';
import { assertSafeSkillName } from '../core/sanitize.js';
import { detectContentType, loadSkillPackage, saveSkillPackage } from '../core/skill.js';
import type { ListOptions, StorageProvider } from './provider.js';

const TYPE_DIRS: Record<ContentType, string> = {
  skill: 'skills',
  prompt: 'prompts',
  subagent: 'subagents',
};

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
    const refs = await this.listContentRefs(options);
    return refs.map((ref) => formatContentRef(ref));
  }

  async listContentRefs(options?: string | ListOptions): Promise<ContentRef[]> {
    const opts = typeof options === 'string' ? { query: options } : (options ?? {});
    const refs = new Map<string, ContentRef>();

    for (const type of Object.keys(TYPE_DIRS) as ContentType[]) {
      const typeDir = this.typeRoot(type);
      const entries = await readdir(typeDir, { withFileTypes: true }).catch(() => []);

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dirPath = path.join(typeDir, entry.name);
        if (!(await this.hasMarker(dirPath))) continue;
        const ref = { type, name: entry.name } satisfies ContentRef;
        refs.set(formatContentRef(ref), ref);
      }
    }

    const legacyEntries = await readdir(this.directory, { withFileTypes: true }).catch(() => []);
    for (const entry of legacyEntries) {
      if (!entry.isDirectory()) continue;
      if ((Object.values(TYPE_DIRS) as string[]).includes(entry.name)) continue;
      const dirPath = path.join(this.directory, entry.name);
      const detectedType = await this.detectLegacyType(dirPath);
      if (!detectedType) continue;
      const ref = { type: detectedType, name: entry.name } satisfies ContentRef;
      refs.set(formatContentRef(ref), ref);
    }

    let results = [...refs.values()].sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.name.localeCompare(b.name);
    });

    if (opts.type) {
      results = results.filter((ref) => ref.type === opts.type);
    }
    if (opts.query) {
      const lower = opts.query.toLowerCase();
      results = results.filter((ref) => formatContentRef(ref).toLowerCase().includes(lower) || ref.name.toLowerCase().includes(lower));
    }

    return results;
  }

  async exists(refOrName: string | ContentRef): Promise<boolean> {
    const ref = this.normalizeRef(refOrName);
    const canonicalDir = this.canonicalDir(ref);
    if (await this.hasMarker(canonicalDir)) {
      return true;
    }

    const legacyDir = this.legacyDir(ref.name);
    const detectedType = await this.detectLegacyType(legacyDir);
    return detectedType === ref.type;
  }

  async get(refOrName: string | ContentRef): Promise<ContentPackage> {
    const ref = this.normalizeRef(refOrName);
    const canonicalDir = this.canonicalDir(ref);
    if (await this.hasMarker(canonicalDir)) {
      const pkg = await loadSkillPackage(canonicalDir);
      if (!pkg.skill.type) pkg.skill.type = ref.type;
      return pkg;
    }

    const legacyDir = this.legacyDir(ref.name);
    const detectedType = await this.detectLegacyType(legacyDir);
    if (detectedType === ref.type) {
      const pkg = await loadSkillPackage(legacyDir);
      if (!pkg.skill.type) pkg.skill.type = detectedType;
      return pkg;
    }

    throw new SkillNotFoundError(formatContentRef(ref));
  }

  async put(pkg: ContentPackage): Promise<void> {
    const ref = this.normalizeRef({ type: pkg.skill.type ?? 'skill', name: pkg.skill.name });
    const dirPath = this.canonicalDir(ref);
    await saveSkillPackage(dirPath, {
      ...pkg,
      skill: {
        ...pkg.skill,
        type: ref.type,
        name: ref.name,
      },
    });
  }

  async delete(refOrName: string | ContentRef): Promise<void> {
    const ref = this.normalizeRef(refOrName);
    const canonicalDir = this.canonicalDir(ref);

    if (await this.hasMarker(canonicalDir)) {
      await rm(canonicalDir, { recursive: true, force: true });
      return;
    }

    const legacyDir = this.legacyDir(ref.name);
    const detectedType = await this.detectLegacyType(legacyDir);
    if (detectedType === ref.type) {
      await rm(legacyDir, { recursive: true, force: true });
      return;
    }

    throw new SkillNotFoundError(formatContentRef(ref));
  }

  async *exportAll(): AsyncIterable<ContentPackage> {
    const refs = await this.listContentRefs();
    for (const ref of refs) {
      yield await this.get(ref);
    }
  }

  private typeRoot(type: ContentType): string {
    return path.join(this.directory, TYPE_DIRS[type]);
  }

  private canonicalDir(ref: ContentRef): string {
    return path.join(this.typeRoot(ref.type), ref.name);
  }

  private legacyDir(name: string): string {
    return path.join(this.directory, name);
  }

  private normalizeRef(refOrName: string | ContentRef): ContentRef {
    const ref = typeof refOrName === 'string' ? parseContentRef(refOrName, 'skill') : refOrName;
    assertSafeSkillName(ref.name);
    return ref;
  }

  private async hasMarker(dirPath: string): Promise<boolean> {
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

  private async detectLegacyType(dirPath: string): Promise<ContentType | null> {
    for (const marker of ALL_MARKER_FILES) {
      try {
        await access(path.join(dirPath, marker));
        return MARKER_TO_TYPE[marker] ?? 'skill';
      } catch {
        // Try next marker.
      }
    }

    try {
      return await detectContentType(dirPath);
    } catch {
      return null;
    }
  }
}
