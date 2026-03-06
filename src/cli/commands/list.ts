/**
 * `ahub list` — List all skills available in the configured storage backend.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { requireConfig } from '../../core/config.js';
import { createProvider, createProviderFromSource } from '../../storage/factory.js';
import type { ContentType } from '../../core/types.js';

export function createListCommand(): Command {
  return new Command('list')
    .alias('ls')
    .description('List all available skills')
    .option('-s, --source <id>', 'Only list skills from this source')
    .option('-T, --type <type>', 'Filter by content type (skill, prompt, subagent)')
    .action(async (opts: { source?: string; type?: string }) => {
      try {
        await runList(opts.source, opts.type as ContentType | undefined);
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

async function runList(sourceId?: string, type?: ContentType): Promise<void> {
  const config = await requireConfig();

  let provider;
  if (sourceId && config.version === 2 && config.sources) {
    const src = config.sources.find((s) => s.id === sourceId);
    if (!src) throw new Error(`Source "${sourceId}" not found.`);
    provider = createProviderFromSource(src);
  } else {
    provider = createProvider(config);
  }

  const spinner = ora('Loading skills...').start();
  const names = await provider.list(type ? { type } : undefined);
  spinner.stop();

  if (names.length === 0) {
    const suffix = type ? ` of type "${type}"` : '';
    console.log(chalk.yellow(`No skills found${suffix} in the store.`));
    return;
  }

  // Formatted table output.
  const header = type ? `  #  ${type.charAt(0).toUpperCase() + type.slice(1)} Name` : '  #  Skill Name';
  console.log('');
  console.log(chalk.bold(header));
  console.log(chalk.dim('  ' + '─'.repeat(40)));

  for (let i = 0; i < names.length; i++) {
    const idx = String(i + 1).padStart(3, ' ');
    console.log(`  ${chalk.dim(idx)}  ${names[i]}`);
  }

  console.log('');
  console.log(chalk.dim(`  ${names.length} item(s) total`));
}
