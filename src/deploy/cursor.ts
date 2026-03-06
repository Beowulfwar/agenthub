/**
 * CursorDeployer — deploys content as Cursor rule/prompt/agent files.
 *
 * Target layout (type-aware):
 *   skill    → <cwd>/.cursor/rules/<name>.md
 *   prompt   → <cwd>/.cursor/prompts/<name>.md
 *   subagent → <cwd>/.cursor/agents/<name>.md
 *
 * The file content is the marker body (Markdown content after the YAML
 * frontmatter). Unlike Claude Code, the base directory defaults to the
 * *current working directory* rather than the user's home.
 */

import { mkdir, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import type { ContentType, DeployTarget, SkillPackage } from '../core/types.js';
import type { Deployer } from './deployer.js';
import { assertSafeSkillName } from '../core/sanitize.js';

/** Map content type → Cursor subdirectory name. */
const TYPE_SUBDIRS: Record<ContentType, string> = {
  skill: 'rules',
  prompt: 'prompts',
  subagent: 'agents',
};

export class CursorDeployer implements Deployer {
  readonly target: DeployTarget = 'cursor';
  private readonly customPath: string | undefined;
  private readonly defaultRoot: string;

  /**
   * @param customPath - Override the default deploy directory.
   *   Falls back to `<cwd>/.cursor/<subdir>` based on content type.
   */
  constructor(customPath?: string) {
    this.customPath = customPath;
    this.defaultRoot = path.join(process.cwd(), '.cursor');
  }

  private usesExactSubdir(): boolean {
    if (!this.customPath) return false;
    return Object.values(TYPE_SUBDIRS).includes(path.basename(this.customPath) as ContentType);
  }

  /** Resolve the deploy directory based on content type. */
  private resolveDir(type?: ContentType): string {
    const subdir = TYPE_SUBDIRS[type ?? 'skill'];
    if (this.customPath) {
      return this.usesExactSubdir()
        ? this.customPath
        : path.join(this.customPath, subdir);
    }
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
      const baseDir = this.customPath
        ? (this.usesExactSubdir() ? this.customPath : path.join(this.customPath, subdir))
        : path.join(this.defaultRoot, subdir);
      const filePath = path.join(baseDir, `${name}.md`);
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
