/**
 * `ahub get <name>` — Fetch a skill from the store and cache it locally.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'node:path';
import os from 'node:os';
import { requireConfig } from '../../core/config.js';
import { createProvider } from '../../storage/factory.js';
import { CacheManager } from '../../core/cache.js';

export function createGetCommand(): Command {
  return new Command('get')
    .description('Fetch a skill by name and cache it locally')
    .argument('<name>', 'Skill name to retrieve')
    .action(async (name: string) => {
      try {
        await runGet(name);
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

async function runGet(name: string): Promise<void> {
  const config = await requireConfig();
  const provider = createProvider(config);

  const spinner = ora(`Fetching skill "${name}"...`).start();
  const pkg = await provider.get(name);
  spinner.succeed(`Fetched "${name}"`);

  // Cache every file to disk via CacheManager.
  const cache = new CacheManager();
  await cache.cacheSkill(pkg);

  // Print the SKILL.md body.
  console.log('');
  console.log(chalk.bold(`── ${pkg.skill.name} ──`));
  if (pkg.skill.description) {
    console.log(chalk.dim(pkg.skill.description));
  }
  console.log('');
  console.log(pkg.skill.body);
  console.log('');
  console.log(chalk.dim(`Cached at: ${path.join(os.homedir(), '.ahub', 'cache', pkg.skill.name)}`));
}
