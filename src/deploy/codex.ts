/**
 * CodexDeployer — deploys content as full Codex packages.
 *
 * Target layout (type-aware):
 *   skill    → ~/.codex/skills/<name>/
 *   prompt   → ~/.codex/prompts/<name>/
 *   subagent → ~/.codex/agents/<name>/
 *
 * Every file from the {@link SkillPackage} is copied into the directory.
 */

import { mkdir, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { ContentType, DeployTarget, SkillPackage } from '../core/types.js';
import type { Deployer } from './deployer.js';
import { assertSafeRelativePath, assertSafeSkillName } from '../core/sanitize.js';

/** Map content type → Codex subdirectory name. */
const TYPE_SUBDIRS: Record<ContentType, string> = {
  skill: 'skills',
  prompt: 'prompts',
  subagent: 'agents',
};

export class CodexDeployer implements Deployer {
  readonly target: DeployTarget = 'codex';
  private readonly customPath: string | undefined;
  private readonly defaultRoot: string;

  /**
   * @param customPath - Override the default deploy directory.
   *   Falls back to `~/.codex/<subdir>` based on content type.
   */
  constructor(customPath?: string) {
    this.customPath = customPath;
    this.defaultRoot = path.join(os.homedir(), '.codex');
  }

  /** Resolve the deploy directory based on content type. */
  private resolveDir(type?: ContentType): string {
    if (this.customPath) return this.customPath;
    const subdir = TYPE_SUBDIRS[type ?? 'skill'];
    return path.join(this.defaultRoot, subdir);
  }

  async deploy(pkg: SkillPackage): Promise<string> {
    assertSafeSkillName(pkg.skill.name);
    const basePath = this.resolveDir(pkg.skill.type);
    const skillDir = path.join(basePath, pkg.skill.name);

    // Remove existing directory to ensure a clean deploy.
    try {
      await access(skillDir);
      await rm(skillDir, { recursive: true, force: true });
    } catch {
      // Directory does not exist yet — fine.
    }

    await mkdir(skillDir, { recursive: true });

    // Write every file in the package.
    for (const file of pkg.files) {
      assertSafeRelativePath(file.relativePath);
      const filePath = path.join(skillDir, file.relativePath);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, file.content, 'utf-8');
    }

    return skillDir;
  }

  async undeploy(name: string): Promise<void> {
    // Check all type subdirectories since we don't know the type.
    for (const subdir of Object.values(TYPE_SUBDIRS)) {
      const skillDir = path.join(this.customPath ?? path.join(this.defaultRoot, subdir), name);
      try {
        await access(skillDir);
        await rm(skillDir, { recursive: true, force: true });
        return;
      } catch {
        // Not in this subdir, try next.
      }
    }
  }
}
