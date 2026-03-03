/**
 * CodexDeployer — deploys skills as full Codex skill packages.
 *
 * Target layout:
 *   ~/.codex/skills/<skill-name>/
 *     SKILL.md
 *     agents/
 *     scripts/
 *     references/
 *     ...
 *
 * Every file from the {@link SkillPackage} is copied into the directory.
 */

import { mkdir, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { DeployTarget, SkillPackage } from '../core/types.js';
import type { Deployer } from './deployer.js';

export class CodexDeployer implements Deployer {
  readonly target: DeployTarget = 'codex';
  private readonly basePath: string;

  /**
   * @param customPath - Override the default deploy directory.
   *   Falls back to `~/.codex/skills`.
   */
  constructor(customPath?: string) {
    this.basePath =
      customPath ?? path.join(os.homedir(), '.codex', 'skills');
  }

  async deploy(pkg: SkillPackage): Promise<string> {
    const skillDir = path.join(this.basePath, pkg.skill.name);

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
      const filePath = path.join(skillDir, file.relativePath);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, file.content, 'utf-8');
    }

    return skillDir;
  }

  async undeploy(name: string): Promise<void> {
    const skillDir = path.join(this.basePath, name);

    try {
      await access(skillDir);
    } catch {
      // Directory does not exist — nothing to remove.
      return;
    }

    await rm(skillDir, { recursive: true, force: true });
  }
}
