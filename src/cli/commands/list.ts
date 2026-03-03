/**
 * `ahub list` — List all skills available in the configured storage backend.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { requireConfig } from '../../core/config.js';
import { createProvider } from '../../storage/factory.js';

export function createListCommand(): Command {
  return new Command('list')
    .alias('ls')
    .description('List all available skills')
    .action(async () => {
      try {
        await runList();
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

async function runList(): Promise<void> {
  const config = await requireConfig();
  const provider = createProvider(config);

  const spinner = ora('Loading skills...').start();
  const names = await provider.list();
  spinner.stop();

  if (names.length === 0) {
    console.log(chalk.yellow('No skills found in the store.'));
    return;
  }

  // Formatted table output.
  console.log('');
  console.log(chalk.bold('  #  Skill Name'));
  console.log(chalk.dim('  ' + '─'.repeat(40)));

  for (let i = 0; i < names.length; i++) {
    const idx = String(i + 1).padStart(3, ' ');
    console.log(`  ${chalk.dim(idx)}  ${names[i]}`);
  }

  console.log('');
  console.log(chalk.dim(`  ${names.length} skill(s) total`));
}
