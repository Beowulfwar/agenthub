/**
 * `ahub info <name>` — Display detailed stats and metadata for a skill.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { requireConfig } from '../../core/config.js';
import { createProvider, createProviderFromSource } from '../../storage/factory.js';
import { extractSkillExtensions } from '../../core/skill.js';
import { getSkillStats, formatBytes } from '../../core/stats.js';

export function createInfoCommand(): Command {
  return new Command('info')
    .description('Display detailed stats and metadata for a skill')
    .argument('<name>', 'Skill name')
    .option('-s, --source <id>', 'Fetch from this source')
    .option('--json', 'Output as JSON')
    .action(async (name: string, opts: { source?: string; json?: boolean }) => {
      try {
        await runInfo(name, opts.source, opts.json);
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

async function runInfo(
  name: string,
  sourceId?: string,
  json?: boolean,
): Promise<void> {
  const config = await requireConfig();

  let provider;
  if (sourceId && config.version === 2 && config.sources) {
    const src = config.sources.find((s) => s.id === sourceId);
    if (!src) throw new Error(`Source "${sourceId}" not found.`);
    provider = createProviderFromSource(src);
  } else {
    provider = createProvider(config);
  }

  const spinner = ora(`Fetching "${name}"...`).start();
  const pkg = await provider.get(name);
  spinner.succeed(`Fetched "${name}"`);

  const stats = getSkillStats(pkg);
  const ext = extractSkillExtensions(pkg.skill);

  if (json) {
    const { type: statsType, ...restStats } = stats;
    console.log(
      JSON.stringify(
        {
          name: pkg.skill.name,
          type: statsType,
          description: pkg.skill.description,
          ...restStats,
          tags: ext.tags ?? [],
          category: ext.category ?? null,
          targets: ext.targets ?? [],
        },
        null,
        2,
      ),
    );
    return;
  }

  // Pretty-print.
  console.log('');
  console.log(chalk.bold(`── ${pkg.skill.name} ──`));
  console.log('');
  console.log(`  ${chalk.dim('Type:')}         ${stats.type}`);
  console.log(`  ${chalk.dim('Description:')}  ${pkg.skill.description}`);
  console.log(`  ${chalk.dim('Words:')}        ${stats.wordCount.toLocaleString()}`);
  console.log(`  ${chalk.dim('Lines:')}        ${stats.lineCount.toLocaleString()}`);
  console.log(`  ${chalk.dim('Characters:')}   ${stats.charCount.toLocaleString()}`);

  const fileList = pkg.files.map((f) => f.relativePath).join(', ');
  console.log(`  ${chalk.dim('Files:')}        ${stats.fileCount} (${fileList})`);
  console.log(`  ${chalk.dim('Total size:')}   ${formatBytes(stats.totalBytes)}`);

  if (ext.tags && ext.tags.length > 0) {
    console.log(`  ${chalk.dim('Tags:')}         ${ext.tags.join(', ')}`);
  }
  if (ext.category) {
    console.log(`  ${chalk.dim('Category:')}     ${ext.category}`);
  }
  if (ext.targets && ext.targets.length > 0) {
    console.log(`  ${chalk.dim('Targets:')}      ${ext.targets.join(', ')}`);
  }
  console.log('');
}
