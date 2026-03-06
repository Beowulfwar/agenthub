/**
 * `ahub push <path>` — Push a local skill directory to the remote store.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { requireConfig } from '../../core/config.js';
import { createProvider, createProviderFromSource } from '../../storage/factory.js';
import { loadSkillPackage, validateSkill } from '../../core/skill.js';
import { assertSafePackage } from '../../core/sanitize.js';

export function createPushCommand(): Command {
  return new Command('push')
    .description('Push a local skill directory to the store')
    .argument('<path>', 'Path to the skill directory (must contain SKILL.md)')
    .option('-s, --source <id>', 'Push to this source')
    .action(async (dirPath: string, opts: { source?: string }) => {
      try {
        await runPush(dirPath, opts.source);
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

async function runPush(dirPath: string, sourceId?: string): Promise<void> {
  // Load and validate.
  const spinner = ora('Loading skill package...').start();
  const pkg = await loadSkillPackage(dirPath);
  spinner.succeed(`Loaded "${pkg.skill.name}"`);

  // Validate skill fields and path safety (C3/C4/I5).
  validateSkill(pkg.skill);
  assertSafePackage(pkg);

  // Push to remote.
  const config = await requireConfig();

  let provider;
  if (sourceId && config.version === 2 && config.sources) {
    const src = config.sources.find((s) => s.id === sourceId);
    if (!src) throw new Error(`Source "${sourceId}" not found.`);
    provider = createProviderFromSource(src);
  } else {
    provider = createProvider(config);
  }

  const pushSpinner = ora(
    `Pushing "${pkg.skill.name}" to ${provider.name}...`,
  ).start();
  await provider.put(pkg);
  pushSpinner.succeed(
    `Pushed "${pkg.skill.name}" (${pkg.files.length} file(s))`,
  );
}
