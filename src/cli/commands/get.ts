/**
 * `ahub get <name>` — Fetch a skill from the store and cache it locally.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'node:path';
import os from 'node:os';
import { requireConfig } from '../../core/config.js';
import { createProvider, createProviderFromSource } from '../../storage/factory.js';
import { CacheManager } from '../../core/cache.js';

export function createGetCommand(): Command {
  return new Command('get')
    .description('Fetch a skill by name and cache it locally')
    .argument('<name>', 'Skill name to retrieve')
    .option('-s, --source <id>', 'Fetch from this source')
    .action(async (name: string, opts: { source?: string }) => {
      try {
        await runGet(name, opts.source);
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

async function runGet(name: string, sourceId?: string): Promise<void> {
  const config = await requireConfig();

  let provider;
  if (sourceId && config.version === 2 && config.sources) {
    const src = config.sources.find((s) => s.id === sourceId);
    if (!src) throw new Error(`Source "${sourceId}" not found.`);
    provider = createProviderFromSource(src);
  } else {
    provider = createProvider(config);
  }

  const spinner = ora(`Fetching skill "${name}"...`).start();
  const pkg = await provider.get(name);
  spinner.succeed(`Fetched "${name}"`);

  // Cache every file to disk via CacheManager.
  const cache = new CacheManager();
  await cache.cacheSkill(pkg);

  // Print info.
  console.log('');
  console.log(chalk.bold(`── ${pkg.skill.name} ──`));
  if (pkg.skill.type && pkg.skill.type !== 'skill') {
    console.log(chalk.cyan(`Type: ${pkg.skill.type}`));
  }
  if (pkg.skill.description) {
    console.log(chalk.dim(pkg.skill.description));
  }
  console.log('');
  console.log(pkg.skill.body);
  console.log('');
  console.log(chalk.dim(`Cached at: ${path.join(os.homedir(), '.ahub', 'cache', pkg.skill.name)}`));
}
