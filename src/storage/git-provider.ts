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
  ContentType,
  GitConfig,
  HealthCheckResult,
  SkillPackage,
} from '../core/types.js';
import { ALL_MARKER_FILES, MARKER_TO_TYPE } from '../core/types.js';
import {
  AhubError,
  SkillNotFoundError,
} from '../core/errors.js';
import {
  loadSkillPackage,
  saveSkillPackage,
} from '../core/skill.js';
import { assertSafeSkillName } from '../core/sanitize.js';
import type { ListOptions, StorageProvider } from './provider.js';

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

  /** Absolute path to a specific skill directory. */
  private skillDir(name: string): string {
    return path.join(this.skillsRoot, name);
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
    const opts = typeof options === 'string' ? { query: options } : (options ?? {});
    await this.pullIfStale();

    let entries: string[];
    try {
      const dirents = await readdir(this.skillsRoot, { withFileTypes: true });
      entries = dirents
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      return [];
    }

    // Keep only directories that contain a known marker file.
    const skills: string[] = [];
    for (const name of entries) {
      const dir = this.skillDir(name);
      let detectedType: ContentType | null = null;

      for (const marker of ALL_MARKER_FILES) {
        if (await isFile(path.join(dir, marker))) {
          detectedType = MARKER_TO_TYPE[marker] ?? 'skill';
          break;
        }
      }

      if (detectedType === null) continue;
      if (opts.type && detectedType !== opts.type) continue;

      skills.push(name);
    }

    if (opts.query) {
      const lower = opts.query.toLowerCase();
      return skills.filter((s) => s.toLowerCase().includes(lower));
    }

    return skills.sort();
  }

  async exists(name: string): Promise<boolean> {
    await this.pullIfStale();
    const dir = this.skillDir(name);

    // Check for any known marker file.
    for (const marker of ALL_MARKER_FILES) {
      if (await isFile(path.join(dir, marker))) {
        return true;
      }
    }

    return false;
  }

  async get(name: string): Promise<SkillPackage> {
    assertSafeSkillName(name);
    await this.pullIfStale();

    const dir = this.skillDir(name);
    if (!(await this.exists(name))) {
      throw new SkillNotFoundError(name);
    }

    return loadSkillPackage(dir);
  }

  async put(pkg: SkillPackage): Promise<void> {
    assertSafeSkillName(pkg.skill.name);
    const git = await this.pullIfStale();
    const dir = this.skillDir(pkg.skill.name);

    await saveSkillPackage(dir, pkg);

    await git.add(dir);
    const status = await git.status();
    if (status.files.length === 0) {
      return; // nothing changed
    }
    await git.commit(`Update skill: ${pkg.skill.name}`);
    try {
      await git.push('origin', this.branch);
    } catch {
      // First push — set upstream.
      await git.push('origin', this.branch, ['--set-upstream']);
    }
  }

  async delete(name: string): Promise<void> {
    assertSafeSkillName(name);
    const git = await this.pullIfStale();
    const dir = this.skillDir(name);

    if (!(await isDirectory(dir))) {
      throw new SkillNotFoundError(name);
    }

    await rm(dir, { recursive: true, force: true });
    await git.add(['-A', dir]);
    await git.commit(`Remove skill: ${name}`);
    try {
      await git.push('origin', this.branch);
    } catch {
      // First push — set upstream.
      await git.push('origin', this.branch, ['--set-upstream']);
    }
  }

  async *exportAll(): AsyncIterable<SkillPackage> {
    const names = await this.list();
    for (const name of names) {
      yield await this.get(name);
    }
  }
}
