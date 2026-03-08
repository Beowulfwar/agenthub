/**
 * GitProvider — StorageProvider backed by a Git repository.
 *
 * Skills are stored as top-level directories in a Git repo.  Each directory
 * must contain a `SKILL.md` file to be recognized as a skill.
 *
 * Local clone path: `~/.ahub/repos/<repo-name>/`
 */

import path from 'node:path';
import os from 'node:os';
import { readdir, rm, stat } from 'node:fs/promises';
import { simpleGit, type SimpleGit } from 'simple-git';

import type {
  ContentPackage,
  ContentRef,
  ContentType,
  GitConfig,
  HealthCheckResult,
} from '../core/types.js';
import { ALL_MARKER_FILES, MARKER_TO_TYPE } from '../core/types.js';
import {
  AhubError,
  SkillNotFoundError,
} from '../core/errors.js';
import { parseContentRef, formatContentRef } from '../core/content-ref.js';
import {
  loadSkillPackage,
  saveSkillPackage,
} from '../core/skill.js';
import { assertSafeSkillName } from '../core/sanitize.js';
import type { ListOptions, StorageProvider } from './provider.js';

const TYPE_DIRS: Record<ContentType, string> = {
  skill: 'skills',
  prompt: 'prompts',
  subagent: 'subagents',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns `true` when `p` exists and is a directory. */
async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/** Returns `true` when `p` exists and is a regular file. */
async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

/**
 * Extract a human-friendly repository name from a remote URL.
 *
 * Examples:
 *   "https://github.com/user/skills.git" → "skills"
 *   "git@github.com:org/my-repo.git"     → "my-repo"
 *   "https://github.com/user/skills"     → "skills"
 */
function repoNameFromUrl(url: string): string {
  // Strip trailing ".git"
  const cleaned = url.replace(/\.git\/?$/, '');
  // Take the last path segment
  const segments = cleaned.split(/[/:]/).filter(Boolean);
  const last = segments.at(-1);
  if (!last) {
    throw new AhubError(`Cannot extract repository name from URL: ${url}`);
  }
  return last;
}

// ---------------------------------------------------------------------------
// GitProvider
// ---------------------------------------------------------------------------

export class GitProvider implements StorageProvider {
  readonly name = 'git' as const;

  private readonly repoUrl: string;
  private readonly branch: string;
  private readonly skillsDir: string;
  private readonly localRoot: string;
  private lastPullMs = 0;

  constructor(config: GitConfig) {
    this.repoUrl = config.repoUrl;
    this.branch = config.branch ?? 'main';
    this.skillsDir = config.skillsDir ?? '.';

    const repoName = repoNameFromUrl(this.repoUrl);
    this.localRoot = path.join(os.homedir(), '.ahub', 'repos', repoName);
  }

  // ── lifecycle helpers ──────────────────────────────────────────────────

  /**
   * Ensure the repository is cloned locally.
   * If the directory exists, verify it points to the correct remote.
   */
  private async ensureCloned(): Promise<SimpleGit> {
    const gitDir = path.join(this.localRoot, '.git');

    if (await isDirectory(gitDir)) {
      // Verify the existing clone points to the expected remote.
      const git = simpleGit(this.localRoot);
      const remotes = await git.getRemotes(true);
      const origin = remotes.find((r) => r.name === 'origin');

      if (!origin || origin.refs.fetch !== this.repoUrl) {
        throw new AhubError(
          `Local clone at ${this.localRoot} points to "${origin?.refs.fetch ?? '(none)'}" ` +
            `but expected "${this.repoUrl}". Remove the directory and try again.`,
        );
      }

      return git;
    }

    // Fresh clone — try with branch, fall back to default for empty repos.
    const parentGit = simpleGit();
    try {
      await parentGit.clone(this.repoUrl, this.localRoot, [
        '--branch',
        this.branch,
        '--single-branch',
      ]);
    } catch {
      // Branch might not exist yet (empty repo). Clone default branch.
      await parentGit.clone(this.repoUrl, this.localRoot);
      const clonedGit = simpleGit(this.localRoot);
      const branches = await clonedGit.branchLocal();
      if (!branches.all.includes(this.branch)) {
        await clonedGit.checkoutLocalBranch(this.branch);
      }
    }

    return simpleGit(this.localRoot);
  }

  /**
   * Pull from origin if the local clone is older than `maxAgeMs`.
   */
  private async pullIfStale(maxAgeMs = 60_000): Promise<SimpleGit> {
    const git = await this.ensureCloned();

    const now = Date.now();
    if (now - this.lastPullMs > maxAgeMs) {
      try {
        await git.pull('origin', this.branch);
      } catch (err) {
        // Warn but don't fail — stale data is better than crashing.
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('no tracking information') && !msg.includes('couldn\'t find remote ref')) {
          console.warn(`Warning: git pull failed (${msg}). Using cached data.`);
        }
      }
      this.lastPullMs = Date.now();
    }

    return git;
  }

  /** Absolute path to the skills root inside the local clone. */
  private get skillsRoot(): string {
    return this.skillsDir === '.'
      ? this.localRoot
      : path.join(this.localRoot, this.skillsDir);
  }

  private typeRoot(type: ContentType): string {
    return path.join(this.skillsRoot, TYPE_DIRS[type]);
  }

  private canonicalDir(ref: ContentRef): string {
    return path.join(this.typeRoot(ref.type), ref.name);
  }

  private legacyDir(name: string): string {
    return path.join(this.skillsRoot, name);
  }

  private normalizeRef(refOrName: string | ContentRef): ContentRef {
    const ref = typeof refOrName === 'string' ? parseContentRef(refOrName, 'skill') : refOrName;
    assertSafeSkillName(ref.name);
    return ref;
  }

  private async detectLegacyType(dirPath: string): Promise<ContentType | null> {
    for (const marker of ALL_MARKER_FILES) {
      if (await isFile(path.join(dirPath, marker))) {
        return MARKER_TO_TYPE[marker] ?? 'skill';
      }
    }
    return null;
  }

  // ── StorageProvider implementation ─────────────────────────────────────

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      const git = await this.ensureCloned();
      await git.fetch(['--dry-run']);
      return { ok: true, message: `Git repository reachable at ${this.repoUrl}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Git health check failed: ${msg}` };
    }
  }

  async list(options?: string | ListOptions): Promise<string[]> {
    const refs = await this.listContentRefs(options);
    return refs.map((ref) => formatContentRef(ref));
  }

  async listContentRefs(options?: string | ListOptions): Promise<ContentRef[]> {
    const opts = typeof options === 'string' ? { query: options } : (options ?? {});
    await this.pullIfStale();

    const refs = new Map<string, ContentRef>();

    for (const type of Object.keys(TYPE_DIRS) as ContentType[]) {
      const dirents = await readdir(this.typeRoot(type), { withFileTypes: true }).catch(() => []);
      for (const entry of dirents) {
        if (!entry.isDirectory()) continue;
        const dir = path.join(this.typeRoot(type), entry.name);
        if (!(await this.detectLegacyType(dir))) continue;
        const ref = { type, name: entry.name } satisfies ContentRef;
        refs.set(formatContentRef(ref), ref);
      }
    }

    const legacyEntries = await readdir(this.skillsRoot, { withFileTypes: true }).catch(() => []);
    for (const entry of legacyEntries) {
      if (!entry.isDirectory()) continue;
      if ((Object.values(TYPE_DIRS) as string[]).includes(entry.name)) continue;
      const dir = this.legacyDir(entry.name);
      const type = await this.detectLegacyType(dir);
      if (!type) continue;
      const ref = { type, name: entry.name } satisfies ContentRef;
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
      results = results.filter((ref) =>
        formatContentRef(ref).toLowerCase().includes(lower) || ref.name.toLowerCase().includes(lower),
      );
    }

    return results;
  }

  async exists(refOrName: string | ContentRef): Promise<boolean> {
    const ref = this.normalizeRef(refOrName);
    await this.pullIfStale();

    if (await isDirectory(this.canonicalDir(ref))) {
      return this.detectLegacyType(this.canonicalDir(ref)).then((detected) => detected === ref.type);
    }

    return this.detectLegacyType(this.legacyDir(ref.name)).then((detected) => detected === ref.type);
  }

  async get(refOrName: string | ContentRef): Promise<ContentPackage> {
    const ref = this.normalizeRef(refOrName);
    await this.pullIfStale();

    const canonicalDir = this.canonicalDir(ref);
    if (await isDirectory(canonicalDir)) {
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
    const git = await this.pullIfStale();
    const dir = this.canonicalDir(ref);

    await saveSkillPackage(dir, {
      ...pkg,
      skill: {
        ...pkg.skill,
        type: ref.type,
        name: ref.name,
      },
    });

    await git.add(dir);
    const status = await git.status();
    if (status.files.length === 0) {
      return; // nothing changed
    }
    await git.commit(`Update content: ${formatContentRef(ref)}`);
    try {
      await git.push('origin', this.branch);
    } catch {
      // First push — set upstream.
      await git.push('origin', this.branch, ['--set-upstream']);
    }
  }

  async delete(refOrName: string | ContentRef): Promise<void> {
    const ref = this.normalizeRef(refOrName);
    const git = await this.pullIfStale();
    let dir = this.canonicalDir(ref);

    if (!(await isDirectory(dir))) {
      const legacyDir = this.legacyDir(ref.name);
      const detectedType = await this.detectLegacyType(legacyDir);
      if (detectedType !== ref.type) {
        throw new SkillNotFoundError(formatContentRef(ref));
      }
      dir = legacyDir;
    }

    await rm(dir, { recursive: true, force: true });
    await git.add(['-A', dir]);
    await git.commit(`Remove content: ${formatContentRef(ref)}`);
    try {
      await git.push('origin', this.branch);
    } catch {
      // First push — set upstream.
      await git.push('origin', this.branch, ['--set-upstream']);
    }
  }

  async *exportAll(): AsyncIterable<ContentPackage> {
    const refs = await this.listContentRefs();
    for (const ref of refs) {
      yield await this.get(ref);
    }
  }
}
