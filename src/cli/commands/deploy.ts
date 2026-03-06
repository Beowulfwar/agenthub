/**
 * `ahub deploy <name> --target <target> [--all]`
 *
 * Deploy one or all skills from the store to a supported IDE target
 * (claude-code, codex, cursor).
 */

import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { requireConfig, resolveDeployTargetRoot } from '../../core/config.js';
import { findWorkspaceManifest } from '../../core/workspace.js';
import { createProvider, createProviderFromSource } from '../../storage/factory.js';
import { createDeployer } from '../../deploy/deployer.js';
import type { ContentType, DeployTarget } from '../../core/types.js';

const VALID_TARGETS: DeployTarget[] = ['claude-code', 'codex', 'cursor'];

export function createDeployCommand(): Command {
  return new Command('deploy')
    .description('Deploy skill(s) to an IDE target')
    .argument('[name]', 'Skill name to deploy (required unless --all)')
    .requiredOption(
      '-t, --target <target>',
      `Deployment target: ${VALID_TARGETS.join(', ')}`,
    )
    .option('-a, --all', 'Deploy all skills in the store')
    .option('-s, --source <id>', 'Deploy from this source')
    .option('-T, --type <type>', 'Filter by content type when using --all (skill, prompt, subagent)')
    .action(
      async (
        name: string | undefined,
        opts: { target: string; all?: boolean; source?: string; type?: string },
      ) => {
        try {
          await runDeploy(name, opts);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(chalk.red(`Error: ${msg}`));
          process.exitCode = 1;
        }
      },
    );
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

async function runDeploy(
  name: string | undefined,
  opts: { target: string; all?: boolean; source?: string; type?: string },
): Promise<void> {
  // Support comma-separated targets (e.g. "claude-code,cursor").
  const targets = opts.target.split(',').map((t) => t.trim()) as DeployTarget[];
  for (const t of targets) {
    if (!VALID_TARGETS.includes(t)) {
      throw new Error(
        `Invalid target "${t}". Valid targets: ${VALID_TARGETS.join(', ')}`,
      );
    }
  }

  if (!opts.all && !name) {
    throw new Error(
      'Provide a skill name or use --all to deploy every skill.',
    );
  }

  const config = await requireConfig();
  const manifestPath = await findWorkspaceManifest();
  const workspaceDir = manifestPath ? path.dirname(manifestPath) : process.cwd();

  let provider;
  if (opts.source && config.version === 2 && config.sources) {
    const src = config.sources.find((s) => s.id === opts.source);
    if (!src) throw new Error(`Source "${opts.source}" not found.`);
    provider = createProviderFromSource(src);
  } else {
    provider = createProvider(config);
  }

  const typeFilter = opts.type as ContentType | undefined;

  for (const target of targets) {
    const deployRoot = resolveDeployTargetRoot(target, config, workspaceDir);
    const deployer = await createDeployer(target, deployRoot);

    if (opts.all) {
      await deployAll(provider, deployer, target, typeFilter);
    } else {
      await deploySingle(name!, provider, deployer, target);
    }
  }
}

async function deploySingle(
  name: string,
  provider: ReturnType<typeof createProvider> extends infer P ? P : never,
  deployer: Awaited<ReturnType<typeof createDeployer>>,
  target: DeployTarget,
): Promise<void> {
  const spinner = ora(`Deploying "${name}" to ${target}...`).start();

  const pkg = await provider.get(name);
  const deployedPath = await deployer.deploy(pkg);

  spinner.succeed(`Deployed "${name}" to ${target}`);
  console.log(chalk.dim(`  -> ${deployedPath}`));
}

async function deployAll(
  provider: ReturnType<typeof createProvider> extends infer P ? P : never,
  deployer: Awaited<ReturnType<typeof createDeployer>>,
  target: DeployTarget,
  typeFilter?: ContentType,
): Promise<void> {
  const spinner = ora(`Loading skills for deployment to ${target}...`).start();
  const names = await provider.list(typeFilter ? { type: typeFilter } : undefined);
  spinner.text = `Deploying ${names.length} skill(s) to ${target}...`;

  let deployed = 0;
  for (const name of names) {
    spinner.text = `[${deployed + 1}/${names.length}] Deploying "${name}"...`;
    const pkg = await provider.get(name);
    await deployer.deploy(pkg);
    deployed++;
  }

  spinner.succeed(`Deployed ${deployed} skill(s) to ${target}`);
}
