/**
 * ClaudeCodeDeployer — deploys skills as Claude Code command files.
 *
 * Target layout:
 *   ~/.claude/commands/<skill-name>.md
 *
 * The file content is the full SKILL.md body (Markdown content
 * after the YAML frontmatter).
 */

import { mkdir, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { DeployTarget, SkillPackage } from '../core/types.js';
import type { Deployer } from './deployer.js';

export class ClaudeCodeDeployer implements Deployer {
  readonly target: DeployTarget = 'claude-code';
  private readonly basePath: string;

  /**
   * @param customPath - Override the default deploy directory.
   *   Falls back to `~/.claude/commands`.
   */
  constructor(customPath?: string) {
    this.basePath =
      customPath ?? path.join(os.homedir(), '.claude', 'commands');
  }

  async deploy(pkg: SkillPackage): Promise<string> {
    await mkdir(this.basePath, { recursive: true });

    const fileName = `${pkg.skill.name}.md`;
    const filePath = path.join(this.basePath, fileName);

    // Write the Markdown body (without YAML frontmatter).
    await writeFile(filePath, pkg.skill.body + '\n', 'utf-8');

    return filePath;
  }

  async undeploy(name: string): Promise<void> {
    const filePath = path.join(this.basePath, `${name}.md`);

    try {
      await access(filePath);
    } catch {
      // File does not exist — nothing to remove.
      return;
    }

    await rm(filePath);
  }
}
