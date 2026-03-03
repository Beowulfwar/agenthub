/**
 * `ahub deploy <name> --target <target> [--all]`
 *
 * Deploy one or all skills from the store to a supported IDE target
 * (claude-code, codex, cursor).
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { requireConfig } from '../../core/config.js';
import { createProvider } from '../../storage/factory.js';
import { createDeployer } from '../../deploy/deployer.js';
import type { DeployTarget } from '../../core/types.js';

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
    .action(
      async (
        name: string | undefined,
        opts: { target: string; all?: boolean },
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
  opts: { target: string; all?: boolean },
): Promise<void> {
  const target = opts.target as DeployTarget;
  if (!VALID_TARGETS.includes(target)) {
    throw new Error(
      `Invalid target "${opts.target}". Valid targets: ${VALID_TARGETS.join(', ')}`,
    );
  }

  if (!opts.all && !name) {
    throw new Error(
      'Provide a skill name or use --all to deploy every skill.',
    );
  }

  const config = await requireConfig();
  const provider = createProvider(config);
  const customPath = config.deployTargets?.[target];
  const deployer = await createDeployer(target, customPath);

  if (opts.all) {
    await deployAll(provider, deployer, target);
  } else {
    await deploySingle(name!, provider, deployer, target);
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
): Promise<void> {
  const spinner = ora(`Loading skills for deployment to ${target}...`).start();
  const names = await provider.list();
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
