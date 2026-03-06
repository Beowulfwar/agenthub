/**
 * `ahub copy <name>` — Copy skill content to the system clipboard.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { requireConfig } from '../../core/config.js';
import { createProvider, createProviderFromSource } from '../../storage/factory.js';
import { serializeSkill } from '../../core/skill.js';
import { copyToClipboard } from '../../core/clipboard.js';

type CopyField = 'body' | 'description' | 'frontmatter';

export function createCopyCommand(): Command {
  return new Command('copy')
    .description('Copy skill content to the system clipboard')
    .argument('<name>', 'Skill name to copy')
    .option('-s, --source <id>', 'Fetch from this source')
    .option(
      '-f, --field <field>',
      'Which field to copy: body (default), description, frontmatter',
      'body',
    )
    .action(
      async (name: string, opts: { source?: string; field?: string }) => {
        try {
          await runCopy(name, opts.source, opts.field as CopyField);
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

async function runCopy(
  name: string,
  sourceId?: string,
  field: CopyField = 'body',
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

  let text: string;
  let label: string;

  switch (field) {
    case 'description':
      text = pkg.skill.description;
      label = 'description';
      break;
    case 'frontmatter':
      text = serializeSkill(pkg.skill);
      label = 'frontmatter + body';
      break;
    case 'body':
    default:
      text = pkg.skill.body;
      label = 'body';
      break;
  }

  await copyToClipboard(text);

  console.log(
    chalk.green(
      `Copied "${name}" ${label} to clipboard (${text.length} chars)`,
    ),
  );
}
