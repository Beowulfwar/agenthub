/**
 * CursorDeployer — deploys skills as Cursor rule files.
 *
 * Target layout:
 *   .cursor/rules/<skill-name>.md
 *
 * The file content is the SKILL.md body **without** the YAML
 * frontmatter, so Cursor only sees the Markdown instructions.
 * Unlike Claude Code, the base directory defaults to the *current
 * working directory* rather than the user's home.
 */

import { mkdir, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import type { DeployTarget, SkillPackage } from '../core/types.js';
import type { Deployer } from './deployer.js';
import { assertSafeSkillName } from '../core/sanitize.js';

export class CursorDeployer implements Deployer {
  readonly target: DeployTarget = 'cursor';
  private readonly basePath: string;

  /**
   * @param customPath - Override the default deploy directory.
   *   Falls back to `<cwd>/.cursor/rules`.
   */
  constructor(customPath?: string) {
    this.basePath =
      customPath ?? path.join(process.cwd(), '.cursor', 'rules');
  }

  async deploy(pkg: SkillPackage): Promise<string> {
    assertSafeSkillName(pkg.skill.name);
    await mkdir(this.basePath, { recursive: true });

    const fileName = `${pkg.skill.name}.md`;
    const filePath = path.join(this.basePath, fileName);

    // Extract body without frontmatter.
    // If the package was loaded normally, `skill.body` is already
    // stripped; but if someone passes raw SKILL.md content in the
    // files array we strip it defensively.
    const body = pkg.skill.body;
    await writeFile(filePath, body + '\n', 'utf-8');

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
