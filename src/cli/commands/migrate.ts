/**
 * `ahub migrate --to <git|drive> [--repo <url>]`
 *
 * Migrate all skills from the current provider to a new one.
 * Updates the configuration to point to the new provider after success.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { requireConfig, saveConfig } from '../../core/config.js';
import { createProvider } from '../../storage/factory.js';
import type { AhubConfig } from '../../core/types.js';
import type { StorageProvider } from '../../storage/provider.js';

export function createMigrateCommand(): Command {
  return new Command('migrate')
    .description('Migrate all skills to a different storage provider')
    .requiredOption('--to <provider>', 'Target provider: git or drive')
    .option('-r, --repo <url>', 'Git repository URL (when migrating to git)')
    .action(async (opts: { to: string; repo?: string }) => {
      try {
        await runMigrate(opts);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Error: ${msg}`));
        process.exitCode = 1;
      }
    });
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

async function runMigrate(opts: { to: string; repo?: string }): Promise<void> {
  const targetProvider = opts.to as 'git' | 'drive';
  if (targetProvider !== 'git' && targetProvider !== 'drive') {
    throw new Error(
      `Invalid target provider "${opts.to}". Expected "git" or "drive".`,
    );
  }

  const srcConfig = await requireConfig();

  if (srcConfig.provider === targetProvider) {
    console.log(
      chalk.yellow(
        `Already using "${targetProvider}" — nothing to migrate.`,
      ),
    );
    return;
  }

  // Build destination config.
  const destConfig = await buildDestConfig(targetProvider, opts.repo);

  // Create providers.
  const source = createProvider(srcConfig);
  const dest = createProvider(destConfig);

  // Confirm.
  const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
    {
      type: 'confirm',
      name: 'proceed',
      message: `Migrate all skills from ${source.name} to ${dest.name}?`,
      default: true,
    },
  ]);

  if (!proceed) {
    console.log(chalk.yellow('Aborted.'));
    return;
  }

  // Stream skills from source to destination.
  const spinner = ora('Migrating skills...').start();
  let count = 0;

  for await (const pkg of source.exportAll()) {
    spinner.text = `Migrating "${pkg.skill.name}" (${count + 1})...`;
    await dest.put(pkg);
    count++;
  }

  spinner.succeed(`Migrated ${count} skill(s) from ${source.name} to ${dest.name}`);

  // Update config.
  await saveConfig(destConfig);
  console.log(chalk.green('Configuration updated to use the new provider.'));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buildDestConfig(
  provider: 'git' | 'drive',
  repoUrlArg?: string,
): Promise<AhubConfig> {
  if (provider === 'git') {
    let repoUrl: string;
    if (!repoUrlArg) {
      const answer = await inquirer.prompt<{ repoUrl: string }>([
        {
          type: 'input',
          name: 'repoUrl',
          message: 'Git repository URL for destination:',
          validate: (v: string) =>
            v.trim().length > 0 || 'Repository URL is required.',
        },
      ]);
      repoUrl = answer.repoUrl.trim();
    } else {
      repoUrl = repoUrlArg;
    }
    return {
      provider: 'git',
      git: { repoUrl, branch: 'main', skillsDir: '.' },
    };
  }

  // Drive.
  const { folderId } = await inquirer.prompt<{ folderId: string }>([
    {
      type: 'input',
      name: 'folderId',
      message: 'Google Drive folder ID for destination:',
      default: 'ahub-store',
    },
  ]);
  return {
    provider: 'drive',
    drive: { folderId },
  };
}
