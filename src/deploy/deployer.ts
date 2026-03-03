/**
 * Deployer interface — the contract for all deployment targets.
 *
 * Each deployer knows how to install (deploy) and remove (undeploy)
 * a skill package in its target environment.
 */

import type { DeployTarget, SkillPackage } from '../core/types.js';

/**
 * Read-write contract that every deployment target must fulfil.
 */
export interface Deployer {
  /** Which target this deployer handles. */
  readonly target: DeployTarget;

  /**
   * Deploy a skill package to the target.
   *
   * @param pkg - The skill package to deploy.
   * @returns The absolute path where the skill was deployed.
   */
  deploy(pkg: SkillPackage): Promise<string>;

  /**
   * Remove a previously deployed skill from the target.
   *
   * @param name - The skill name to undeploy.
   */
  undeploy(name: string): Promise<void>;
}

/**
 * Create the correct deployer for a given target.
 *
 * Lazy-imports the concrete deployer class so callers only pay the cost
 * of the backend they actually use.
 */
export async function createDeployer(
  target: DeployTarget,
  customPath?: string,
): Promise<Deployer> {
  switch (target) {
    case 'claude-code': {
      const { ClaudeCodeDeployer } = await import('./claude-code.js');
      return new ClaudeCodeDeployer(customPath);
    }
    case 'codex': {
      const { CodexDeployer } = await import('./codex.js');
      return new CodexDeployer(customPath);
    }
    case 'cursor': {
      const { CursorDeployer } = await import('./cursor.js');
      return new CursorDeployer(customPath);
    }
    default:
      throw new Error(`Unknown deploy target: ${target as string}`);
  }
}
