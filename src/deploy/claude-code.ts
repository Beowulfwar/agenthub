/**
 * ClaudeCodeDeployer — deploys content as Claude Code files.
 *
 * Target layout (type-aware):
 *   skill    → ~/.claude/commands/<name>.md
 *   prompt   → ~/.claude/prompts/<name>.md
 *   subagent → ~/.claude/agents/<name>.md
 *
 * The file content is the marker body (Markdown content
 * after the YAML frontmatter).
 */

import { mkdir, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { ContentType, DeployTarget, SkillPackage } from '../core/types.js';
import type { Deployer } from './deployer.js';
import { assertSafeSkillName } from '../core/sanitize.js';

/** Map content type → Claude Code subdirectory name. */
const TYPE_SUBDIRS: Record<ContentType, string> = {
  skill: 'commands',
  prompt: 'prompts',
  subagent: 'agents',
};

export class ClaudeCodeDeployer implements Deployer {
  readonly target: DeployTarget = 'claude-code';
  private readonly customPath: string | undefined;
  private readonly defaultRoot: string;

  /**
   * @param customPath - Override the default deploy directory.
   *   Falls back to `~/.claude/<subdir>` based on content type.
   */
  constructor(customPath?: string) {
    this.customPath = customPath;
    this.defaultRoot = path.join(os.homedir(), '.claude');
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
    await mkdir(basePath, { recursive: true });

    const fileName = `${pkg.skill.name}.md`;
    const filePath = path.join(basePath, fileName);

    // Write the Markdown body (without YAML frontmatter).
    await writeFile(filePath, pkg.skill.body + '\n', 'utf-8');

    return filePath;
  }

  async undeploy(name: string): Promise<void> {
    // Check all type subdirectories since we don't know the type.
    for (const subdir of Object.values(TYPE_SUBDIRS)) {
      const filePath = path.join(this.customPath ?? path.join(this.defaultRoot, subdir), `${name}.md`);
      try {
        await access(filePath);
        await rm(filePath);
        return;
      } catch {
        // Not in this subdir, try next.
      }
    }
  }
}
